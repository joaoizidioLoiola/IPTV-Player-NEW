import type { AndroidRuntimeInfo } from '@iptvnator/shared/interfaces';
import { parseChromiumVersion } from '@iptvnator/shared/interfaces';
import { ANDROID_RUNTIME_GET_INFO } from '@iptvnator/shared/interfaces/ipc-commands';

/** Minimal slice of `process.versions` the info builder reads. */
interface ChromiumVersions {
    readonly chrome?: string;
}

/**
 * Electron-side answer for `androidRuntimeInfo()`.
 *
 * Electron has no Android runtime: the Capacitor Android shell loads the
 * web bundle directly and detects itself in the renderer through
 * `window.Capacitor` (libs/services `android-runtime.ts`), so this always
 * reports a non-Android shell. It exists to keep one typed runtime-info
 * contract for every shell; the bundled Chromium version is the WebView
 * version of the desktop build, parsed with the same defensive helper the
 * Android user-agent path uses.
 */
export function buildAndroidRuntimeInfo(
    versions: ChromiumVersions | undefined
): AndroidRuntimeInfo {
    return {
        isNativeShell: false,
        isAndroid: false,
        isAndroidTv: false,
        hasDpad: false,
        webViewVersion: parseChromiumVersion(versions?.chrome),
    };
}

/**
 * Registers the `ANDROID_RUNTIME_GET_INFO` invoke. Injectable `ipcMain`
 * keeps the module unit-testable without importing `electron`.
 */
export function registerAndroidRuntimeInfoHandler(
    ipcMainLike: Pick<Electron.IpcMain, 'handle'>
): void {
    ipcMainLike.handle(ANDROID_RUNTIME_GET_INFO, () =>
        buildAndroidRuntimeInfo(process.versions)
    );
}
