/**
 * Runtime facts about the Android shell, shared by the Capacitor renderer
 * detector, the Electron bridge contract and the native WebView gate.
 *
 * Phase 1 can only prove `isNativeShell`, `isAndroid` and the WebView
 * Chromium version from inside the WebView. The TV/D-pad fields exist so the
 * bridge shape does not change when the native TV plugin lands (phase 3).
 */

/**
 * Chromium floor the Angular bundle needs (not the WebView floor Capacitor
 * itself documents, which is Chrome 60). The PWA build ships modern
 * language output (optional chaining, nullish coalescing, class fields) and
 * styles using `:focus-visible` (Chrome 86+) and CSS `aspect-ratio`
 * (Chrome 88+). Chromium 90 (April 2021) is the oldest line that runs all
 * of this without a transpilation fallback; anything older fails visibly
 * in the native gate instead of blank-screening.
 */
export const ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION = 90;

export interface AndroidRuntimeInfo {
    /** True inside any native Capacitor shell (Android today, iOS later). */
    readonly isNativeShell: boolean;
    /** True only for the Capacitor Android shell. */
    readonly isAndroid: boolean;
    /**
     * `UiModeManager.getCurrentModeType() == UI_MODE_TYPE_TELEVISION`, which
     * no WebView API can read. Stays `false` until the native TV bridge
     * plugin delivers it (phase 3); nothing may treat `false` as "phone"
     * when deciding D-pad behavior.
     */
    readonly isAndroidTv: boolean;
    /**
     * Not detectable from inside the WebView in phase 1: `pointer: coarse`
     * says touch-vs-mouse, not D-pad presence, and a TV box may pair a
     * mouse. Phase 3's spatial focus work decides input mode through the
     * native TV plugin instead; this field stays `false` until then.
     */
    readonly hasDpad: boolean;
    /**
     * Chromium major version of the rendering engine. The Electron main
     * process reports its bundled Chromium (`process.versions.chrome`);
     * the Android shell parses it from the WebView user agent. `undefined`
     * when the version cannot be determined.
     */
    readonly webViewVersion?: number;
}

/**
 * Extracts the Chromium major version from a WebView/Electron user agent
 * (`… Chrome/123.0.0.0 …`). Defensive on purpose: anything but a plain
 * positive integer in the first `Chrome/` token returns `undefined` so the
 * version gate can fail open instead of blocking working devices.
 */
export function parseChromiumVersion(
    userAgent: string | null | undefined
): number | undefined {
    const match = /Chrome\/(\d+)/.exec(userAgent ?? '');
    if (!match) {
        return undefined;
    }
    const major = Number.parseInt(match[1], 10);
    return Number.isFinite(major) && major > 0 ? major : undefined;
}

/**
 * Whether the WebView floor gate must refuse to start the bundle. Only a
 * *known* old version blocks: an unparsable or missing version fails open,
 * because a detection miss must never brick a device the bundle could run
 * on (see the phase 1 gate in `MainActivity`).
 */
export function isAndroidWebViewUpdateRequired(
    webViewVersion: number | undefined
): boolean {
    return (
        webViewVersion !== undefined &&
        webViewVersion < ANDROID_WEBVIEW_MIN_CHROMIUM_VERSION
    );
}
