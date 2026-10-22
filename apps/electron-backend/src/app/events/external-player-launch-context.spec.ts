import path from 'path';
import {
    getDefaultMpvPath,
    getDefaultVlcPath,
} from './external-player-launch-context';

const LOCAL_APP_DATA = 'C:\\Users\\tester\\AppData\\Local';

function pathExistsFor(existingPaths: string[]): (candidate: string) => boolean {
    return (candidatePath: string) => existingPaths.includes(candidatePath);
}

describe('default external player paths on Windows', () => {
    const originalLocalAppData = process.env.LOCALAPPDATA;

    afterEach(() => {
        if (originalLocalAppData === undefined) {
            delete process.env.LOCALAPPDATA;
        } else {
            process.env.LOCALAPPDATA = originalLocalAppData;
        }
    });

    it('finds the per-user VLC install under %LOCALAPPDATA%\\Programs', () => {
        process.env.LOCALAPPDATA = LOCAL_APP_DATA;
        const perUserVlc = path.win32.join(
            LOCAL_APP_DATA,
            'Programs',
            'VideoLAN',
            'VLC',
            'vlc.exe'
        );

        expect(
            getDefaultVlcPath({
                platform: 'win32',
                pathExists: pathExistsFor([perUserVlc]),
            })
        ).toBe(perUserVlc);
    });

    it('prefers the machine-wide VLC install over the per-user one', () => {
        process.env.LOCALAPPDATA = LOCAL_APP_DATA;
        const machineVlc = path.win32.join(
            'C:',
            'Program Files',
            'VideoLAN',
            'VLC',
            'vlc.exe'
        );
        const perUserVlc = path.win32.join(
            LOCAL_APP_DATA,
            'Programs',
            'VideoLAN',
            'VLC',
            'vlc.exe'
        );

        expect(
            getDefaultVlcPath({
                platform: 'win32',
                pathExists: pathExistsFor([machineVlc, perUserVlc]),
            })
        ).toBe(machineVlc);
    });

    it('finds the per-user mpv install under %LOCALAPPDATA%\\Programs', () => {
        process.env.LOCALAPPDATA = LOCAL_APP_DATA;
        const perUserMpv = path.win32.join(
            LOCAL_APP_DATA,
            'Programs',
            'mpv',
            'mpv.exe'
        );

        expect(
            getDefaultMpvPath({
                platform: 'win32',
                pathExists: pathExistsFor([perUserMpv]),
            })
        ).toBe(perUserMpv);
    });

    it('finds mpv through the WinGet Links directory', () => {
        process.env.LOCALAPPDATA = LOCAL_APP_DATA;
        const winGetLinksMpv = path.win32.join(
            LOCAL_APP_DATA,
            'Microsoft',
            'WinGet',
            'Links',
            'mpv.exe'
        );

        expect(
            getDefaultMpvPath({
                platform: 'win32',
                pathExists: pathExistsFor([winGetLinksMpv]),
            })
        ).toBe(winGetLinksMpv);
    });

    it('falls back to the bare player name when no install exists', () => {
        process.env.LOCALAPPDATA = LOCAL_APP_DATA;

        expect(
            getDefaultVlcPath({
                platform: 'win32',
                pathExists: pathExistsFor([]),
            })
        ).toBe('vlc');
        expect(
            getDefaultMpvPath({
                platform: 'win32',
                pathExists: pathExistsFor([]),
            })
        ).toBe('mpv');
    });

    it('falls back to the bare player name without LOCALAPPDATA', () => {
        delete process.env.LOCALAPPDATA;
        const machineMpv = path.win32.join(
            'C:',
            'Program Files',
            'mpv',
            'mpv.exe'
        );

        expect(
            getDefaultMpvPath({
                platform: 'win32',
                pathExists: pathExistsFor([machineMpv]),
            })
        ).toBe(machineMpv);
        expect(
            getDefaultMpvPath({
                platform: 'win32',
                pathExists: pathExistsFor([]),
            })
        ).toBe('mpv');
    });
});
