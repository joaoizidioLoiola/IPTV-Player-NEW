import { WindowsCredentialStore } from './credential-store.service';

/**
 * Integration probe against the REAL Windows Credential Manager via the
 * default keyring loader (real `@napi-rs/keyring` native module, no fakes).
 * The credential id is opaque and unique per run so concurrent executions
 * never collide, and the vault entry is always removed in `finally`, even
 * when an assertion fails, leaving the user's credential store clean.
 * Runs under plain Jest/Node; no Electron runtime or window is involved.
 * CI on Ubuntu has no Credential Manager backend, so it is skipped there.
 */
const describeOnWindows =
    process.platform === 'win32' ? describe : describe.skip;

describeOnWindows('WindowsCredentialStore (real vault integration)', () => {
    it(
        'round-trips a secret through the real credential store and cleans up',
        async () => {
            const store = new WindowsCredentialStore();
            const id = `shape-probe-${process.pid}-${Date.now()}`;
            const secret = 'shape-probe-secret-DO-NOT-PERSIST';
            let deleted = false;

            try {
                await store.set(id, secret);
                await expect(store.get(id)).resolves.toBe(secret);

                await expect(store.delete(id)).resolves.toBe(true);
                deleted = true;

                await expect(store.get(id)).resolves.toBeNull();
            } finally {
                if (!deleted) {
                    // Best-effort cleanup when an assertion above failed
                    // while the credential still exists in the vault.
                    await store.delete(id).catch(() => undefined);
                }
            }
        },
        15_000
    );
});
