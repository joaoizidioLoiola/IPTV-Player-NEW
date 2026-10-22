import { NativePlayerService } from './native-player.service';

describe('NativePlayerService', () => {
    afterEach(() => {
        setWindowCapacitor(undefined);
    });

    it('is unavailable outside the native shell', () => {
        const service = new NativePlayerService();

        expect(service.isAvailable()).toBe(false);
    });

    it('rejects play when the plugin is absent', async () => {
        const service = new NativePlayerService();

        await expect(
            service.play({ url: 'http://portal.example/live/1.ts' })
        ).rejects.toThrow('Native player plugin is not available');
    });

    it('forwards url, headers and playback metadata to the plugin', async () => {
        const play = jest.fn().mockResolvedValue(undefined);
        setWindowCapacitor({ Plugins: { NativePlayer: { play } } });
        const service = new NativePlayerService();

        await service.play({
            url: 'http://portal.example/live/1.ts',
            title: 'News',
            contentType: 'live',
            userAgent: 'VLC/3.0.18',
            headers: { Referer: 'http://portal.example/' },
            startPositionMs: 1500,
        });

        expect(service.isAvailable()).toBe(true);
        expect(play).toHaveBeenCalledWith({
            url: 'http://portal.example/live/1.ts',
            title: 'News',
            contentType: 'live',
            startPositionMs: 1500,
            userAgent: 'VLC/3.0.18',
            headers: { Referer: 'http://portal.example/' },
        });
    });

    it('omits optional values the caller did not provide', async () => {
        const play = jest.fn().mockResolvedValue(undefined);
        setWindowCapacitor({ Plugins: { NativePlayer: { play } } });
        const service = new NativePlayerService();

        await service.play({ url: 'http://portal.example/live/1.ts' });

        expect(play).toHaveBeenCalledWith({
            url: 'http://portal.example/live/1.ts',
            title: '',
            contentType: 'live',
            startPositionMs: 0,
        });
    });

    it('stops through the plugin when it is registered', async () => {
        const stop = jest.fn().mockResolvedValue(undefined);
        setWindowCapacitor({ Plugins: { NativePlayer: { stop } } });
        const service = new NativePlayerService();

        await service.stop();

        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('opens an external player through ACTION_VIEW when registered', async () => {
        const openExternal = jest.fn().mockResolvedValue(undefined);
        setWindowCapacitor({ Plugins: { NativePlayer: { openExternal } } });
        const service = new NativePlayerService();

        await service.openExternal({
            url: 'http://portal.example/live/1.ts',
            title: 'News',
        });

        expect(openExternal).toHaveBeenCalledWith({
            url: 'http://portal.example/live/1.ts',
            title: 'News',
        });
    });

    it('rejects openExternal when the bridge is absent', async () => {
        const service = new NativePlayerService();

        await expect(
            service.openExternal({ url: 'http://portal.example/live/1.ts' })
        ).rejects.toThrow('Native external player bridge is not available');
    });
});

function setWindowCapacitor(value: unknown): void {
    (window as unknown as { Capacitor?: unknown }).Capacitor = value;
}
