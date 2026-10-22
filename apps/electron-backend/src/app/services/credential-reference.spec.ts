import { createHash } from 'node:crypto';
import {
    CREDENTIAL_REFERENCE_PREFIX,
    buildCredentialReference,
} from './credential-reference';

function expectedRef(canonical: string): string {
    return `${CREDENTIAL_REFERENCE_PREFIX}${createHash('sha256')
        .update(canonical, 'utf8')
        .digest('hex')}`;
}

describe('buildCredentialReference', () => {
    it('produces vault:<sha256-hex> over the canonical non-empty fields in order', () => {
        const reference = buildCredentialReference({
            serverUrl: 'http://portal.example',
            username: 'user',
            password: 'pass',
            mac: '00:1A:79:00:00:01',
            serial: 'SN-1',
            deviceIds: ['dev-1', 'dev-2'],
            signatures: ['sig-1'],
        });

        expect(reference).toBe(
            expectedRef('http://portal.example|user|pass|00:1A:79:00:00:01|SN-1|dev-1,dev-2|sig-1')
        );
        expect(reference).toMatch(/^vault:[0-9a-f]{64}$/);
    });

    it('skips empty fields instead of reserving their slots', () => {
        expect(
            buildCredentialReference({
                serverUrl: 'http://portal.example',
                username: '',
                password: 'pass',
            })
        ).toBe(expectedRef('http://portal.example|pass'));
    });

    it('is idempotent for the same input', () => {
        const input = {
            serverUrl: 'http://portal.example',
            username: 'user',
            password: 'hunter2',
        };

        expect(buildCredentialReference(input)).toBe(
            buildCredentialReference({ ...input })
        );
    });

    it('distinguishes inputs that differ in one field', () => {
        const base = {
            serverUrl: 'http://portal.example',
            username: 'user',
            password: 'hunter2',
        };

        expect(buildCredentialReference(base)).not.toBe(
            buildCredentialReference({ ...base, password: 'hunter3' })
        );
        expect(buildCredentialReference(base)).not.toBe(
            buildCredentialReference({ ...base, mac: '00:1A:79:00:00:02' })
        );
    });

    it('distinguishes delimiter collisions between fields and inside lists', () => {
        // Two scalar fields whose joined text equals one field with a literal
        // delimiter inside must not share a reference.
        expect(
            buildCredentialReference({ serverUrl: 'a', username: 'b' })
        ).not.toBe(buildCredentialReference({ serverUrl: 'a|b' }));

        // Same for list entries split across a comma.
        expect(
            buildCredentialReference({ deviceIds: ['a,b'] })
        ).not.toBe(buildCredentialReference({ deviceIds: ['a', 'b'] }));

        // And the escaped forms stay distinct from literal backslashes.
        expect(buildCredentialReference({ serverUrl: 'a\\|b' })).not.toBe(
            buildCredentialReference({ serverUrl: 'a|b' })
        );
    });

    it('returns null for wholly empty inputs instead of throwing', () => {
        expect(buildCredentialReference(null)).toBeNull();
        expect(buildCredentialReference(undefined)).toBeNull();
        expect(buildCredentialReference({})).toBeNull();
        expect(
            buildCredentialReference({
                serverUrl: '',
                username: '',
                password: '',
                mac: '',
                serial: '',
                deviceIds: [],
                signatures: [],
            })
        ).toBeNull();
    });

    it('ignores empty list entries and non-string list entries', () => {
        expect(
            buildCredentialReference({ deviceIds: ['dev-1', '', 'dev-2'] })
        ).toBe(buildCredentialReference({ deviceIds: ['dev-1', 'dev-2'] }));
        expect(
            buildCredentialReference({ deviceIds: [42] as unknown as string[] })
        ).toBeNull();
    });

    it('is order-sensitive for list fields', () => {
        expect(buildCredentialReference({ deviceIds: ['a', 'b'] })).not.toBe(
            buildCredentialReference({ deviceIds: ['b', 'a'] })
        );
    });

    it('never exposes the input material in the reference', () => {
        const secret = 'hunter2-sentinel-secret';
        const reference = buildCredentialReference({
            serverUrl: 'http://portal.example',
            password: secret,
        });

        expect(reference).not.toContain(secret);
        expect(reference).not.toContain('portal.example');
    });
});
