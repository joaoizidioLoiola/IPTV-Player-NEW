import path, { resolve } from 'path';
import { fileURLToPath } from 'url';
import { classifyEpgSourceReference } from '@iptvnator/shared/interfaces';

/**
 * On Windows, `isAbsolute` also accepts POSIX-absolute paths like `/epg/x.xml`
 * (it treats them as drive-relative to the current drive). Accepting those
 * would silently turn a pasted Linux path into a file on `E:` — so only a
 * drive-letter path or a UNC path counts as local there.
 */
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^([a-z]:[\\/]|\\\\|\/\/)/i;

/**
 * The filesystem path behind an EPG source reference, or null when the
 * reference is not a local file (a remote link, an empty value or a relative
 * path). Shared by the main-process authorizer and the worker so both agree
 * on which string names which file: a `file:` URL and the plain path it
 * encodes normalize to the same value.
 */
export function resolveLocalEpgSourcePath(
    reference: string,
    platform: NodeJS.Platform = process.platform
): string | null {
    const trimmed = reference.trim();
    if (classifyEpgSourceReference(trimmed) !== 'local') {
        return null;
    }
    if (/^file:/i.test(trimmed)) {
        try {
            return resolve(fileURLToPath(trimmed));
        } catch {
            return null;
        }
    }
    if (platform === 'win32') {
        return WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)
            ? path.win32.resolve(trimmed)
            : null;
    }
    // POSIX paths resolve with posix semantics, even when a posix platform
    // is simulated on a win32 host in tests.
    return path.posix.isAbsolute(trimmed) ? path.posix.resolve(trimmed) : null;
}
