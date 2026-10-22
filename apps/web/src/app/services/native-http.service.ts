import { Injectable } from '@angular/core';
import {
    isNativeCapacitorShell,
    readWindowCapacitorGlobal,
} from '@iptvnator/services';

/**
 * Request accepted by the Capacitor HTTP bridge. Kept deliberately small: the
 * transport only moves bytes, so provider semantics stay in the callers.
 */
export interface NativeHttpRequestOptions {
    readonly url: string;
    readonly method?: 'GET' | 'POST';
    readonly headers?: Record<string, string>;
    readonly params?: Record<string, string>;
    readonly connectTimeoutMs?: number;
    readonly readTimeoutMs?: number;
    readonly responseType?: 'text' | 'json';
}

export interface NativeHttpResponse<T = unknown> {
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly data: T;
    readonly url?: string;
}

interface CapacitorHttpPlugin {
    request(options: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        params?: Record<string, string>;
        connectTimeout?: number;
        readTimeout?: number;
        responseType?: 'text' | 'json';
        shouldEncodeUrlParams?: boolean;
    }): Promise<{
        status?: number;
        headers?: Record<string, string>;
        data?: unknown;
        url?: string;
    }>;
}

/**
 * Network failure raised by the native bridge. Carries `status` when the
 * provider answered with an HTTP error and `code` for the platform exception
 * name (`SocketTimeoutException`, `SSLHandshakeException`, ...), which the
 * connection-test classifier reads.
 */
export class NativeHttpError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string
    ) {
        super(message);
        this.name = 'NativeHttpError';
    }
}

function toNativeHttpError(error: unknown): NativeHttpError {
    if (error instanceof NativeHttpError) {
        return error;
    }
    const candidate =
        error && typeof error === 'object'
            ? (error as {
                  message?: unknown;
                  status?: unknown;
                  code?: unknown;
              })
            : undefined;
    const message =
        typeof candidate?.message === 'string' && candidate.message.trim()
            ? candidate.message
            : 'Native HTTP request failed';
    const status =
        typeof candidate?.status === 'number' ? candidate.status : 0;
    const code =
        typeof candidate?.code === 'string' ? candidate.code : undefined;
    return new NativeHttpError(message, status, code);
}

/**
 * Transport for the Android shell: runs provider requests through the
 * Capacitor `CapacitorHttp` plugin, which uses the platform HTTP stack and is
 * therefore not subject to WebView CORS or mixed-content rules.
 *
 * The plugin is resolved lazily, so the PWA/Electron bundles never load
 * `@capacitor/core` and the web build keeps its existing network path.
 */
@Injectable({
    providedIn: 'root',
})
export class NativeHttpService {
    /** Replaced in tests; the real app imports the plugin on first use. */
    loadPlugin: () => Promise<CapacitorHttpPlugin> = async () => {
        const core = await import('@capacitor/core');
        const http = core.CapacitorHttp;
        // Never resolve the plugin proxy itself: Capacitor proxies answer
        // unknown properties (including `then`), so returning one from an
        // async function makes the promise machinery call `CapacitorHttp.then()`
        // and fail with "not implemented". A plain wrapper keeps the proxy out
        // of the promise chain.
        return {
            request: (options) => http.request(options),
        };
    };

    isNativeShell(): boolean {
        return isNativeCapacitorShell(readWindowCapacitorGlobal());
    }

    async request<T = unknown>(
        options: NativeHttpRequestOptions
    ): Promise<NativeHttpResponse<T>> {
        const plugin = await this.loadPlugin();
        try {
            const response = await plugin.request({
                url: options.url,
                method: options.method ?? 'GET',
                ...(options.headers ? { headers: options.headers } : {}),
                ...(options.params ? { params: options.params } : {}),
                ...(options.connectTimeoutMs
                    ? { connectTimeout: options.connectTimeoutMs }
                    : {}),
                ...(options.readTimeoutMs
                    ? { readTimeout: options.readTimeoutMs }
                    : {}),
                responseType: options.responseType ?? 'text',
                // Provider URLs are already assembled by the caller; only the
                // Xtream query params need the plugin's encoding.
                shouldEncodeUrlParams: true,
            });
            return {
                status:
                    typeof response.status === 'number' ? response.status : 0,
                headers: response.headers ?? {},
                data: response.data as T,
                ...(typeof response.url === 'string'
                    ? { url: response.url }
                    : {}),
            };
        } catch (error) {
            throw toNativeHttpError(error);
        }
    }
}
