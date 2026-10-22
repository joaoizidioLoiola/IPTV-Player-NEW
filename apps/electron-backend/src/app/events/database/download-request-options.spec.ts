import { createFileName, sanitizeFilename } from './download-request-options';

describe('sanitizeFilename', () => {
    it('replaces characters NTFS forbids in file names', () => {
        expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe(
            'a_b_c_d_e_f_g_h_i_j'
        );
    });

    it('keeps ordinary titles untouched', () => {
        expect(sanitizeFilename('S01E01 - My Episode')).toBe(
            'S01E01 - My Episode'
        );
    });

    it('suffixes reserved Windows device names', () => {
        expect(sanitizeFilename('CON')).toBe('CON_');
        expect(sanitizeFilename('NUL')).toBe('NUL_');
        expect(sanitizeFilename('com4')).toBe('com4_');
        expect(sanitizeFilename('LPT9')).toBe('LPT9_');
    });

    it('suffixes reserved device names even when they carry an extension', () => {
        expect(sanitizeFilename('CON.ts')).toBe('CON_.ts');
        expect(sanitizeFilename('aux.mp4')).toBe('aux_.mp4');
    });

    it('strips trailing dots and spaces NTFS would drop or reject', () => {
        expect(sanitizeFilename('name. ')).toBe('name');
        expect(sanitizeFilename('name...')).toBe('name');
        expect(sanitizeFilename('  padded name  ')).toBe('padded name');
    });

    it('removes control characters', () => {
        expect(sanitizeFilename('a\u0007b')).toBe('ab');
        expect(sanitizeFilename('a\nb')).toBe('ab');
        expect(sanitizeFilename('a\u007fb')).toBe('ab');
    });

    it('truncates long titles while preserving the extension', () => {
        const longTitle = 'a'.repeat(300);
        const sanitized = sanitizeFilename(longTitle + '.mp4');

        expect(Buffer.byteLength(sanitized, 'utf8')).toBeLessThanOrEqual(120);
        expect(sanitized.endsWith('.mp4')).toBe(true);
        expect(sanitized).toMatch(/^a+\.mp4$/);
    });

    it('truncates long titles without an extension', () => {
        const sanitized = sanitizeFilename('b'.repeat(300));

        expect(Buffer.byteLength(sanitized, 'utf8')).toBe(120);
    });
});

describe('createFileName', () => {
    it('appends the URL extension to the sanitized title', () => {
        expect(createFileName('My Episode', 'https://host/file.mkv')).toBe(
            'My Episode.mkv'
        );
    });

    it('falls back to .mp4 when the URL has no extension', () => {
        expect(createFileName('My Episode', 'https://host/stream')).toBe(
            'My Episode.mp4'
        );
    });

    it('sanitizes unsafe URL extensions', () => {
        expect(createFileName('x', 'https://host/file:.ts')).toBe('x.ts');
    });
});
