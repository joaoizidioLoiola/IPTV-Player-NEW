/**
 * Windows Credential Manager vault for the main process.
 *
 * Secrets are stored under a fixed service name with an opaque account id
 * supplied by the caller. This module must stay inside `electron-backend`:
 * it is the only place allowed to touch `@napi-rs/keyring`, so the native
 * `.node` binary can never be reached from the renderer or shared libs.
 * IPC/preload wiring for this store lands in a later slice.
 */

/** Fixed Credential Manager service so all app credentials share a namespace. */
const KEYRING_SERVICE = 'iptv-player-new';

/** Upper bound for opaque ids; generous, but bounded on purpose. */
const MAX_ID_LENGTH = 128;

/** Ids are opaque references: non-empty, bounded, no control characters. */
function hasControlCharacters(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code <= 0x1f || code === 0x7f) {
            return true;
        }
    }
    return false;
}

export type CredentialStoreErrorCode =
    | 'invalid-id'
    | 'unavailable'
    | 'failure';

/**
 * Typed vault failure. Messages describe the operation only — they never
 * contain the stored secret or raw credential-store payloads.
 */
export class CredentialStoreError extends Error {
    readonly code: CredentialStoreErrorCode;

    constructor(code: CredentialStoreErrorCode, message: string) {
        super(message);
        this.name = 'CredentialStoreError';
        this.code = code;
    }
}

/**
 * Narrow surface of the `@napi-rs/keyring` sync `Entry` class the store
 * relies on; keeps tests hermetic via a fake loader.
 */
export type KeyringEntryLike = {
    setPassword(password: string): void;
    getPassword(): string | null;
    deleteCredential(): boolean;
};

export type KeyringModuleLike = {
    Entry: new (service: string, username: string) => KeyringEntryLike;
};

/** Returns the real keyring module; injectable so tests never touch the vault. */
export type KeyringLoader = () => KeyringModuleLike;

/** Minimal vault contract consumed by future IPC handlers. */
export interface CredentialStore {
    isAvailable(): boolean;
    get(id: string): Promise<string | null>;
    set(id: string, secret: string): Promise<void>;
    delete(id: string): Promise<boolean>;
}

/**
 * Lazy CommonJS require mirrors `database.worker-connection.ts`: the native
 * binary resolves at first use, not at module load, and stays external to
 * the webpack bundle. Never imported from the renderer or shared libs.
 */
const defaultKeyringLoader: KeyringLoader = () => {
    const required = require('@napi-rs/keyring') as {
        Entry: KeyringModuleLike['Entry'];
    };
    return required;
};

function assertValidId(id: string): string {
    if (typeof id !== 'string' || id.length === 0) {
        throw new CredentialStoreError(
            'invalid-id',
            'Credential id must be a non-empty string.'
        );
    }
    if (id.length > MAX_ID_LENGTH) {
        throw new CredentialStoreError(
            'invalid-id',
            `Credential id exceeds ${MAX_ID_LENGTH} characters.`
        );
    }
    if (hasControlCharacters(id)) {
        throw new CredentialStoreError(
            'invalid-id',
            'Credential id must not contain control characters.'
        );
    }
    return id;
}

/**
 * Strips control characters and any accidental secret occurrence from a
 * native error message before it is re-thrown, so diagnostics can never
 * leak credential material.
 */
function sanitizeDetail(detail: string, secret?: string): string {
    const cleaned = Array.from(detail)
        .map((char) => {
            const code = char.charCodeAt(0);
            return code <= 0x1f || code === 0x7f ? ' ' : char;
        })
        .join('');
    if (secret && cleaned.includes(secret)) {
        return cleaned.split(secret).join('<redacted>');
    }
    return cleaned;
}

function describeError(error: unknown): string {
    return error instanceof Error
        ? error.name
        : 'Unknown credential store error';
}

function wrapVaultFailure(
    operation: string,
    error: unknown,
    secret?: string
): CredentialStoreError {
    const detail =
        error instanceof Error
            ? sanitizeDetail(error.message, secret)
            : describeError(error);
    return new CredentialStoreError(
        'failure',
        `Credential store ${operation} failed (${detail}).`
    );
}

export class WindowsCredentialStore implements CredentialStore {
    private readonly loadKeyring: KeyringLoader;

    constructor(loadKeyring: KeyringLoader = defaultKeyringLoader) {
        this.loadKeyring = loadKeyring;
    }

    /**
     * True when the native keyring module loads. Does not read or write the
     * credential store.
     */
    isAvailable(): boolean {
        try {
            this.loadKeyring();
            return true;
        } catch {
            return false;
        }
    }

    async get(id: string): Promise<string | null> {
        assertValidId(id);
        const entry = this.createEntryOrThrow(id);
        try {
            return entry.getPassword();
        } catch (error) {
            throw wrapVaultFailure(`read for "${id}"`, error);
        }
    }

    async set(id: string, secret: string): Promise<void> {
        assertValidId(id);
        const entry = this.createEntryOrThrow(id);
        try {
            entry.setPassword(secret);
        } catch (error) {
            throw wrapVaultFailure(`write for "${id}"`, error, secret);
        }
    }

    async delete(id: string): Promise<boolean> {
        assertValidId(id);
        const entry = this.createEntryOrThrow(id);
        try {
            return entry.deleteCredential();
        } catch (error) {
            throw wrapVaultFailure(`delete for "${id}"`, error);
        }
    }

    private createEntryOrThrow(id: string): KeyringEntryLike {
        let module: KeyringModuleLike;
        try {
            module = this.loadKeyring();
        } catch {
            throw new CredentialStoreError(
                'unavailable',
                'Windows credential store is unavailable: the keyring native module failed to load.'
            );
        }
        return new module.Entry(KEYRING_SERVICE, id);
    }
}
