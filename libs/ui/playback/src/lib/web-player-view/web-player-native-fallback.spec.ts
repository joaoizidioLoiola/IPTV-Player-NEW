import { shouldFallbackToNativePlayback } from './web-player-native-fallback';

const TOKEN = Symbol('token');

describe('shouldFallbackToNativePlayback', () => {
    it('rejects a null diagnostic', () => {
        expect(
            shouldFallbackToNativePlayback(null, TOKEN, null, true)
        ).toBe(false);
    });

    it('rejects when the native player is unavailable', () => {
        expect(
            shouldFallbackToNativePlayback(
                { code: 'unsupported-container' },
                TOKEN,
                null,
                false
            )
        ).toBe(false);
    });

    it('rejects a network failure, which native playback cannot fix', () => {
        expect(
            shouldFallbackToNativePlayback(
                { code: 'network-error' },
                TOKEN,
                null,
                true
            )
        ).toBe(false);
    });

    it('accepts an engine error once per playback token', () => {
        expect(
            shouldFallbackToNativePlayback(
                { code: 'media-decode-error' },
                TOKEN,
                null,
                true
            )
        ).toBe(true);
        expect(
            shouldFallbackToNativePlayback(
                { code: 'media-decode-error' },
                TOKEN,
                TOKEN,
                true
            )
        ).toBe(false);
    });
});
