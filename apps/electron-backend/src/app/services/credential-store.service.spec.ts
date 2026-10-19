import {
    CredentialStoreError,
    KeyringEntryLike,
    KeyringModuleLike,
    WindowsCredentialStore,
} from './credential-store.service';

type FakeOperation = 'setPassword' | 'getPassword' | 'deleteCredential';

/**
 * Fake keyring: credentials live in a map shared by account id, so a fresh
 * `Entry` per service call still sees earlier writes, mirroring the real
 * backend. Failure hooks simulate vault errors. The real Windows Credential
 * Manager is never touched in CI.
 */
function createFakeKeyring(
    failures: Map<FakeOperation, (account: string) => Error> = new Map()
): KeyringModuleLike & {
    credentials: Map<string, string | null>;
    createdEntries: Array<{ service: string; account: string }>;
    operations: Array<{ account: string; operation: FakeOperation }>;
} {
    const credentials = new Map<string, string | null>();
    const createdEntries: Array<{ service: string; account: string }> = [];
    const operations: Array<{
        account: string;
        operation: FakeOperation;
    }> = [];

    class FakeEntry implements KeyringEntryLike {
        constructor(
            readonly service: string,
            readonly account: string
        ) {
            createdEntries.push({ service, account });
        }

        setPassword(password: string): void {
            this.run('setPassword');
            credentials.set(this.account, password);
        }

        getPassword(): string | null {
            this.run('getPassword');
            return credentials.get(this.account) ?? null;
        }

        deleteCredential(): boolean {
            this.run('deleteCredential');
            const existed = credentials.get(this.account) != null;
            credentials.delete(this.account);
            return existed;
        }

        private run(operation: FakeOperation): void {
            operations.push({ account: this.account, operation });
            const failure = failures.get(operation);
            if (failure) {
                throw failure(this.account);
            }
        }
    }

    return { Entry: FakeEntry, credentials, createdEntries, operations };
}

const SERVICE = 'iptv-player-new';
const ID = 'playlist-credential-1';
const SECRET = 'SUPER-SECRET-VALUE-42';

describe('WindowsCredentialStore', () => {
    let keyring: ReturnType<typeof createFakeKeyring>;

    function createStore(
        failures?: Map<FakeOperation, (account: string) => Error>
    ): WindowsCredentialStore {
        keyring = createFakeKeyring(failures);
        return new WindowsCredentialStore(() => keyring);
    }

    it('round-trips a secret through the fixed service and the opaque id', async () => {
        const store = createStore();

        await store.set(ID, SECRET);
        await expect(store.get(ID)).resolves.toBe(SECRET);
        await expect(store.get('other-id')).resolves.toBeNull();

        expect(keyring.createdEntries.map((entry) => entry.service)).toEqual([
            SERVICE,
            SERVICE,
            SERVICE,
        ]);
        expect(keyring.createdEntries.map((entry) => entry.account)).toEqual([
            ID,
            ID,
            'other-id',
        ]);
    });

    it('get returns null for an unknown id without touching stored values', async () => {
        const store = createStore();

        await store.set(ID, SECRET);
        await expect(store.get('unknown-id')).resolves.toBeNull();
        await expect(store.get(ID)).resolves.toBe(SECRET);

        expect(keyring.credentials.get(ID)).toBe(SECRET);
        expect(keyring.credentials.has('unknown-id')).toBe(false);
    });

    it('delete reports true only when a credential existed', async () => {
        const store = createStore();

        await expect(store.delete(ID)).resolves.toBe(false);
        await store.set(ID, SECRET);
        await expect(store.delete(ID)).resolves.toBe(true);
        await expect(store.get(ID)).resolves.toBeNull();
        await expect(store.delete(ID)).resolves.toBe(false);
    });

    it('rejects invalid ids with a typed error and never opens the vault', async () => {
        const store = createStore();
        const invalidIds = [
            '',
            'has\u0000control',
            'tab\tseparated',
            'trailing\u001f',
            'delete\u007f',
            'x'.repeat(129),
        ];

        for (const invalidId of invalidIds) {
            await expect(store.set(invalidId, SECRET)).rejects.toMatchObject({
                name: 'CredentialStoreError',
                code: 'invalid-id',
            });
            await expect(store.get(invalidId)).rejects.toBeInstanceOf(
                CredentialStoreError
            );
            await expect(store.delete(invalidId)).rejects.toBeInstanceOf(
                CredentialStoreError
            );
        }

        expect(keyring.createdEntries).toHaveLength(0);
        expect(keyring.operations).toHaveLength(0);
    });

    it('reports unavailability when the keyring module cannot load', async () => {
        const store = new WindowsCredentialStore(() => {
            throw new Error('native module missing');
        });

        expect(store.isAvailable()).toBe(false);
        await expect(store.get(ID)).rejects.toMatchObject({
            name: 'CredentialStoreError',
            code: 'unavailable',
        });
        await expect(store.set(ID, SECRET)).rejects.toMatchObject({
            code: 'unavailable',
        });
        await expect(store.delete(ID)).rejects.toMatchObject({
            code: 'unavailable',
        });
    });

    it('reports availability when the keyring module loads', () => {
        const store = createStore();

        expect(store.isAvailable()).toBe(true);
    });

    it('maps native read, write and delete failures to a typed failure', async () => {
        const failures = new Map<FakeOperation, (account: string) => Error>([
            ['setPassword', () => new Error('store locked')],
            ['getPassword', () => new Error('store locked')],
            ['deleteCredential', () => new Error('store locked')],
        ]);
        const store = createStore(failures);

        await expect(store.set(ID, SECRET)).rejects.toMatchObject({
            name: 'CredentialStoreError',
            code: 'failure',
        });
        await expect(store.get(ID)).rejects.toMatchObject({ code: 'failure' });
        await expect(store.delete(ID)).rejects.toMatchObject({
            code: 'failure',
        });
        expect(keyring.credentials.size).toBe(0);
    });

    it('never leaks the secret in error messages', async () => {
        const store = createStore(
            new Map([
                [
                    'setPassword',
                    () => new Error(`native failure for value ${SECRET} near`),
                ],
            ])
        );

        const error = await store.set(ID, SECRET).then(
            () => undefined,
            (caught: unknown) => caught
        );

        expect(error).toBeInstanceOf(CredentialStoreError);
        expect((error as CredentialStoreError).code).toBe('failure');
        expect(JSON.stringify(error)).not.toContain(SECRET);
    });

    it('keeps control characters out of error messages', async () => {
        const store = createStore(
            new Map([['getPassword', () => new Error('boom\u0007x\u001by')]])
        );

        const error = await store.get(ID).then(
            () => undefined,
            (caught: unknown) => caught
        );

        expect(error).toBeInstanceOf(CredentialStoreError);
        const message = (error as CredentialStoreError).message;
        const hasControlChar = [...message].some((char) => {
            const code = char.charCodeAt(0);
            return code <= 0x1f || code === 0x7f;
        });
        expect(hasControlChar).toBe(false);
    });
});
