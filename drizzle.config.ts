import type { Config } from 'drizzle-kit';
import { homedir } from 'os';
import { join } from 'path';

// Use home directory with a simple path (no spaces) to avoid libSQL issues
// This matches the path used in connection.ts (product data root)
const dbDir = join(homedir(), '.iptv-player-new', 'databases');
const dbPath = join(dbDir, 'iptv-player-new.db');
// libSQL requires file: prefix
const dbUrl = `file:${dbPath}`;

export default {
    schema: './apps/electron-backend/src/app/database/schema.ts',
    out: './apps/electron-backend/src/app/database/migrations',
    // libSQL/Turso dialect works for both remote and local file URLs
    dialect: 'turso',
    dbCredentials: {
        // Use file: URL format
        url: dbUrl,
        // When using remote, set LIBSQL_URL/LIBSQL_AUTH_TOKEN envs and run studio with --config
    },
} satisfies Config;
