import {
    detectAndroidRuntime,
    isAndroidWebViewUpdateRequiredFrom,
    isNativeCapacitorShell,
    loadNativeAndroidRuntimeInfo,
    readCapacitorBridgeGlobal,
    readWindowCapacitorGlobal,
} from './android-runtime';

describe('Android runtime detection', () => {
    describe('isNativeCapacitorShell', () => {
        it('accepts the injected isNativePlatform signal', () => {
            expect(
                isNativeCapacitorShell({ isNativePlatform: () => true })
            ).toBe(true);
            expect(
                isNativeCapacitorShell({ isNativePlatform: () => false })
            ).toBe(false);
        });

        it('falls back to getPlatform when isNativePlatform is absent', () => {
            expect(isNativeCapacitorShell({ getPlatform: () => 'android' })).toBe(
                true
            );
            expect(isNativeCapacitorShell({ getPlatform: () => 'web' })).toBe(
                false
            );
        });

        it('rejects absent, non-object and capability-less globals', () => {
            expect(isNativeCapacitorShell(undefined)).toBe(false);
            expect(isNativeCapacitorShell(null)).toBe(false);
            expect(isNativeCapacitorShell('android')).toBe(false);
            expect(isNativeCapacitorShell({})).toBe(false);
        });
    });

    describe('detectAndroidRuntime', () => {
        it('reports the Capacitor Android shell with its WebView version', () => {
            expect(
                detectAndroidRuntime({
                    capacitorGlobal: {
                        isNativePlatform: () => true,
                        getPlatform: () => 'android',
                    },
                    userAgent:
                        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
                })
            ).toEqual({
                isNativeShell: true,
                isAndroid: true,
                isAndroidTv: false,
                hasDpad: false,
                webViewVersion: 121,
            });
        });

        it('does not report Android for a native non-Android shell', () => {
            const info = detectAndroidRuntime({
                capacitorGlobal: {
                    isNativePlatform: () => true,
                    getPlatform: () => 'ios',
                },
            });
            expect(info.isNativeShell).toBe(true);
            expect(info.isAndroid).toBe(false);
        });

        it('falls back to the legacy platform alias for the platform name', () => {
            expect(
                detectAndroidRuntime({
                    capacitorGlobal: {
                        isNativePlatform: () => true,
                        platform: 'android',
                    },
                }).isAndroid
            ).toBe(true);
        });

        it('reports a plain browser PWA load as non-native', () => {
            const info = detectAndroidRuntime({
                capacitorGlobal: undefined,
                userAgent:
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            });
            expect(info.isNativeShell).toBe(false);
            expect(info.isAndroid).toBe(false);
            expect(info.webViewVersion).toBe(126);
        });

        it('keeps isAndroidTv and hasDpad false: no WebView API can prove them', () => {
            const info = detectAndroidRuntime({
                capacitorGlobal: {
                    isNativePlatform: () => true,
                    getPlatform: () => 'android',
                },
            });
            expect(info.isAndroidTv).toBe(false);
            expect(info.hasDpad).toBe(false);
        });
    });

    describe('isAndroidWebViewUpdateRequiredFrom', () => {
        it('requires an update only for known old WebView versions', () => {
            expect(
                isAndroidWebViewUpdateRequiredFrom({
                    capacitorGlobal: {
                        isNativePlatform: () => true,
                        getPlatform: () => 'android',
                    },
                    userAgent: '… Chrome/89.0.0.0 …',
                })
            ).toBe(true);
            expect(
                isAndroidWebViewUpdateRequiredFrom({
                    capacitorGlobal: {
                        isNativePlatform: () => true,
                        getPlatform: () => 'android',
                    },
                    userAgent: '… Chrome/90.0.0.0 …',
                })
            ).toBe(false);
            expect(
                isAndroidWebViewUpdateRequiredFrom({
                    capacitorGlobal: {
                        isNativePlatform: () => true,
                        getPlatform: () => 'android',
                    },
                    userAgent: 'no version token',
                })
            ).toBe(false);
        });
    });

    describe('bridge global readers', () => {
        it('reads the Capacitor global off a window object', () => {
            const capacitorGlobal = { isNativePlatform: () => true };
            expect(
                readCapacitorBridgeGlobal({ Capacitor: capacitorGlobal })
            ).toBe(capacitorGlobal);
            expect(readCapacitorBridgeGlobal({})).toBeUndefined();
            expect(readCapacitorBridgeGlobal(undefined)).toBeUndefined();
            expect(
                readCapacitorBridgeGlobal({ Capacitor: 'not-an-object' })
            ).toBeUndefined();
        });

        it('returns undefined when window itself is absent', () => {
            expect(readWindowCapacitorGlobal()).toBeUndefined();
        });
    });

    describe('loadNativeAndroidRuntimeInfo', () => {
        const androidShell = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
        };

        it('returns the TV mode answered by the native plugin', async () => {
            const answer = await loadNativeAndroidRuntimeInfo({
                ...androidShell,
                Plugins: {
                    NativeRuntime: {
                        getIsTv: async () => ({ isTv: true }),
                    },
                },
            });

            expect(answer).toEqual({ isAndroidTv: true });
        });

        it('does not ask a plain browser PWA load', async () => {
            let called = false;

            const answer = await loadNativeAndroidRuntimeInfo({
                isNativePlatform: () => false,
                Plugins: {
                    NativeRuntime: {
                        getIsTv: async () => {
                            called = true;
                            return { isTv: true };
                        },
                    },
                },
            });

            expect(answer).toBeUndefined();
            expect(called).toBe(false);
        });

        it('keeps the conservative default when the plugin is absent', async () => {
            expect(await loadNativeAndroidRuntimeInfo(androidShell)).toBeUndefined();
            expect(
                await loadNativeAndroidRuntimeInfo({
                    ...androidShell,
                    Plugins: {},
                })
            ).toBeUndefined();
        });

        it('ignores rejected and malformed answers', async () => {
            expect(
                await loadNativeAndroidRuntimeInfo({
                    ...androidShell,
                    Plugins: {
                        NativeRuntime: {
                            getIsTv: () => Promise.reject(new Error('no bridge')),
                        },
                    },
                })
            ).toBeUndefined();

            expect(
                await loadNativeAndroidRuntimeInfo({
                    ...androidShell,
                    Plugins: {
                        NativeRuntime: {
                            getIsTv: async () => ({ isTv: 'yes' }),
                        },
                    },
                })
            ).toBeUndefined();
        });
    });
});
