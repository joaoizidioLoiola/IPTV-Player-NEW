import { AppConfig } from '../../environments/environment';
import { isNativeCapacitorShell } from '@iptvnator/services';

export interface IptvnatorRuntimeConfig {
    readonly BACKEND_URL?: string;
}

export function resolveBackendUrl(
    runtimeConfig: IptvnatorRuntimeConfig | undefined,
    fallbackUrl: string
): string {
    const runtimeUrl = runtimeConfig?.BACKEND_URL?.trim();
    return runtimeUrl || fallbackUrl;
}

export function getRuntimeBackendUrl(): string {
    return resolveBackendUrl(
        globalThis.window?.__IPTVNATOR_CONFIG__,
        AppConfig.BACKEND_URL
    );
}

export interface ServiceWorkerRuntimeContext {
    readonly electronBridge?: unknown;
    /** The `window.Capacitor` global when a native shell injected one. */
    readonly capacitorBridge?: unknown;
    readonly protocol?: string;
}

function getDefaultServiceWorkerRuntimeContext(): ServiceWorkerRuntimeContext {
    const browserWindow = globalThis.window as
        | (Window & { electron?: unknown; Capacitor?: unknown })
        | undefined;

    return {
        electronBridge: browserWindow?.electron,
        capacitorBridge: browserWindow?.Capacitor,
        protocol:
            browserWindow?.location?.protocol ?? globalThis.location?.protocol,
    };
}

export function shouldEnableServiceWorker(
    production = AppConfig.production,
    navigatorRef: Navigator | undefined = globalThis.navigator,
    runtimeContext = getDefaultServiceWorkerRuntimeContext()
): boolean {
    return (
        production &&
        !!navigatorRef &&
        'serviceWorker' in navigatorRef &&
        !runtimeContext.electronBridge &&
        // Native shell: the Capacitor WebView also serves the bundle from an
        // https: localhost origin, but a registered worker would pin stale
        // chunks inside the APK — the shell must always serve its own assets.
        !isNativeCapacitorShell(runtimeContext.capacitorBridge) &&
        runtimeContext.protocol !== 'file:'
    );
}
