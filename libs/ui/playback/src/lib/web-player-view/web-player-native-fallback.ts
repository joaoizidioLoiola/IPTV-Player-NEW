import type { PlaybackDiagnostic } from '@iptvnator/playback/util';

/**
 * Engine errors that mean "the WebView cannot play this source", not "the
 * network is down". On Android the Media3 player can often decode the same
 * source (HEVC, AC3, MP4 variants) and receives the portal headers, so these
 * are the codes worth handing over.
 */
const NATIVE_FALLBACK_CODES: ReadonlySet<string> = new Set([
    'unknown-playback-error',
    'unsupported-container',
    'media-decode-error',
]);

export function shouldFallbackToNativePlayback(
    diagnostic: Pick<PlaybackDiagnostic, 'code'> | null | undefined,
    token: symbol,
    attemptedToken: symbol | null,
    nativeAvailable: boolean
): boolean {
    return (
        nativeAvailable &&
        !!diagnostic &&
        NATIVE_FALLBACK_CODES.has(diagnostic.code) &&
        token !== attemptedToken
    );
}
