import { Injectable } from '@angular/core';
import type { AndroidRuntimeInfo } from '@iptvnator/shared/interfaces';
import { ElectronBridgeApi } from '@iptvnator/shared/interfaces';
import {
    detectAndroidRuntime,
    isAndroidWebViewUpdateRequiredFrom,
    loadNativeAndroidRuntimeInfo,
    readWindowCapacitorGlobal,
} from './android-runtime';

export type RuntimeEnvironment = 'electron' | 'pwa';

type RuntimeElectronBridge = Partial<ElectronBridgeApi>;

// Ordinary playback methods include season batches, so partial bridges use
// the in-memory path instead of throwing mid-action. Atomic backup restore is
// checked separately by a restore-only preflight; it never changes data-source
// selection or disables ordinary SQLite reads and playback writes.
const playbackPositionStorageMethods = [
    'dbSavePlaybackPosition',
    'dbGetPlaybackPosition',
    'dbGetSeriesPlaybackPositions',
    'dbGetRecentPlaybackPositions',
    'dbGetAllPlaybackPositions',
    'dbClearAllPlaybackPositions',
    'dbClearPlaybackPosition',
    'dbSavePlaybackPositionsBatch',
    'dbClearPlaybackPositionsBatch',
];

@Injectable({ providedIn: 'root' })
export class RuntimeCapabilitiesService {
    private androidRuntimeState: AndroidRuntimeInfo | undefined;

    get environment(): RuntimeEnvironment {
        return this.isElectron ? 'electron' : 'pwa';
    }

    get isElectron(): boolean {
        return !!this.electronBridge;
    }

    get isPwa(): boolean {
        return !this.isElectron;
    }

    /**
     * Android shell facts, detected once. The Electron bridge answer is not
     * consulted: Electron never runs on Android, and the Capacitor shell
     * carries no Electron bridge — the renderer reads `window.Capacitor`
     * directly (`android-runtime.ts`).
     */
    private get androidRuntime(): ReturnType<typeof detectAndroidRuntime> {
        if (this.androidRuntimeState === undefined) {
            this.androidRuntimeState = detectAndroidRuntime({
                capacitorGlobal: readWindowCapacitorGlobal(),
                userAgent: navigator?.userAgent,
            });
        }
        return this.androidRuntimeState;
    }

    /** True inside any native Capacitor shell (positive capability). */
    get isNativeShell(): boolean {
        return this.androidRuntime.isNativeShell;
    }

    /** True only inside the Capacitor Android shell (positive capability). */
    get isAndroid(): boolean {
        return this.androidRuntime.isAndroid;
    }

    /**
     * Always false in phase 1: no WebView API can read `UiModeManager`, so
     * the value must come from the native TV bridge plugin (phase 3). Never
     * treat `false` as "phone" for D-pad decisions — see AndroidRuntimeInfo.
     */
    get isAndroidTv(): boolean {
        return this.androidRuntime.isAndroidTv;
    }

    /**
     * False until the phase 2 Media3 plugin ships: the WebView `<video>`
     * element cannot play MPEG-TS/RTSP/UDP linear streams, so native
     * playback must not be claimed before the plugin is registered.
     */
    get supportsNativePlayer(): boolean {
        return false;
    }

    /** WebView floor gate (phase 1 detection; the phase 3 screen consumes it). */
    get androidWebViewUpdateRequired(): boolean {
        return isAndroidWebViewUpdateRequiredFrom({
            capacitorGlobal: readWindowCapacitorGlobal(),
            userAgent: navigator?.userAgent,
        });
    }

    /**
     * Asks the Android shell for facts the WebView cannot read and folds them
     * into the cached detection (`UiModeManager` today). Outside the native
     * shell, without the plugin, or on a malformed answer, the conservative
     * phase-1 defaults stay in place. Idempotent: safe to call at boot and
     * again when a TV screen mounts.
     */
    async loadNativeRuntimeInfo(): Promise<AndroidRuntimeInfo> {
        const nativeInfo = await loadNativeAndroidRuntimeInfo(
            readWindowCapacitorGlobal()
        );
        if (nativeInfo) {
            this.androidRuntimeState = {
                ...this.androidRuntime,
                ...nativeInfo,
            };
        }
        return this.androidRuntime;
    }

    get platform(): string | undefined {
        const platform = this.electronBridge?.['platform'];
        return typeof platform === 'string' ? platform : undefined;
    }

    get isMacOS(): boolean {
        return this.platform === 'darwin';
    }

    get isWindows(): boolean {
        return this.platform === 'win32';
    }

    get isLinux(): boolean {
        return this.platform === 'linux';
    }

    /**
     * True when the window has no native title bar and the renderer must
     * draw its own window-management buttons (Windows/Linux). macOS keeps
     * the native traffic lights instead.
     */
    get usesCustomWindowControls(): boolean {
        return (
            (this.isWindows || this.isLinux) &&
            [
                'minimizeWindow',
                'toggleMaximizeWindow',
                'closeWindow',
                'getWindowState',
                'onWindowStateChange',
            ].every((methodName) => this.hasElectronMethod(methodName))
        );
    }

