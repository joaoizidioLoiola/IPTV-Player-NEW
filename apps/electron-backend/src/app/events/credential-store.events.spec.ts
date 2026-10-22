import {
    CredentialStoreError,
    CredentialStore,
} from '../services/credential-store.service';

type Handler = (
    event: unknown,
    payload: unknown
) => Promise<unknown>;

type RegisteredHandler = { channel: string; handler: Handler };

const registered: RegisteredHandler[] = [];

jest.mock('electron', () => ({
    ipcMain: {
        handle: jest.fn((channel: string, handler: Handler) => {
            registered.push({ channel, handler });
        }),
    },
}));

jest.mock('../services/credential-store.service', () => {
    // Real error class stays, so handlers can instanceof-check it.
    const actual = jest.requireActual('../services/credential-store.service');
    return { ...actual, WindowsCredentialStore: jest.fn() };
});

const SECRET = 'sentinel-vault-secret';
const ID = 'vault:0123456789abcdef';

function importAndRegister(store: unknown): void {
    return jest
        .requireActual('./credential-store.events')
        .registerCredentialStoreHandlers(store as CredentialStore);
}

function handlerFor(channel: string): Handler {
    const entry = registered.find((item) => item.channel === channel);
    if (!entry) {
        throw new Error(`No handler registered for ${channel}`);
    }
    return entry.handler;
}

function createMockStore(overrides: Partial<CredentialStore> = {}): CredentialStore {
    return {
        isAvailable: jest.fn(() => true),
        get: jest.fn(() => Promise.resolve(null)),
        set: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve(true)),
        ...overrides,
    };
}

describe('credential-store.events', () => {
    beforeEach(() => {
        registered.length = 0;
    });

    it('registers one handler per vault channel', async () => {
        importAndRegister(createMockStore());

        expect(registered.map(({ channel }) => channel)).toEqual([
            'CREDENTIAL_STORE:IS_AVAILABLE',
            'CREDENTIAL_STORE:GET',
            'CREDENTIAL_STORE:SET',
            'CREDENTIAL_STORE:DELETE',
        ]);
    });

    it('reports availability without touching the vault', async () => {
        importAndRegister(createMockStore());

        await expect(
            handlerFor('CREDENTIAL_STORE:IS_AVAILABLE')({}, undefined)
        ).resolves.toEqual({ available: true });
    });

    it('returns the secret only on an explicit get of a stored id', async () => {
        const store = createMockStore({
            get: jest.fn(() => Promise.resolve(SECRET)),
        });
        importAndRegister(store);

        await expect(
            handlerFor('CREDENTIAL_STORE:GET')({}, { id: ID })
        ).resolves.toEqual({ success: true, secret: SECRET });
        expect(store.get).toHaveBeenCalledWith(ID);
    });

    it('resolves a null-secret success envelope when the id has no entry', async () => {
        importAndRegister(createMockStore());

        await expect(
            handlerFor('CREDENTIAL_STORE:GET')({}, { id: ID })
        ).resolves.toEqual({ success: true, secret: null });
    });

    it('writes and deletes through the single injected store', async () => {
        const store = createMockStore();
        importAndRegister(store);

        await expect(
            handlerFor('CREDENTIAL_STORE:SET')(
                {},
                { id: ID, secret: SECRET }
            )
        ).resolves.toEqual({ success: true });
        expect(store.set).toHaveBeenCalledWith(ID, SECRET);

        await expect(
            handlerFor('CREDENTIAL_STORE:DELETE')({}, { id: ID })
        ).resolves.toEqual({ success: true, deleted: true });
        expect(store.delete).toHaveBeenCalledWith(ID);
    });

    // The handler guards only the invoke-payload shape (non-empty string id);
    // id-format validation beyond that (length, control characters) belongs
    // to the store's `assertValidId` and is covered by the store's own spec,
    // so a mock without that validation still honours the real contract.
    it.each([
        undefined,
        null,
        {},
        { id: '' },
        { id: 42 },
    ])('answers %p with an invalid-id envelope instead of throwing', async (payload) => {
        importAndRegister(createMockStore());

        await expect(
            handlerFor('CREDENTIAL_STORE:GET')({}, payload)
        ).resolves.toEqual({
            success: false,
            code: 'invalid-id',
            error: expect.any(String),
        });
    });

    it('rejects a non-string secret without leaking the payload', async () => {
        importAndRegister(createMockStore());

        const result = (await handlerFor('CREDENTIAL_STORE:SET')(
            {},
            { id: ID, secret: { nested: SECRET } }
        )) as { success: boolean; code: string; error: string };

        expect(result.success).toBe(false);
        expect(result.code).toBe('invalid-id');
        expect(JSON.stringify(result)).not.toContain(SECRET);
    });

    it('propagates the store error code and sanitized message', async () => {
        const message = 'Credential store read for "x" failed (Backend failure).';
        importAndRegister(
            createMockStore({
                get: jest.fn(() =>
                    Promise.reject(
                        new CredentialStoreError('unavailable', message)
                    )
                ),
            })
        );

        await expect(
            handlerFor('CREDENTIAL_STORE:GET')({}, { id: ID })
        ).resolves.toEqual({
            success: false,
            code: 'unavailable',
            error: message,
        });
    });

    it.each(['set', 'delete'])(
        'collapses unexpected failures on %s onto a secret-free generic message',
        async (operation) => {
            importAndRegister(
                createMockStore({
                    // Native-style error whose message embeds the secret.
                    [operation]: jest.fn(() =>
                        Promise.reject(new Error(`token=${SECRET}`))
                    ),
                }) as Record<string, jest.Mock> as unknown as CredentialStore
            );

            const channel =
                operation === 'set'
                    ? 'CREDENTIAL_STORE:SET'
                    : 'CREDENTIAL_STORE:DELETE';
            const envelope = (await handlerFor(channel)(
                {},
                operation === 'set' ? { id: ID, secret: SECRET } : { id: ID }
            )) as { success: boolean; code: string; error: string };

            expect(envelope).toEqual({
                success: false,
                code: 'failure',
                error: 'Credential store request failed.',
            });
            expect(envelope.error).not.toContain(SECRET);
            expect(envelope.error).not.toContain('token=');
        }
    );
});
