import type {
    CatchupDownloadMetadata,
    DownloadContentType,
    DownloadMetadataSnapshot,
    ElectronBridgeEpisodeIdentityScope,
} from '@iptvnator/shared/interfaces';
import { extname } from 'node:path';

export interface StartDownloadRequest {
    playlistId: string;
    xtreamId: number;
    contentType: DownloadContentType;
    catchup?: CatchupDownloadMetadata | null;
    title: string;
    url: string;
    posterUrl?: string;
    metadataSnapshot?: DownloadMetadataSnapshot;
    downloadFolder: string;
    headers?: { userAgent?: string; referer?: string; origin?: string };
    seriesXtreamId?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeIdentityScope?: ElectronBridgeEpisodeIdentityScope;
    playlistName?: string;
    playlistType?: 'xtream' | 'stalker' | 'm3u-file' | 'm3u-text' | 'm3u-url';
    serverUrl?: string;
    portalUrl?: string;
    macAddress?: string;
}

/**
 * Windows device names are reserved as file names even with an extension
 * (`CON.ts` is as illegal as `CON`). A trailing underscore keeps the
 * recognizable name usable on NTFS.
 */
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

/**
 * Byte budget for the generated file name, well below the 255-char NTFS
 * name limit and low enough that the user-chosen directory plus any
 * deduplication suffix still fits a MAX_PATH-friendly full path.
 */
const MAX_FILENAME_BYTES = 120;

function truncateFilenamePreservingExtension(
    value: string,
    maxBytes: number
): string {
    if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
        return value;
    }
    const dotIndex = value.lastIndexOf('.');
    const hasExtension =
        dotIndex > 0 &&
        Buffer.byteLength(value.slice(dotIndex), 'utf8') < maxBytes;
    const extension = hasExtension ? value.slice(dotIndex) : '';
    const base = hasExtension ? value.slice(0, dotIndex) : value;
    const budget = maxBytes - Buffer.byteLength(extension, 'utf8');
    let truncatedBase = base;
    while (
        truncatedBase.length > 0 &&
        Buffer.byteLength(truncatedBase, 'utf8') > budget
    ) {
        truncatedBase = truncatedBase.slice(0, -1);
    }
    // Truncation may leave a trailing dot/space, which NTFS rejects too.
    return truncatedBase.replace(/[. ]+$/, '') + extension;
}

export function sanitizeFilename(name: string): string {
    let sanitized = name
        // Control characters are invisible, cannot be typed back and make
        // NTFS writes fail outright.
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
    // NTFS strips trailing dots and spaces, so a name ending in them (or in
    // both) would silently resolve to a different file or fail.
    sanitized = sanitized.replace(/[. ]+$/, '');
    const dotIndex = sanitized.indexOf('.');
    const base = dotIndex === -1 ? sanitized : sanitized.slice(0, dotIndex);
    if (WINDOWS_RESERVED_DEVICE_NAMES.has(base.toUpperCase())) {
        sanitized = base + '_' + sanitized.slice(dotIndex === -1 ? sanitized.length : dotIndex);
    }
    return truncateFilenamePreservingExtension(sanitized, MAX_FILENAME_BYTES);
}

function getExtensionFromUrl(url: string): string {
    try {
        // Sanitize too: URL pathnames may legally contain characters like ':'
        // that would create NTFS alternate data streams on Windows.
        const extension = sanitizeFilename(extname(new URL(url).pathname));
        return extension.startsWith('.') ? extension : '.mp4';
    } catch {
        return '.mp4';
    }
}

export function createFileName(title: string, url: string): string {
    return sanitizeFilename(title) + getExtensionFromUrl(url);
}

export function createHeaders(
    headers: StartDownloadRequest['headers']
): Record<string, string> | undefined {
    if (!headers) {
        return undefined;
    }

    const result: Record<string, string> = {};
    if (headers.userAgent) {
        result['User-Agent'] = headers.userAgent;
    }
    if (headers.origin) {
        result.Origin = headers.origin;
    }
    if (headers.referer) {
        result.Referer = headers.referer;
    }

    return Object.keys(result).length > 0 ? result : undefined;
}

export function serializeHeaders(
    headers: Record<string, string> | undefined
): string | null {
    return headers ? JSON.stringify(headers) : null;
}
