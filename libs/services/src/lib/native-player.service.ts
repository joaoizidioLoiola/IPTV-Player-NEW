import { Injectable } from '@angular/core';

export type NativePlayerContentType = 'live' | 'vod' | 'series';

export interface NativePlayerPlayback {
    readonly url: string;
    readonly title?: string;
    readonly contentType?: NativePlayerContentType;
    readonly userAgent?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly startPositionMs?: number;
}

interface NativePlayerPluginBridge {
    play?: (options: Record<string, unknown>) => Promise<void>;
    stop?: () => Promise<void>;
}

interface CapacitorPluginsGlobal {
    Plugins?: { NativePlayer?: NativePlayerPluginBridge };
}

/**
 * Bridge to the Media3 player registered by the Android shell. Outside the
 * native shell (web/PWA/Electron) the plugin is absent and this service is
 * inert; callers gate on {@link NativePlayerService.isAvailable}.
 */
@Injectable({ providedIn: 'root' })
export class NativePlayerService {
    isAvailable(): boolean {
        return typeof this.plugin?.play === 'function';
    }

    async play(playback: NativePlayerPlayback): Promise<void> {
        const plugin = this.plugin;
        if (typeof plugin?.play !== 'function') {
            throw new Error('Native player plugin is not available');
        }

        const options: Record<string, unknown> = {
            url: playback.url,
            title: playback.title ?? '',
            contentType: playback.contentType ?? 'live',
            startPositionMs: playback.startPositionMs ?? 0,
        };
        if (playback.userAgent) {
            options['userAgent'] = playback.userAgent;
        }
        if (playback.headers) {
            options['headers'] = { ...playback.headers };
        }

        await plugin.play(options);
    }

    async stop(): Promise<void> {
        await this.plugin?.stop?.();
    }

    private get plugin(): NativePlayerPluginBridge | undefined {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const capacitor = (window as { Capacitor?: CapacitorPluginsGlobal })
            .Capacitor;
        return capacitor?.Plugins?.NativePlayer;
    }
}
