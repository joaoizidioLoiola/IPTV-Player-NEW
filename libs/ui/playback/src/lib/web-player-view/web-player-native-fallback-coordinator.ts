import { effect, untracked, type Signal } from '@angular/core';
import type { PlaybackDiagnostic } from '@iptvnator/playback/util';
import type { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import type { NativePlayerService } from '@iptvnator/services';
import { shouldFallbackToNativePlayback } from './web-player-native-fallback';

export interface WebPlayerNativeFallbackDeps {
    diagnostic: Signal<PlaybackDiagnostic | null>;
    token: Signal<symbol>;
    nativePlayer: NativePlayerService;
    playback: Signal<ResolvedPortalPlayback | null>;
    streamUrl: Signal<string>;
    title: Signal<string>;
    isLive: Signal<boolean>;
    effectiveStartTime: Signal<number>;
}

/**
 * Hands a source the WebView could not decode to the Android Media3 player,
 * once per playback application. The component only owns the wiring; the
 * decision and the request stay here.
 */
export class WebPlayerNativeFallbackCoordinator {
    private fallbackToken: symbol | null = null;

    constructor(private readonly deps: WebPlayerNativeFallbackDeps) {}

    /** Must run inside an injection context (the component constructor). */
    attach(): void {
        effect(() => {
            const diagnostic = this.deps.diagnostic();
            const token = this.deps.token();
            if (
                !shouldFallbackToNativePlayback(
                    diagnostic,
                    token,
                    this.fallbackToken,
                    this.deps.nativePlayer.isAvailable()
                )
            ) {
                return;
            }
            untracked(() => {
                const playback = this.deps.playback();
                const url = playback?.streamUrl || this.deps.streamUrl();
                if (!url) {
                    return;
                }
                this.fallbackToken = token;
                void this.deps.nativePlayer.play({
                    url,
                    title: playback?.title || this.deps.title(),
                    contentType: this.deps.isLive() ? 'live' : 'vod',
                    userAgent: playback?.userAgent,
                    headers: buildNativePlaybackHeaders(playback),
                    startPositionMs: Math.max(
                        0,
                        Math.round(this.deps.effectiveStartTime() * 1000)
                    ),
                });
            });
        });
    }
}

/**
 * Merges the portal identity headers into one set for the native player.
 * `headers` already carries Cookie/Authorization/SN on Stalker; the three
 * named fields cover Xtream and custom M3U entries.
 */
function buildNativePlaybackHeaders(
    playback: ResolvedPortalPlayback | null
): Record<string, string> | undefined {
    const headers: Record<string, string> = { ...(playback?.headers ?? {}) };
    const add = (name: string, value: string | undefined) => {
        if (value && !headers[name]) {
            headers[name] = value;
        }
    };
    add('User-Agent', playback?.userAgent);
    add('Referer', playback?.referer);
    add('Origin', playback?.origin);
    return Object.keys(headers).length > 0 ? headers : undefined;
}
