import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell for the Android runtime (phase 0).
 *
 * `webDir` points at the PWA build output of `apps/web`
 * (`nx build web --configuration=pwa` → `dist/apps/web`, `baseHref: "/"`).
 * The `production` configuration uses `baseHref: "./"` and is not servable
 * from the Capacitor WebView, so the shell must only be synced from the
 * `pwa` configuration.
 */
const config: CapacitorConfig = {
    appId: 'com.iptvplayernew.desktop',
    appName: 'IPTV Player NEW',
    webDir: '../../dist/apps/web',
    android: {
        // Capacitor WebView serves the bundle from an https:// origin on
        // localhost; keeps web platform APIs (storage, fetch) working.
        scheme: 'https',
    },
};

export default config;
