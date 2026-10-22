import { TestBed } from '@angular/core/testing';
import { NativeHttpError, NativeHttpService } from './native-http.service';
import { NativeProviderTransportService } from './native-provider-transport.service';

const SAMPLE_PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-id="news" tvg-name="News" group-title="News",News
http://stream.example/news.m3u8
#EXTINF:-1 tvg-id="sports" group-title="Sports",Sports
http://stream.example/sports.m3u8
`;

describe('NativeProviderTransportService', () => {
    let request: jest.Mock;
    let service: NativeProviderTransportService;

    beforeEach(() => {
        request = jest.fn();
        TestBed.configureTestingModule({
            providers: [
                NativeProviderTransportService,
                {
                    provide: NativeHttpService,
                    useValue: {
                        isNativeShell: () => true,
                        request,
                    },
                },
            ],
        });
        service = TestBed.inject(NativeProviderTransportService);
    });

    it('parses a playlist document into the same Playlist shape as /parse', async () => {
        request.mockResolvedValue({
            status: 200,
            headers: {},
            data: SAMPLE_PLAYLIST,
        });

        const playlist = await service.fetchPlaylist(
            'https://provider.example/lists/main.m3u?token=secret',
            '  Player/1.0  '
        );

        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://provider.example/lists/main.m3u?token=secret',
                headers: { 'User-Agent': 'Player/1.0' },
                responseType: 'text',
            })
        );
        expect(playlist).toMatchObject({
            title: 'main.m3u',
            filename: 'main.m3u',
            count: 2,
            url: 'https://provider.example/lists/main.m3u?token=secret',
            userAgent: 'Player/1.0',
        });
        expect(playlist.playlist.items[0]).toMatchObject({
            name: 'News',
            group: { title: 'News' },
        });
    });

    it('surfaces the playlist HTTP status so the URL-import toast can map it', async () => {
        request.mockResolvedValue({ status: 403, headers: {}, data: '' });

        await expect(
            service.fetchPlaylist('https://provider.example/private.m3u')
        ).rejects.toMatchObject({ status: 403 });
    });

    it('builds the Xtream player_api request and wraps the JSON payload', async () => {
        request.mockResolvedValue({
            status: 200,
            headers: {},
            data: '{"user_info":{"auth":1}}',
        });

        const result = await service.requestXtream({
            url: 'https://panel.example/sub/player_api.php?username=u',
            params: {
                username: 'user',
                password: 'pass',
                action: 'get_live_categories',
                empty: '   ',
            },
            macAddress: '00:1A:79:00:00:01',
        });

        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://panel.example/sub/player_api.php',
                params: {
                    username: 'user',
                    password: 'pass',
                    action: 'get_live_categories',
                },
                headers: expect.objectContaining({
                    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
                    Cookie: 'mac=00:1A:79:00:00:01',
                }),
            })
        );
        expect(result).toEqual({
            action: 'get_live_categories',
            payload: { user_info: { auth: 1 } },
        });
    });

    it('reports an HTTP failure as an error body without leaking the panel URL', async () => {
        request.mockResolvedValue({ status: 401, headers: {}, data: '' });

        const result = await service.requestXtream({
            url: 'https://panel.example',
            params: { username: 'user', password: 'pass' },
        });

        expect(result).toEqual({
            status: 401,
            message: 'HTTP Error 401',
        });
    });

    it('classifies a timeout during the Xtream connection test', async () => {
        request.mockRejectedValue(
            new NativeHttpError('timed out', 0, 'SocketTimeoutException')
        );

        const result = await service.requestXtream({
            url: 'https://panel.example',
            params: { username: 'user', password: 'pass' },
            connectionTest: true,
        });

        expect(result).toEqual({
            connectionFailure: { kind: 'connection', canTryHttp: true },
        });
    });

    it('classifies a certificate failure during the Xtream connection test', async () => {
        request.mockRejectedValue(
            new NativeHttpError(
                'Certificate verification failed',
                0,
                'SSLHandshakeException'
            )
        );

        const result = await service.requestXtream({
            url: 'https://panel.example',
            params: { username: 'user', password: 'pass' },
            connectionTest: true,
        });

        expect(result).toEqual({
            connectionFailure: { kind: 'tls', canTryHttp: false },
        });
    });

    it('builds the Stalker MAG identity headers and keeps credentials out of the query', async () => {
        request.mockResolvedValue({
            status: 200,
            headers: {},
            data: '{"js":{"token":"abc"}}',
        });

        const result = await service.requestStalker({
            url: 'http://portal.example/c/',
            params: { type: 'stb', action: 'get_profile' },
            macAddress: '00:1A:79:00:00:01',
            token: 'token-1',
            serialNumber: 'SERIAL-1',
        });

        const call = request.mock.calls[0][0] as {
            url: string;
            headers: Record<string, string>;
        };
        expect(call.url).toContain('http://portal.example/c/?');
        expect(call.url).toContain('type=stb');
        expect(call.url).toContain('action=get_profile');
        expect(call.url).toContain('JsHttpRequest=1-xml');
        expect(call.url).toContain('sn=SERIAL-1');
        expect(call.url).not.toContain('macAddress');
        expect(call.url).not.toContain('serialNumber');
        expect(call.headers['Cookie']).toContain(
            'mac=00:1A:79:00:00:01'
        );
        expect(call.headers['User-Agent']).toContain('MAG');
        expect(call.headers['Authorization']).toBe('Bearer token-1');
        expect(call.headers['SN']).toBe('SERIAL-1');
        expect(result).toEqual({
            action: 'get_profile',
            payload: { js: { token: 'abc' } },
        });
    });

    it('turns an answered Stalker error into the backend error body', async () => {
        request.mockResolvedValue({ status: 404, headers: {}, data: '' });

        const result = await service.requestStalker({
            url: 'http://portal.example/c/',
            params: { type: 'stb', action: 'get_profile' },
            macAddress: '00:1A:79:00:00:01',
        });

        expect(result).toEqual({
            status: 404,
            message: 'HTTP Error 404',
        });
    });
});
