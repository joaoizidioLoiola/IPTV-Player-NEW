import type {
    ElectronBridgeCountResult,
    ElectronBridgeResult,
    Playlist,
} from '@iptvnator/shared/interfaces';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { PlaylistDocumentStore } from './playlist-storage-backend';

/**
 * Document store used by the Capacitor Android shell.
 *
 * The Electron store persists the same `Playlist` documents through the DB
 * worker; this one keeps them as JSON rows in a private SQLite database inside
 * the APK's data directory, so playlists survive WebView storage eviction and
 * app restarts. Statements use bound parameters on purpose: the community
 * plugin's `executeSet` escaping is known to corrupt text.
 */

const DATABASE_NAME = 'iptv-player-new';
const DATABASE_VERSION = 1;

/** DDL applied through the plugin's `PRAGMA user_version` upgrade path. */
export const NATIVE_PLAYLIST_SCHEMA: readonly string[] = [
    `CREATE TABLE IF NOT EXISTS app_playlist (
        id TEXT PRIMARY KEY NOT NULL,
        doc TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_app_playlist_updated_at
        ON app_playlist(updated_at);`,
    `CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    );`,
];

type SqliteModule = typeof import('@capacitor-community/sqlite');

function importSqliteModule(): Promise<SqliteModule> {
    return import('@capacitor-community/sqlite');
}

interface PlaylistRow {
    readonly doc?: unknown;
}

interface StateRow {
    readonly value?: unknown;
}

export class NativePlaylistStore implements PlaylistDocumentStore {
    private database: Promise<SQLiteDBConnection> | null = null;

    constructor(
        private readonly loadModule: () => Promise<SqliteModule> =
            importSqliteModule
    ) {}

    async dbGetAppPlaylists(): Promise<Playlist[]> {
        const rows = await this.query<PlaylistRow>(
            'SELECT doc FROM app_playlist ORDER BY updated_at ASC;'
        );
        return rows.map((row) => JSON.parse(String(row.doc)) as Playlist);
    }

    async dbGetAppPlaylist(playlistId: string): Promise<Playlist | null> {
        const rows = await this.query<PlaylistRow>(
            'SELECT doc FROM app_playlist WHERE id = ?;',
            [playlistId]
        );
        const row = rows[0];
        return row ? (JSON.parse(String(row.doc)) as Playlist) : null;
    }

    dbUpsertAppPlaylist(playlist: Playlist): Promise<ElectronBridgeCountResult> {
        return this.upsert([playlist]);
    }

    dbUpsertAppPlaylists(
        playlists: Playlist[]
    ): Promise<ElectronBridgeCountResult> {
        return this.upsert(playlists);
    }

    async dbDeletePlaylist(playlistId: string): Promise<ElectronBridgeResult> {
        const database = await this.databaseConnection();
        await database.run('DELETE FROM app_playlist WHERE id = ?;', [
            playlistId,
        ]);
        return { success: true };
    }

    async dbDeleteAllPlaylists(): Promise<ElectronBridgeResult> {
        const database = await this.databaseConnection();
        await database.execute('DELETE FROM app_playlist;');
        return { success: true };
    }

    async dbGetAppState(key: string): Promise<string | null> {
        const rows = await this.query<StateRow>(
            'SELECT value FROM app_state WHERE key = ?;',
            [key]
        );
        const value = rows[0]?.value;
        return value === undefined || value === null ? null : String(value);
    }

    async dbSetAppState(
        key: string,
        value: string
    ): Promise<ElectronBridgeResult> {
        const database = await this.databaseConnection();
        await database.run(
            'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?);',
            [key, value]
        );
        return { success: true };
    }

    /**
     * Releases the native connection. The plugin keeps one handle per database
     * name; leaving it open across a WebView reload is a documented way to hit
     * "database is locked", so the shell calls this on teardown.
     */
    async close(): Promise<void> {
        const pending = this.database;
        this.database = null;
        if (!pending) {
            return;
        }
        const { CapacitorSQLite, SQLiteConnection } = await this.loadModule();
        const connection = new SQLiteConnection(CapacitorSQLite);
        try {
            await connection.closeConnection(DATABASE_NAME, false);
        } catch {
            // Nothing to close: the connection was never opened.
        }
    }

    private async upsert(
        playlists: Playlist[]
    ): Promise<ElectronBridgeCountResult> {
        const database = await this.databaseConnection();
        const updatedAt = Date.now();
        for (const playlist of playlists) {
            await database.run(
                'INSERT OR REPLACE INTO app_playlist (id, doc, updated_at) VALUES (?, ?, ?);',
                [playlist._id, JSON.stringify(playlist), updatedAt]
            );
        }
        return { success: true, count: playlists.length };
    }

    private async query<T>(
        statement: string,
        values: unknown[] = []
    ): Promise<T[]> {
        const database = await this.databaseConnection();
        const result = await database.query(statement, values);
        return (result.values ?? []) as T[];
    }

    private databaseConnection(): Promise<SQLiteDBConnection> {
        if (!this.database) {
            this.database = this.openDatabase();
        }
        return this.database;
    }

    private async openDatabase(): Promise<SQLiteDBConnection> {
        const { CapacitorSQLite, SQLiteConnection } = await this.loadModule();
        const sqlite = new SQLiteConnection(CapacitorSQLite);

        const consistent = (await sqlite.checkConnectionsConsistency()).result;
        const exists = (await sqlite.isConnection(DATABASE_NAME, false))
            .result;

        // Must run before createConnection(): the plugin captures the upgrade
        // map when it builds the connection and only then applies it on open().
        // Registering it afterwards leaves a fresh database with no tables.
        await sqlite.addUpgradeStatement(DATABASE_NAME, [
            {
                toVersion: DATABASE_VERSION,
                statements: [...NATIVE_PLAYLIST_SCHEMA],
            },
        ]);

        const database =
            consistent && exists
                ? await sqlite.retrieveConnection(DATABASE_NAME, false)
                : await sqlite.createConnection(
                      DATABASE_NAME,
                      false,
                      'no-encryption',
                      DATABASE_VERSION,
                      false
                  );

        if (!(await database.isDBOpen()).result) {
            await database.open();
        }
        return database;
    }
}
