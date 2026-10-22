import type { AndroidRuntimeInfo } from '@iptvnator/shared/interfaces';
import {
    isAndroidWebViewUpdateRequired,
    parseChromiumVersion,
} from '@iptvnator/shared/interfaces';

/**
 * Minimal structural view of the `window.Capacitor` global the Capacitor
 * bridge injects. Typed structurally on purpose: neither the PWA build nor
 * libs/services depend on `@capacitor/core`, so the detector must never
 * import it — a web/PWA load simply has no `Capacitor` global.
 */
export interface CapacitorBridgeGlobal {
    /** `true` on every native platform; `false` in a plain browser page. */
    isNativePlatform?: () => boolean;
    /** `'android' | 'ios' | 'web'` on current Capacitor runtimes. */
    getPlatform?: () => string;
    /** Legacy string alias some Capacitor versions expose. */
    platform?: string;
}

/**
 * Reads `window.Capacitor` defensively. Node-side callers and browsers
 * without the bridge get `undefined`.
 */
export function readCapacitorBridgeGlobal(
    win: { Capacitor?: unknown } | undefined | null
): CapacitorBridgeGlobal | undefined {
    const candidate = win?.Capacitor;
    if (typeof candidate !== 'object' || candidate === null) {
        return undefined;
    }
    return candidate as CapacitorBridgeGlobal;
}

/** Window-level convenience wrapper used by runtime-side services. */
export function readWindowCapacitorGlobal(): CapacitorBridgeGlobal | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    return readCapacitorBridgeGlobal(window as { Capacitor?: unknown });
}

/**
 * True when the page runs inside a native Capacitor shell. `window.electron`
 * is never present there, so this is the positive signal the Electron
 * detection cannot give (the Capacitor WebView serves the PWA bundle from
 * `https:` on localhost, which an ordinary browser PWA load cannot be told
 * apart from by protocol alone).
 */
export function isNativeCapacitorShell(capacitorGlobal: unknown): boolean {
    if (typeof capacitorGlobal !== 'object' || capacitorGlobal === null) {
        return false;
    }
    const bridge = capacitorGlobal as CapacitorBridgeGlobal;
    if (typeof bridge.isNativePlatform === 'function') {
        return bridge.isNativePlatform() === true;
    }
    if (typeof bridge.getPlatform === 'function') {
        return bridge.getPlatform() !== 'web';
    }
    return false;
}

/** Inputs for {@link detectAndroidRuntime}; all optional so tests inject. */
export interface AndroidRuntimeInputs {
    readonly capacitorGlobal?: unknown;
    readonly userAgent?: string;
}

/**
 * Phase-1 detection of the Android shell. `isAndroidTv` and `hasDpad` are
 * always `false` here — see `AndroidRuntimeInfo` for why no WebView API
 * answer is trustworthy; the phase 3 native TV bridge plugin owns them.
 */
export function detectAndroidRuntime(
    inputs: AndroidRuntimeInputs
): AndroidRuntimeInfo {
    const isNativeShell = isNativeCapacitorShell(inputs.capacitorGlobal);
    let platformName: string | undefined;
    if (isNativeShell && typeof inputs.capacitorGlobal === 'object') {
        const bridge = inputs.capacitorGlobal as CapacitorBridgeGlobal;
        if (typeof bridge.getPlatform === 'function') {
            platformName = bridge.getPlatform();
        } else if (typeof bridge.platform === 'string') {
            platformName = bridge.platform;
        }
    }
    return {
        isNativeShell,
        isAndroid: isNativeShell && platformName === 'android',
        isAndroidTv: false,
        hasDpad: false,
        webViewVersion: parseChromiumVersion(inputs.userAgent),
    };
}

/**
 * Minimal structural view of the `window.Capacitor.Plugins` proxy for the
 * shell-owned plugin. Only the method this layer calls is described.
 */
export interface NativeRuntimePluginBridge {
    getIsTv?: () => Promise<{ isTv?: unknown } | undefined>;
}

interface CapacitorPluginsGlobal {
    Plugins?: { NativeRuntime?: NativeRuntimePluginBridge };
}

/**
 * Asks the native shell for the facts the WebView cannot read (currently the
 * TV mode through `UiModeManager`). Returns `undefined` outside a native
 * shell, when the plugin is absent, or when the answer is malformed, so the
 * caller keeps the conservative phase-1 defaults instead of failing.
 */
export async function loadNativeAndroidRuntimeInfo(
    capacitorGlobal: unknown
): Promise<Partial<AndroidRuntimeInfo> | undefined> {
    if (!isNativeCapacitorShell(capacitorGlobal)) {
        return undefined;
    }

    const plugin = (capacitorGlobal as CapacitorPluginsGlobal).Plugins
        ?.NativeRuntime;
    if (!plugin || typeof plugin.getIsTv !== 'function') {
        return undefined;
    }

    try {
        const result = await plugin.getIsTv();
        if (typeof result?.isTv !== 'boolean') {
            return undefined;
        }
        return { isAndroidTv: result.isTv };
    } catch {
        return undefined;
    }
}

/** Whether the bundle must refuse to start until the WebView is updated. */
export function isAndroidWebViewUpdateRequiredFrom(
    inputs: AndroidRuntimeInputs
): boolean {
    return isAndroidWebViewUpdateRequired(
        detectAndroidRuntime(inputs).webViewVersion
    );
}
