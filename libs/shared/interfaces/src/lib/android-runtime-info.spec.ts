import {
    ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION,
    isAndroidWebViewUpdateRequired,
    parseChromiumVersion,
} from './android-runtime-info';

describe('android runtime info helpers', () => {
    describe('parseChromiumVersion', () => {
        it('extracts the Chromium major version from a WebView user agent', () => {
            expect(
                parseChromiumVersion(
                    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
                )
            ).toBe(119);
        });

        it('reads the Electron bundled Chromium version', () => {
            expect(
                parseChromiumVersion(
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) iptv-player-new/1.0.0 Chrome/126.0.0.0 Electron/31.0.0 Safari/537.36'
                )
            ).toBe(126);
        });

        it('returns undefined for missing, empty or unparsable user agents', () => {
            expect(parseChromiumVersion(undefined)).toBeUndefined();
            expect(parseChromiumVersion(null)).toBeUndefined();
            expect(parseChromiumVersion('')).toBeUndefined();
            expect(parseChromiumVersion('Mozilla/5.0 (Linux)')).toBeUndefined();
            expect(parseChromiumVersion('Chrome/not-a-number')).toBeUndefined();
            expect(parseChromiumVersion('Chrome/0.0.0.0')).toBeUndefined();
            expect(parseChromiumVersion('Chrome/-3.0')).toBeUndefined();
        });
    });

    describe('isAndroidWebViewUpdateRequired', () => {
        it('blocks only known versions below the floor', () => {
            expect(
                isAndroidWebViewUpdateRequired(
                    ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION - 1
                )
            ).toBe(true);
            expect(
                isAndroidWebViewUpdateRequired(
                    ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION
                )
            ).toBe(false);
            expect(
                isAndroidWebViewUpdateRequired(
                    ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION + 1
                )
            ).toBe(false);
        });

        it('fails open when the version cannot be determined', () => {
            expect(isAndroidWebViewUpdateRequired(undefined)).toBe(false);
        });
    });
});
