import { inject, Injectable } from '@angular/core';
import {
    buildStalkerIdentityRequestContext,
    buildStalkerRequestUrl,
    normalizeXtreamServerUrl,
    Playlist,
    XTREAM_CLIENT_USER_AGENT,
    XtreamConnectionFailure,
} from '@iptvnator/shared/interfaces';
import { createPlaylistObject } from '@iptvnator/shared/m3u-utils';
import { resolvePlaylistParser } from '@iptvnator/services';
import { NativeHttpError, NativeHttpService } from './native-http.service';

const XTREAM_CONNECT_TIMEOUT_MS = 15_000;
const XTREAM_READ_TIMEOUT_MS = 30_000;
const STALKER_READ_TIMEOUT_MS = 15_000;
const STALKER_CREATE_LINK_TIMEOUT_MS = 30_000;
const PLAYLIST_READ_TIMEOUT_MS = 60_000;

interface XtreamTransportPayload {
    readonly connectionTest?: boolean;
    readonly url: string;
    readonly params: Record<string, string>;
    readonly macAddress?: string;
}

interface StalkerTransportPayload {
    readonly url: string;
    readonly params: Record<string, string>;
    readonly macAddress: string;
    readonly token?: string;
    readonly serialNumber?: string;
}

interface XtreamTransportResponse {
    readonly action?: string;
    readonly payload?: unknown;
    readonly status?: number;
    readonly message?: string;
    readonly connectionFailure?: XtreamConnectionFailure;
}

/**
 * Provider transport for the native shell.
 *
 * The web build sends these three operations to the self-hosted backend
 * (`/parse`, `/xtream`, `/stalker`). Inside the APK there is no backend, so
 * this service performs the same requests through the platform HTTP stack and
 * returns the same response shapes. Everything that interprets the responses
 * (errors, portal debug events, snackbars) stays in `PwaService`.
 */
@Injectable({
    providedIn: 'root',
})
export class NativeProviderTransportService {
    private readonly http = inject(NativeHttpService);

    isAvailable(): boolean {
        return this.http.isNativeShell();
    }

    /**
     * Mirrors `GET /parse`: fetch the playlist document and build the same
     * `Playlist` object the backend returns, including DRM extraction and EPG
     * URL detection from the shared builder.
     */
    async fetchPlaylist(url: string, userAgent?: string): Promise<Playlist> {
        const normalizedUserAgent = userAgent?.trim();
        let response;
        try {
            response = await this.http.request<string>({
                url,
                responseType: 'text',
                readTimeoutMs: PLAYLIST_READ_TIMEOUT_MS,
                ...(normalizedUserAgent
                    ? { headers: { 'User-Agent': normalizedUserAgent } }
                    : {}),
            });
        } catch (error) {
            throw asPlaylistError(error);
        }

        if (response.status < 200 || response.status >= 300) {
            throw new NativeHttpError(
                `HTTP ${response.status}`,
                response.status
            );
        }

        const document = asText(response.data);
        if (!document.trim()) {
            throw new Error('Empty playlist document');
        }

        const parserModule = await import('iptv-playlist-parser');
        const parse = resolvePlaylistParser(parserModule);
        const parsedPlaylist = parse(document);
        const title = playlistTitleFromUrl(url);

        return {
            ...createPlaylistObject(title, parsedPlaylist, url, 'URL'),
            ...(normalizedUserAgent ? { userAgent: normalizedUserAgent } : {}),
        };
    }

