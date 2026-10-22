import { join } from 'path';
import { pathToFileURL } from 'url';
import { resolveLocalEpgSourcePath } from './epg-local-source-path';

describe('resolveLocalEpgSourcePath', () => {
    const file = join(process.cwd(), 'epg', 'guide v2.xml.gz');

    it('maps a file URL and the plain path to the same normalized path', () => {
        expect(resolveLocalEpgSourcePath(pathToFileURL(file).href)).toBe(file);
        expect(resolveLocalEpgSourcePath(` ${file} `)).toBe(file);
        expect(
            resolveLocalEpgSourcePath(join(file, '..', 'guide v2.xml.gz'))
        ).toBe(file);
    });

    it('returns null for remote links, relative paths and empty values', () => {
        expect(
            resolveLocalEpgSourcePath('https://epg.example.org/guide.xml')
        ).toBeNull();
        expect(resolveLocalEpgSourcePath('epg/guide.xml')).toBeNull();
        expect(resolveLocalEpgSourcePath('')).toBeNull();
        expect(resolveLocalEpgSourcePath('file://')).toBeNull();
    });

    it('rejects POSIX-absolute paths on Windows instead of mapping them onto the current drive', () => {
        // `isAbsolute('/epg/x.xml')` is true on win32 (drive-relative), which
        // used to silently resolve to '<current drive>:\epg\x.xml'.
        expect(resolveLocalEpgSourcePath('/epg/guide.xml', 'win32')).toBeNull();

        // Drive and UNC paths stay valid local references on Windows.
        const drivePath = join(process.cwd(), 'epg', 'guide.xml');
        expect(resolveLocalEpgSourcePath(drivePath, 'win32')).toBe(drivePath);
        expect(
            resolveLocalEpgSourcePath('\\\\server\\share\\guide.xml', 'win32')
        ).toBe('\\\\server\\share\\guide.xml');
    });

    it('still accepts POSIX-absolute paths on POSIX platforms', () => {
        expect(
            resolveLocalEpgSourcePath('/epg/guide.xml', 'linux')
        ).toBe('/epg/guide.xml');
    });
});
