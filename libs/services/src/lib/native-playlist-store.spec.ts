import type { Playlist } from '@iptvnator/shared/interfaces';
import { NativePlaylistStore } from './native-playlist-store';

/**
 * The store only uses the connection-level API of the community plugin, so the
 * spec drives it with a fake module: no Capacitor runtime, no Android device.
 */
function createFakeSqlite() {
    const run = jest.fn().mockResolvedValue({ changes: { changes: 1 } });
    const execute = jest.fn().mockResolvedValue({ changes: { changes: 1 } });
    let rows: unknown[] = [];
    const query = jest.fn().mockImplementation(async () => ({ values: rows }));
    const isDBOpen = jest.fn().mockResolvedValue({ result: true });
    const open = jest.fn().mockResolvedValue(undefined);
    const database = { isDBOpen, open, run, query, execute };

    const checkConnectionsConsistency = jest
        .fn()
        .mockResolvedValue({ result: true });
    const isConnection = jest.fn().mockResolvedValue({ result: true });
    const createConnection = jest.fn().mockResolvedValue(database);
    const retrieveConnection = jest.fn().mockResolvedValue(database);
    const addUpgradeStatement = jest.fn().mockResolvedValue(undefined);
    const closeConnection = jest.fn().mockResolvedValue(undefined);

    const SQLiteConnection = jest.fn().mockImplementation(() => ({
        checkConnectionsConsistency,
        isConnection,
        createConnection,
        retrieveConnection,
        addUpgradeStatement,
        closeConnection,
    }));

    const loadModule = () =>
        Promise.resolve({
            CapacitorSQLite: {},
            SQLiteConnection,
        } as never);

    return {
        loadModule,
        database,
        run,
        execute,
        query,
        open,
        isDBOpen,
        checkConnectionsConsistency,
        isConnection,
        createConnection,
        retrieveConnection,
        addUpgradeStatement,
        closeConnection,
        setRows: (next: unknown[]) => {
            rows = next;
        },
    };
}

function playlist(id: string, title = id): Playlist {
    return { _id: id, title } as Playlist;
}

describe('NativePlaylistStore', () => {
    it('reuses one native connection across calls', async () => {
        const fake = createFakeSqlite();
        fake.setRows([]);
        const store = new NativePlaylistStore(fake.loadModule);

        await store.dbGetAppPlaylists();
        await store.dbGetAppPlaylists();

        expect(fake.checkConnectionsConsistency).toHaveBeenCalledTimes(1);
        expect(fake.retrieveConnection).toHaveBeenCalledWith(
            'iptv-player-new',
            false
        );
        expect(fake.addUpgradeStatement).toHaveBeenCalledTimes(1);
        expect(fake.open).not.toHaveBeenCalled();
    });

    it('registers the schema upgrade before creating a new database', async () => {
        const fake = createFakeSqlite();
        fake.checkConnectionsConsistency.mockResolvedValue({ result: false });
        fake.isDBOpen.mockResolvedValue({ result: false });
        fake.setRows([]);
        const store = new NativePlaylistStore(fake.loadModule);

        await store.dbGetAppPlaylists();

        expect(fake.createConnection).toHaveBeenCalledWith(
            'iptv-player-new',
            false,
            'no-encryption',
            1,
            false
        );
        expect(fake.retrieveConnection).not.toHaveBeenCalled();
        expect(fake.addUpgradeStatement).toHaveBeenCalledWith(
            'iptv-player-new',
            [
                expect.objectContaining({
                    toVersion: 1,
                    statements: expect.arrayContaining([
                        expect.stringContaining('CREATE TABLE IF NOT EXISTS app_playlist'),
                    ]),
                }),
            ]
        );
        // The plugin captures the upgrade map when it builds the connection
        // and only applies it on open(); registering it later leaves a fresh
        // database without tables.
        expect(
            fake.addUpgradeStatement.mock.invocationCallOrder[0]
        ).toBeLessThan(fake.createConnection.mock.invocationCallOrder[0]);
        expect(
            fake.createConnection.mock.invocationCallOrder[0]
        ).toBeLessThan(fake.open.mock.invocationCallOrder[0]);
    });

    it('reads playlists as parsed documents', async () => {
        const fake = createFakeSqlite();
        fake.setRows([{ doc: JSON.stringify(playlist('a', 'Alpha')) }]);
        const store = new NativePlaylistStore(fake.loadModule);

        await expect(store.dbGetAppPlaylists()).resolves.toEqual([
            playlist('a', 'Alpha'),
        ]);
        await expect(store.dbGetAppPlaylist('a')).resolves.toEqual(
            playlist('a', 'Alpha')
        );
    });

    it('returns null when a playlist document is missing', async () => {
        const fake = createFakeSqlite();
        fake.setRows([]);
        const store = new NativePlaylistStore(fake.loadModule);

        await expect(store.dbGetAppPlaylist('missing')).resolves.toBeNull();
    });

    it('writes every playlist with bound parameters', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        const fake = createFakeSqlite();
        const store = new NativePlaylistStore(fake.loadModule);

        await expect(
            store.dbUpsertAppPlaylists([
                playlist('a', 'Alpha'),
                playlist('b', 'Beta'),
            ])
        ).resolves.toEqual({ success: true, count: 2 });

        expect(fake.run).toHaveBeenCalledTimes(2);
        expect(fake.run).toHaveBeenNthCalledWith(
            1,
            'INSERT OR REPLACE INTO app_playlist (id, doc, updated_at) VALUES (?, ?, ?);',
            ['a', JSON.stringify(playlist('a', 'Alpha')), 1_700_000_000_000]
        );
    });

    it('deletes one playlist and every playlist', async () => {
        const fake = createFakeSqlite();
        const store = new NativePlaylistStore(fake.loadModule);

        await expect(store.dbDeletePlaylist('a')).resolves.toEqual({
            success: true,
        });
        expect(fake.run).toHaveBeenCalledWith(
            'DELETE FROM app_playlist WHERE id = ?;',
            ['a']
        );

        await expect(store.dbDeleteAllPlaylists()).resolves.toEqual({
            success: true,
        });
        expect(fake.execute).toHaveBeenCalledWith(
            'DELETE FROM app_playlist;'
        );
    });

    it('round-trips app state values', async () => {
        const fake = createFakeSqlite();
        fake.setRows([{ value: 'dark' }]);
        const store = new NativePlaylistStore(fake.loadModule);

        await expect(store.dbGetAppState('theme')).resolves.toBe('dark');
        await expect(store.dbSetAppState('theme', 'light')).resolves.toEqual({
            success: true,
        });
        expect(fake.run).toHaveBeenCalledWith(
            'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?);',
            ['theme', 'light']
        );
    });

    it('returns null for an absent app state key', async () => {
        const fake = createFakeSqlite();
        fake.setRows([]);
        const store = new NativePlaylistStore(fake.loadModule);

        await expect(store.dbGetAppState('missing')).resolves.toBeNull();
    });

    it('closes the native connection on teardown', async () => {
        const fake = createFakeSqlite();
        fake.setRows([]);
        const store = new NativePlaylistStore(fake.loadModule);

        await store.dbGetAppPlaylists();
        await store.close();
        await store.close();

        expect(fake.closeConnection).toHaveBeenCalledTimes(1);
        expect(fake.closeConnection).toHaveBeenCalledWith(
            'iptv-player-new',
            false
        );
    });
});