    /**
     * Mirrors `GET /xtream`: normalize the panel base URL, append
     * `player_api.php`, forward the action params and wrap the JSON payload.
     * The body never carries `targetId`/`connectionTest`, those are transport
     * controls the backend strips before contacting the panel.
     */
    async requestXtream(
        payload: XtreamTransportPayload
    ): Promise<XtreamTransportResponse> {
        let requestUrl: string;
        try {
            requestUrl = appendPathSegment(
                normalizeXtreamServerUrl(payload.url),
                'player_api.php'
            );
        } catch (error) {
            return this.xtreamFailure(payload, error);
        }

        try {
            const response = await this.http.request<string>({
                url: requestUrl,
                params: withoutEmptyValues(payload.params),
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'User-Agent': XTREAM_CLIENT_USER_AGENT,
                    ...(payload.macAddress
                        ? { Cookie: `mac=${payload.macAddress}` }
                        : {}),
                },
                responseType: 'text',
                connectTimeoutMs: XTREAM_CONNECT_TIMEOUT_MS,
                readTimeoutMs: XTREAM_READ_TIMEOUT_MS,
            });

            if (response.status >= 400) {
                return payload.connectionTest
                    ? {
                          connectionFailure: {
                              kind: 'http',
                              status: response.status,
                              canTryHttp: false,
                          },
                      }
                    : {
                          status: response.status,
                          message: `HTTP Error ${response.status}`,
                      };
            }

            return {
                action: payload.params['action'],
                payload: parseJsonBody(response.data),
            };
        } catch (error) {
            return this.xtreamFailure(payload, error);
        }
    }

    /**
     * Mirrors `GET /stalker`: build the MAG identity headers and the portal
     * query exactly as the shared Electron/web-backend transport does, then
     * return the portal payload in the backend's `{ action, payload }` shape.
     */
    async requestStalker(
        payload: StalkerTransportPayload
    ): Promise<Record<string, unknown>> {
        const identity = buildStalkerIdentityRequestContext({
            macAddress: payload.macAddress ?? '',
            params: payload.params,
            ...(payload.token ? { token: payload.token } : {}),
            ...(payload.serialNumber
                ? { serialNumber: payload.serialNumber }
                : {}),
        });
        const headers: Record<string, string> = { ...identity.headers };
        if (!payload.macAddress) {
            // No MAC means no session cookie, not an empty `mac=`.
            delete headers['Cookie'];
        }

        const requestUrl = buildStalkerRequestUrl(
            payload.url,
            identity.requestParams
        );
        const response = await this.http.request<string>({
            url: requestUrl,
            headers,
            responseType: 'text',
            connectTimeoutMs: STALKER_READ_TIMEOUT_MS,
            readTimeoutMs:
                payload.params['action'] === 'create_link'
                    ? STALKER_CREATE_LINK_TIMEOUT_MS
                    : STALKER_READ_TIMEOUT_MS,
        });

        if (response.status >= 400) {
            return {
                status: response.status,
                message: `HTTP Error ${response.status}`,
            };
        }

        return {
            action: payload.params['action'],
            payload: parseJsonBody(response.data),
        };
    }

    private xtreamFailure(
        payload: XtreamTransportPayload,
        error: unknown
    ): XtreamTransportResponse {
        if (payload.connectionTest) {
            return { connectionFailure: classifyConnectionFailure(error) };
        }
        // Never surface the platform message here: it can contain the
        // provider host or IP, which is user data.
        return { status: 500, message: 'Error, something went wrong' };
    }
}

function appendPathSegment(url: string, segment: string): string {
    const nextUrl = new URL(url);
    nextUrl.pathname = `${nextUrl.pathname.replace(/\/+$/, '')}/${segment}`;
    nextUrl.search = '';
    nextUrl.hash = '';
    return nextUrl.href;
}

function withoutEmptyValues(
    params: Record<string, string>
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.trim().length > 0) {
            result[key] = value;
        }
    }
    return result;
}

function asText(data: unknown): string {
    if (typeof data === 'string') {
        return data;
    }
    return data == null ? '' : String(data);
}

function parseJsonBody(data: unknown): unknown {
    if (typeof data !== 'string') {
        return data;
    }
    const text = data.replace(/^\uFEFF/, '').trim();
    if (!text) {
        return null;
    }
    return JSON.parse(text);
}

function playlistTitleFromUrl(value: string): string {
    try {
        const url = new URL(value);
        const segment = url.pathname.split('/').filter(Boolean).pop()?.trim();
        return segment || 'Playlist without title';
    } catch {
        return 'Playlist without title';
    }
}

function asPlaylistError(error: unknown): NativeHttpError {
    if (error instanceof NativeHttpError) {
        return error;
    }
    const message =
        error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: unknown }).message ?? '')
            : '';
    return new NativeHttpError(
        message || 'Playlist download failed',
        0
    );
}

function classifyConnectionFailure(error: unknown): XtreamConnectionFailure {
    if (error instanceof NativeHttpError) {
        if (error.status >= 400) {
            return {
                kind: 'http',
                status: error.status,
                canTryHttp: false,
            };
        }
        if (isTlsFailure(error)) {
            return { kind: 'tls', canTryHttp: false };
        }
        if (isConnectionFailure(error)) {
            return { kind: 'connection', canTryHttp: true };
        }
    }
    return { kind: 'unknown', canTryHttp: false };
}

function isTlsFailure(error: NativeHttpError): boolean {
    const evidence = `${error.code ?? ''} ${error.message}`;
    return /SSL|TLS|certificate|CertPath|trust anchor|handshake/i.test(
        evidence
    );
}

function isConnectionFailure(error: NativeHttpError): boolean {
    const evidence = `${error.code ?? ''} ${error.message}`;
    return (
        error.status === 0 ||
        /SocketTimeout|ConnectException|UnknownHost|timeout|timed out|unreachable|ECONN|ENOTFOUND/i.test(
            evidence
        )
    );
}
