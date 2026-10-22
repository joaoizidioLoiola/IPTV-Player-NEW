import { TestBed } from '@angular/core/testing';
import { NativeHttpError, NativeHttpService } from './native-http.service';

describe('NativeHttpService', () => {
    let service: NativeHttpService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(NativeHttpService);
    });

    afterEach(() => {
        delete (window as { Capacitor?: unknown }).Capacitor;
    });

    it('reports a native shell only when the Capacitor bridge says so', () => {
        expect(service.isNativeShell()).toBe(false);

        (window as { Capacitor?: unknown }).Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
        };

        expect(service.isNativeShell()).toBe(true);
    });

    it('forwards the request to the Capacitor HTTP plugin', async () => {
        const request = jest.fn().mockResolvedValue({
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: '{"ok":true}',
            url: 'https://panel.example/player_api.php',
        });
        service.loadPlugin = jest.fn().mockResolvedValue({ request });

        const response = await service.request({
            url: 'https://panel.example/player_api.php',
            headers: { 'User-Agent': 'test-agent' },
            params: { action: 'get_live_categories' },
            readTimeoutMs: 1_000,
        });

        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://panel.example/player_api.php',
                method: 'GET',
                headers: { 'User-Agent': 'test-agent' },
                params: { action: 'get_live_categories' },
                readTimeout: 1_000,
                responseType: 'text',
            })
        );
        expect(response).toEqual({
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: '{"ok":true}',
            url: 'https://panel.example/player_api.php',
        });
    });

    it('wraps plugin failures with the platform code and status', async () => {
        service.loadPlugin = jest.fn().mockResolvedValue({
            request: jest
                .fn()
                .mockRejectedValue({
                    message: 'timeout',
                    code: 'SocketTimeoutException',
                }),
        });

        await expect(
            service.request({ url: 'https://panel.example/' })
        ).rejects.toMatchObject({
            name: 'NativeHttpError',
            message: 'timeout',
            status: 0,
            code: 'SocketTimeoutException',
        } satisfies Partial<NativeHttpError>);
    });
});
