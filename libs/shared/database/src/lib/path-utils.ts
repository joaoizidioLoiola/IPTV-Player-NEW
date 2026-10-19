import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const IPTVNATOR_E2E_DATA_DIR_ENV = 'IPTVNATOR_E2E_DATA_DIR';

/**
 * Operator-selected data root for deployments that keep the database on a
 * mounted volume, for example `/data`. The E2E override wins.
 */
export const IPTVNATOR_DATA_DIR_ENV = 'IPTVNATOR_DATA_DIR';

function ensureDirectory(dirPath: string): string {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }

    return dirPath;
}

/**
 * Product-specific data root. Deliberately NOT the upstream `~/.iptvnator`:
 * this fork never reads, imports or migrates another app's profile.
 */
const PRODUCT_DATA_DIR = '.iptv-player-new';

/** Versioned database file name, owned by this product. */
const PRODUCT_DATABASE_FILE = 'iptv-player-new.db';

export function getIptvnatorDataRoot(): string {
    const e2eDataDir = process.env[IPTVNATOR_E2E_DATA_DIR_ENV]?.trim();

    if (e2eDataDir) {
        return ensureDirectory(e2eDataDir);
    }

    const dataDir = process.env[IPTVNATOR_DATA_DIR_ENV]?.trim();

    if (dataDir) {
        return ensureDirectory(dataDir);
    }

    return ensureDirectory(join(homedir(), PRODUCT_DATA_DIR));
}

export function getIptvnatorDatabaseDirectory(): string {
    return ensureDirectory(join(getIptvnatorDataRoot(), 'databases'));
}

export function getIptvnatorDatabasePath(): string {
    return join(getIptvnatorDatabaseDirectory(), PRODUCT_DATABASE_FILE);
}

export function getElectronUserDataPath(): string | null {
    const e2eDataDir = process.env[IPTVNATOR_E2E_DATA_DIR_ENV]?.trim();

    if (!e2eDataDir) {
        return null;
    }

    return ensureDirectory(join(e2eDataDir, 'user-data'));
}

export function getElectronConfigDirectory(): string | null {
    const e2eDataDir = process.env[IPTVNATOR_E2E_DATA_DIR_ENV]?.trim();

    if (!e2eDataDir) {
        return null;
    }

    return ensureDirectory(join(e2eDataDir, 'config'));
}
