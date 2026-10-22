/**
 * Renderer access to the Windows Credential Manager vault.
 *
 * The renderer addresses secrets only through opaque ids (`vault:<sha256>`
 * references, see `credential-reference.ts`); the secret value itself crosses
 * the bridge once, on `CREDENTIAL_STORE:SET`, and is never sent back except
 * on an explicit `GET` for a UI flow that needs it.
 *
 * Every handler answers with a typed envelope instead of rejecting: a raw
 * rejection would make Electron log the failure with whatever payload the
 * native keyring error carried. Failures propagate only the store's error
 * `code` and its already-sanitized message — the store guarantees its
 * messages never contain the secret, and anything unexpected is collapsed
 * onto a fixed generic message.
 */

import { ipcMain } from 'electron';
import {
    CREDENTIAL_STORE_DELETE,
    CREDENTIAL_STORE_GET,
    CREDENTIAL_STORE_IS_AVAILABLE,
    CREDENTIAL_STORE_SET,
    ElectronBridgeCredentialStoreAvailabilityResult,
    ElectronBridgeCredentialStoreDeleteResult,
    ElectronBridgeCredentialStoreGetResult,
    ElectronBridgeCredentialStoreWriteResult,
} from '@iptvnator/shared/interfaces';
import {
    CredentialStore,
    CredentialStoreError,
    WindowsCredentialStore,
} from '../services/credential-store.service';

/** Single vault instance shared by every handler in the main process. */
const credentialStore: CredentialStore = new WindowsCredentialStore();

/** Message for unexpected (non-`CredentialStoreError`) failures. */
const UNEXPECTED_FAILURE_MESSAGE = 'Credential store request failed.';

function invalidIdError(): CredentialStoreError {
    return new CredentialStoreError(
        'invalid-id',
        'Credential id must be a non-empty string.'
    );
}

/** Reads the opaque id from the invoke payload, rejecting junk requests. */
function readId(payload: unknown): string {
    const id = (payload as { id?: unknown } | undefined)?.id;
    if (typeof id !== 'string' || id.length === 0) {
        throw invalidIdError();
    }
    return id;
}

/** Maps any thrown error onto a secret-free failure envelope. */
function toErrorEnvelope(
    error: unknown
): ElectronBridgeCredentialStoreGetResult {
    if (error instanceof CredentialStoreError) {
        return {
            success: false,
            code: error.code,
            error: error.message,
        };
    }
    // Unknown origin: carry nothing but the generic message, so a native
    // error string that embeds secret material can never reach the renderer.
    return {
        success: false,
        code: 'failure',
        error: UNEXPECTED_FAILURE_MESSAGE,
    };
}

export function registerCredentialStoreHandlers(
    store: CredentialStore = credentialStore
): void {
    ipcMain.handle(
        CREDENTIAL_STORE_IS_AVAILABLE,
        async (): Promise<ElectronBridgeCredentialStoreAvailabilityResult> => ({
            available: store.isAvailable(),
        })
    );

    ipcMain.handle(
        CREDENTIAL_STORE_GET,
        async (
            _event,
            payload: unknown
        ): Promise<ElectronBridgeCredentialStoreGetResult> => {
            try {
                const id = readId(payload);
                return { success: true, secret: await store.get(id) };
            } catch (error) {
                return toErrorEnvelope(error);
            }
        }
    );

    ipcMain.handle(
        CREDENTIAL_STORE_SET,
        async (
            _event,
            payload: unknown
        ): Promise<ElectronBridgeCredentialStoreWriteResult> => {
            try {
                const id = readId(payload);
                const secret = (payload as { secret?: unknown })?.secret;
                if (typeof secret !== 'string') {
                    throw new CredentialStoreError(
                        'invalid-id',
                        'Credential secret must be a string.'
                    );
                }
                await store.set(id, secret);
                return { success: true };
            } catch (error) {
                return toErrorEnvelope(error);
            }
        }
    );

    ipcMain.handle(
        CREDENTIAL_STORE_DELETE,
        async (
            _event,
            payload: unknown
        ): Promise<ElectronBridgeCredentialStoreDeleteResult> => {
            try {
                const id = readId(payload);
                return { success: true, deleted: await store.delete(id) };
            } catch (error) {
                return toErrorEnvelope(error);
            }
        }
    );
}