    /**
     * The main process forwards the window's platform Back gestures (mouse
     * Back buttons and Browser Back through `app-command` on Windows/Linux,
     * the trackpad swipe on macOS) to the workspace Back.
     */
    get supportsWindowBackGestures(): boolean {
        return this.hasElectronMethod('onWindowBackRequested');
    }

    /** Desktop-only preference: PWA clients cannot configure the shared server guard. */
    get supportsPortalConnectivityGuard(): boolean {
        return (
            this.hasElectronMethod('updateSettings') &&
            this.hasElectronMethod('resetHostConnectivityGuard')
        );
    }

    /**
     * Desktop window mode at launch (normal / maximized / fullscreen) plus
     * the F11 toggle. The mode reaches the main process through
     * `updateSettings`, and the toggle is what makes a fullscreen launch
     * escapable on Windows/Linux, where the title bar is hidden — so the
     * setting is offered only when both halves exist.
     */
    get supportsStartupWindowMode(): boolean {
        return (
            this.hasElectronMethod('updateSettings') &&
            this.hasElectronMethod('toggleFullScreenWindow')
        );
    }

    get supportsSourceHealth(): boolean {
        return (
            this.hasElectronMethod('probeM3uSource') &&
            this.hasElectronMethod('cancelSourceProbe')
        );
    }

    get supportsEpg(): boolean {
        return (
            this.supportsEpgImport &&
            this.supportsEpgProgramLookup &&
            this.supportsEpgSourceFreshness &&
            this.supportsEpgDataManagement &&
            this.supportsEpgGuide &&
            this.supportsEpgProgramSearch
        );
    }

    get supportsEpgImport(): boolean {
        return this.hasElectronMethod('fetchEpg');
    }

    /** Native file picker for local XMLTV sources (Settings → EPG, playlist dialog). */
    get supportsEpgFilePicker(): boolean {
        return this.hasElectronMethod('openEpgFileDialog');
    }

    get supportsEpgProgress(): boolean {
        return this.hasElectronMethod('onEpgProgress');
    }

    get supportsEpgProgramLookup(): boolean {
        return this.hasElectronMethod('getChannelPrograms');
    }

    get supportsEpgCurrentProgramBatch(): boolean {
        return this.hasElectronMethod('getCurrentProgramsBatch');
    }

    get supportsEpgChannelMetadata(): boolean {
        return this.hasElectronMethod('getEpgChannelMetadata');
    }

    get supportsEpgSourceFreshness(): boolean {
        return this.hasElectronMethod('checkEpgFreshness');
    }

    get supportsEpgDataManagement(): boolean {
        return (
            this.hasElectronMethod('forceFetchEpg') &&
            this.hasElectronMethod('clearEpgData') &&
            this.hasElectronMethod('clearEpgDataForSource')
        );
    }

    /** Both guide reads exist: programmes for a channel batch and coverage. */
    get supportsEpgGuide(): boolean {
        return (
            this.hasElectronMethod('getEpgProgramsForChannels') &&
            this.hasElectronMethod('getEpgProgramCoverage')
        );
    }

    get supportsEpgProgramSearch(): boolean {
        return this.hasElectronMethod('searchEpgPrograms');
    }

    get supportsEpgMapping(): boolean {
        return (
            this.hasElectronMethod('getEpgMapping') &&
            this.hasElectronMethod('setEpgMapping') &&
            this.hasElectronMethod('deleteEpgMapping') &&
            this.hasElectronMethod('searchEpgChannels')
        );
    }

    get supportsSqlite(): boolean {
        return [
            'dbDeleteAllPlaylists',
            'dbDeletePlaylist',
            'dbGetAppPlaylist',
            'dbGetAppPlaylists',
            'dbGetAppState',
            'dbSetAppState',
            'dbUpsertAppPlaylist',
            'dbUpsertAppPlaylists',
        ].every((methodName) => this.hasElectronMethod(methodName));
    }

    /**
     * The worker-side parental lock filter: the lock state reaches the
     * SQLite worker and the `categories.locked` index can be stamped. When
     * the Xtream SQLite data source is used without it, the worker cannot
     * withhold locked rows and the lock service fails closed instead.
     */
    get supportsParentalLockSqliteFilter(): boolean {
        return (
            this.hasElectronMethod('setParentalLockState') &&
            this.hasElectronMethod('dbSetCategoryLocks')
        );
    }

