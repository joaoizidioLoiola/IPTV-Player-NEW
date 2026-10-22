import { execFile } from 'child_process';

/**
 * Bound for each process query spawn. The probes run once per startup pass
 * (not once per pid), so a hung process query degrades to the conservative
 * fallback instead of blocking startup indefinitely.
 */
const PROCESS_PROBE_TIMEOUT_MS = 2_000;

export interface ExternalProcessInfo {
    /** Lowercased executable/process name, or '' when unreadable. */
    name: string;
    /** Epoch ms the process started, or null when unreadable. */
    startMs: number | null;
}

function execFileText(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            command,
            args,
            {
                encoding: 'utf8',
                timeout: PROCESS_PROBE_TIMEOUT_MS,
                // Without this, powershell.exe/tasklist would flash a
                // console window during startup on Windows.
                windowsHide: true,
            },
            (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(typeof stdout === 'string' ? stdout : String(stdout));
            }
        );
    });
}

/** `[[dd-]hh:]mm:ss` from `ps -o etime=` → seconds, or null. */
function parseEtimeSeconds(etime: string): number | null {
    const match = /^(?:(\d+)-)?(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(etime);
    if (!match) {
        return null;
    }
    const [, days, hours, minutes, seconds] = match;
    return (
        (days ? Number(days) * 86_400 : 0) +
        (hours ? Number(hours) * 3_600 : 0) +
        Number(minutes) * 60 +
        Number(seconds)
    );
}

async function queryWindowsProcesses(
    pids: number[]
): Promise<Map<number, ExternalProcessInfo>> {
    // One PowerShell query answers every pid of the pass: a pipe-delimited
    // line per process. StartTime is access-protected on elevated processes,
    // hence the guarded read that degrades that field only.
    const script =
        `Get-Process -Id @(${pids.join(',')}) -ErrorAction SilentlyContinue | ` +
        "ForEach-Object { $start = ''; try { $start = $_.StartTime.ToUniversalTime().ToString('o') } catch {}; \"$($_.Id)|$($_.ProcessName)|$start\" }";
    const output = await execFileText('powershell.exe', [
        '-NoProfile',
        '-Command',
        script,
    ]);

    const infos = new Map<number, ExternalProcessInfo>();
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        const firstPipe = trimmed.indexOf('|');
        const lastPipe = trimmed.lastIndexOf('|');
        if (firstPipe <= 0 || lastPipe <= firstPipe) {
            continue;
        }
        const pid = Number(trimmed.slice(0, firstPipe));
        if (!Number.isInteger(pid)) {
            continue;
        }
        const startMs = Date.parse(trimmed.slice(lastPipe + 1));
        infos.set(pid, {
            name: trimmed.slice(firstPipe + 1, lastPipe).toLowerCase(),
            startMs: Number.isFinite(startMs) ? startMs : null,
        });
    }
    return infos;
}

async function queryPosixProcesses(
    pids: number[]
): Promise<Map<number, ExternalProcessInfo>> {
    const output = await execFileText('ps', [
        '-p',
        pids.join(','),
        '-o',
        'pid=,comm=,etime=',
    ]);

    const infos = new Map<number, ExternalProcessInfo>();
    for (const line of output.split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 3) {
            continue;
        }
        const pid = Number(fields[0]);
        if (!Number.isInteger(pid)) {
            continue;
        }
        // `comm=` may contain spaces; the etime column is always last.
        const elapsedSeconds = parseEtimeSeconds(fields[fields.length - 1]);
        infos.set(pid, {
            name: fields.slice(1, -1).join(' ').toLowerCase(),
            startMs:
                elapsedSeconds === null
                    ? null
                    : Date.now() - elapsedSeconds * 1_000,
        });
    }
    return infos;
}

/**
 * Name and start time of every given pid, from ONE process query per pass.
 * The returned map is the per-pid memoization: the caller reuses it for
 * every row instead of re-probing. On total failure the map stays empty and
 * the caller degrades per pid to its conservative verdict; pids missing
 * from a partial answer degrade the same way.
 */
export async function queryProcessInfos(
    pids: number[]
): Promise<Map<number, ExternalProcessInfo>> {
    const uniquePids = [...new Set(pids)];
    if (uniquePids.length === 0) {
        return new Map();
    }
    try {
        return process.platform === 'win32'
            ? await queryWindowsProcesses(uniquePids)
            : await queryPosixProcesses(uniquePids);
    } catch {
        return new Map();
    }
}
