/**
 * Deterministic, one-way reference for a connection's secret material.
 *
 * The vault is addressed through opaque ids, so the renderer needs a stable
 * way to turn a connection's secret fields into that id without storing or
 * displaying the material itself. `buildCredentialReference` hashes the
 * non-empty fields in a fixed canonical order, producing a `vault:<sha256>`
 * reference that is:
 *
 * - idempotent: the same input always maps to the same reference (across
 *   restarts and machines — `sha256` is keyed by the material, nothing else),
 * - injective in practice: fields are escaped and delimited canonically, so
 *   distinct inputs cannot share a canonical string,
 * - non-reversible: only the digest is kept; the input cannot be recovered
 *   from the reference.
 *
 * Canonical field order (only non-empty fields participate, joined with `|`):
 *
 *     serverUrl | username | password | mac | serial | deviceIds | signatures
 *
 * `deviceIds` and `signatures` are ordered string lists; empty entries are
 * dropped and entries are comma-joined. Values are escaped canonically
 * (`\` → `\\`, `,` → `\,`, `|` → `\|`) before joining so delimiter
 * collisions cannot merge distinct inputs. Values are taken verbatim — no
 * trimming or case folding — so only truly identical inputs collide. An
 * input with no present field at all maps to `null` (nothing to reference).
 */

import { createHash } from 'node:crypto';

/** Prefix of every vault credential id produced here. */
export const CREDENTIAL_REFERENCE_PREFIX = 'vault:';

/** Secret material of a connection, in provider-agnostic terms. */
export interface CredentialReferenceInput {
    /** Portal base URL (Xtream/Stalker panel origin). */
    serverUrl?: string | null;
    /** Xtream/Stalker username. */
    username?: string | null;
    /** Xtream/Stalker password. */
    password?: string | null;
    /** Stalker MAC address. */
    mac?: string | null;
    /** Stalker serial number. */
    serial?: string | null;
    /** Stalker device id list; order preserved. */
    deviceIds?: string[] | null;
    /** Stalker signature values; order preserved. */
    signatures?: string[] | null;
}

function escapeCanonicalValue(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/,/g, '\\,');
}

function scalarField(value: string | null | undefined): string | null {
    if (typeof value !== 'string' || value.length === 0) {
        return null;
    }
    return escapeCanonicalValue(value);
}

function listField(values: readonly unknown[] | null | undefined): string | null {
    if (!Array.isArray(values)) {
        return null;
    }
    const entries = values
        .filter(
            (entry): entry is string =>
                typeof entry === 'string' && entry.length > 0
        )
        .map(escapeCanonicalValue);
    return entries.length > 0 ? entries.join(',') : null;
}

/** Joins the escaped, non-empty canonical fields; null when nothing is set. */
function buildCanonicalSecret(input: CredentialReferenceInput): string | null {
    const fields = [
        scalarField(input.serverUrl),
        scalarField(input.username),
        scalarField(input.password),
        scalarField(input.mac),
        scalarField(input.serial),
        listField(input.deviceIds),
        listField(input.signatures),
    ].filter((field): field is string => field !== null);

    return fields.length > 0 ? fields.join('|') : null;
}

/**
 * Builds the stable `vault:<sha256-hex>` reference for the given connection
 * secret material, or `null` for an input with no present field. Never
 * throws — anything unusable is treated as absent.
 */
export function buildCredentialReference(
    input: CredentialReferenceInput | null | undefined
): string | null {
    const canonical = input ? buildCanonicalSecret(input) : null;
    if (canonical === null) {
        return null;
    }
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
    return `${CREDENTIAL_REFERENCE_PREFIX}${digest}`;
}