    get supportsXtreamSqliteDataSource(): boolean {
        return [
            'dbGetPlaylist',
            'dbCreatePlaylist',
            'dbUpdatePlaylist',
            'dbDeletePlaylist',
            'dbHasCategories',
            'dbGetCategories',
            'dbSaveCategories',
            'dbGetAllCategories',
            'dbUpdateCategoryVisibility',
            'dbHasContent',
            'dbGetContent',
            'dbSaveContent',
            'dbGetAppState',
            'dbSetAppState',
            'dbSearchContent',
            'dbGetFavorites',
            'dbGetFavoritesForBackup',
            'dbAddFavorite',
            'dbRemoveFavorite',
            'dbIsFavorite',
            'dbGetRecentItems',
            'dbAddRecentItem',
            'dbRemoveRecentItem',
            'dbClearPlaylistRecentItems',
            'dbGetContentByXtreamId',
            ...playbackPositionStorageMethods,
            'dbDeleteXtreamContent',
            'dbRestoreXtreamUserData',
            'dbRestoreXtreamFavorites',
        ].every((methodName) => this.hasElectronMethod(methodName));
    }

    get supportsPlaybackPositionStorage(): boolean {
        return playbackPositionStorageMethods.every((methodName) =>
            this.hasElectronMethod(methodName)
        );
    }

    get supportsPlaybackPositionUpdates(): boolean {
        return this.hasElectronMethod('onPlaybackPositionUpdate');
    }

    get supportsDownloads(): boolean {
        return [
            'downloadsStart',
            'downloadsCancel',
            'downloadsPause',
            'downloadsResume',
            'downloadsRetry',
            'downloadsRedownloadMissing',
            'downloadsRemove',
            'downloadsGetList',
            'downloadsGet',
            'downloadsGetDefaultFolder',
            'downloadsSelectFolder',
            'downloadsRevealFile',
            'downloadsPlayFile',
            'downloadsClearCompleted',
            'onDownloadsUpdate',
        ].every((methodName) => this.hasElectronMethod(methodName));
    }

    // Deliberately separate from supportsDownloads: that allowlist is
    // all-or-nothing, and folding the recordings bridge into it would make
    // older Electron builds lose the entire download manager.
    get supportsRecordings(): boolean {
        return [
            'recordingsGetList',
            'recordingsGet',
            'recordingsStop',
            'recordingsRemove',
            'recordingsUpdatePrograms',
            'recordingsRevealFile',
            'recordingsPlayFile',
            'onRecordingsUpdate',
        ].every((methodName) => this.hasElectronMethod(methodName));
    }

    get supportsPortalActivityStorage(): boolean {
        return [
            'dbGetPlaylist',
            'dbRestoreXtreamFavorites',
            'dbGetRecentlyViewed',
            'dbClearRecentlyViewed',
            'dbGetAllGlobalFavorites',
            'dbGetGlobalRecentlyAdded',
            'dbAddFavorite',
            'dbRemoveFavorite',
            'dbGetFavorites',
            'dbReorderGlobalFavorites',
            'dbGetRecentItems',
            'dbAddRecentItem',
            'dbClearPlaylistRecentItems',
            'dbRemoveRecentItem',
            'dbRemoveRecentItemsBatch',
            'dbGetContentByXtreamId',
        ].every((methodName) => this.hasElectronMethod(methodName));
    }

    get supportsAppStateStorage(): boolean {
        return ['dbGetAppState', 'dbSetAppState'].every((methodName) =>
            this.hasElectronMethod(methodName)
        );
    }

    get supportsStalkerPlaylistSqliteSync(): boolean {
        return ['dbGetPlaylist', 'dbCreatePlaylist'].every((methodName) =>
            this.hasElectronMethod(methodName)
        );
    }

    get supportsPlaylistRefresh(): boolean {
        return [
            'refreshPlaylist',
            'cancelPlaylistRefresh',
            'onPlaylistRefreshEvent',
        ].every((methodName) => this.hasElectronMethod(methodName));
    }

    get supportsManagedExternalPlayers(): boolean {
        return ['openInMpv', 'openInVlc'].every((methodName) =>
            this.hasElectronMethod(methodName)
        );
    }

    get supportsExternalPlayerPathSettings(): boolean {
        return ['setMpvPlayerPath', 'setVlcPlayerPath'].every((methodName) =>
            this.hasElectronMethod(methodName)
        );
    }

    get supportsEmbeddedMpv(): boolean {
        return this.hasElectronMethod('prepareEmbeddedMpv');
    }

    get supportsDesktopFileSave(): boolean {
        return (
            this.hasElectronMethod('saveFileDialog') &&
            this.hasElectronMethod('writeFile')
        );
    }

    get supportsRemoteControl(): boolean {
        return (
            this.hasElectronMethod('updateRemoteControlStatus') &&
            this.hasElectronMethod('onChannelChange') &&
            this.hasElectronMethod('onRemoteControlCommand')
        );
    }

    get supportsXtreamSectionNavigation(): boolean {
        return (
            this.isPwa ||
            this.supportsXtreamSqliteDataSource ||
            this.hasElectronMethod('xtreamRequest')
        );
    }

    private hasElectronMethod(methodName: string): boolean {
        const bridge = this.electronBridge as
            Record<string, unknown> | undefined;
        return typeof bridge?.[methodName] === 'function';
    }

    private get electronBridge(): RuntimeElectronBridge | undefined {
        if (typeof window === 'undefined') {
            return undefined;
        }

        return window.electron;
    }
}
