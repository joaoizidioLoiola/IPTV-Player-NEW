# Windows Release Pipeline

The fork's canonical release flow: how an installer is built, signed,
published and picked up by the app's self-update channel. The upstream
multi-platform contract stays in [release-pipeline.md](release-pipeline.md);
this document describes what actually runs in this fork, which is
Windows-only.

## One release destination

Everything publishes to `joaoizidioLoiola/IPTV-Player-NEW`:

| Concern | Place |
| --- | --- |
| electron-builder `publish` endpoint | `electron-builder.json` (`provider: github`) |
| Updater feed (startup/manual checks, catalogs) | `libs/shared/interfaces/src/lib/app-update-channel.util.ts` (`APP_UPDATE_REPOSITORIES`) |
| PWA update check (browser path only) | `apps/web/src/app/services/settings.service.ts` (`RELEASES_API_URL`) |
| Tag pipeline | `.github/workflows/windows-release.yaml` |

The app embeds that endpoint as `resources/app-update.yml` at packaging time;
electron-updater reads it, electron-builder generates `latest.yml` (Windows
channel file) plus the installer's `.blockmap` for delta downloads, and
`windows-release.yaml` uploads all three to the release.

The `nightly` update channel keeps its code path but points at the same
repository: it selects releases carrying the `nightly` prerelease identifier,
and since nothing publishes those yet the channel simply reports "no
updates". Removing the channel entirely would require touching the renderer
settings UI (persisted `Settings.updateChannel`), which is deliberately kept
out of this change. Do not publish nightlies until that decision is made —
the pinned-DB-schema downgrade warning in release-pipeline.md applies.

## Workflow: `windows-release.yaml`

Trigger: push a tag `v*.*.*`. Steps:

1. Fail closed if the tag is not exactly `v<package.json version>` — the
   release version is chosen deliberately by bumping `package.json` (see the
   release-cut skill; nothing derives it).
2. Validate `CSC_LINK` / `CSC_KEY_PASSWORD` secrets (see below). An empty
   secret aborts the run: electron-builder would otherwise skip signing
   silently, and an unsigned installer must never reach a self-update
   channel.
3. Stage the checksum-pinned Windows Embedded MPV runtime
   (`tools/embedded-mpv/windows-runtime-pin.json`).
4. `pnpm run make:app -- --publishPolicy=never` with the signing
   credentials: builds the frontend, backend and native addon, then
   electron-builder packages the NSIS x64 installer and signs it.
5. `pnpm run verify:package-layout -- windows x64`, verify the packaged
   `app-update.yml` names this repository, and `signtool verify /pa /all`
   the installer.
6. Extract the public release body from `CHANGELOG.md`
   (`tools/release/extract-changelog-section.mjs --public`), create the
   release as a **draft** and upload the installer, `.blockmap` and
   `latest.yml`.

**Publishing the draft is the manual gate** (same as upstream): electron-updater
only consults published releases, so the update channel goes live for
installed apps exactly when a human publishes the draft. Workflow dispatches
build and validate but create no release.

## Signing

electron-builder 26 signs with `signtool` (`electron-builder.json`):

- `win.signtoolOptions.signingHashAlgorithms: ["sha256"]` — no sha1 dual
  signature. `signExts` must stay a **`win`** key: electron-builder 26
  validates it against `WindowsConfiguration`, and nesting it inside
  `signtoolOptions` fails schema validation before packaging starts.
- `win.signExts: [".dll", ".node"]` — extends the default "every `.exe` in the
  package" set (app executable, uninstaller, installer) to the unpacked
  native payload: mpv DLLs, `embedded_mpv.node`, frame-copy helper and
  reader, better-sqlite3's prebuilds.
- `files` excludes the non-Windows `better-sqlite3` prebuilds
  (`darwin-*`, `linux*`, `android-*`, `freebsd-*`). They ship in the npm
  package and reach `win-unpacked` otherwise; `signtool` then aborts the whole
  build on a Mach-O/ELF file it cannot sign.
- The certificate itself is never in the repository. Credentials arrive as
  environment variables, electron-builder's documented channel
  (`CSC_LINK` / `CSC_KEY_PASSWORD`, `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`
  aliases accepted):

**[DECISÃO]** The production Authenticode certificate is issued to the
company's **CNPJ** (legal entity), not to an individual CPF. CI validates the
pipeline with a self-signed code-signing certificate until the purchase; the
secret names and the `signtool verify` gate do not change when the real
certificate replaces it.

| Secret | Content |
| --- | --- |
| `CSC_LINK` | Base64-encoded `.pfx` of the code-signing certificate, or a `file://`/`https://` URL to it |
| `CSC_KEY_PASSWORD` | The `.pfx` password |

`win.verifyUpdateCodeSignature` stays enabled (default): the updater checks
the publisher name of the signed update against the certificate, so a
rotated certificate must keep the same subject or set `publisherName`.

### Local mechanics proof (no real certificate required)

A self-signed test certificate proves the signing path end to end without a
CA-issued identity:

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=IPTV Player NEW Test Signer'
$password = ConvertTo-SecureString -String '<password>' -Force -AsPlainText
# C:\Users\Joao\AppData\Local\Temp\opencode\win-sign-test\ — outside the repo, never committed
Export-PfxCertificate -Cert $cert -FilePath <temp>\test-signer.pfx -Password $password
$env:CSC_LINK = "<temp>\test-signer.pfx"; $env:CSC_KEY_PASSWORD = '<password>'
pnpm run make:app -- --publishPolicy=never
```

Expected results, all mechanical:

- the installer and every `.exe`/`.dll`/`.node` in `win-unpacked` are signed;
- `signtool verify /pa` reports the signature is present and digests match,
  while the chain fails machine trust ("A certificate chain processed … to a
  trusted root authority") — that failure is the expected proof boundary;
- `latest.yml` and the `.blockmap` are generated;
- the packaged `app-update.yml` names the fork repository.

The test-signed artifacts prove mechanics only. They are not distributable:
the identity is a throwaway self-signed certificate, and
`verifyUpdateCodeSignature`/SmartScreen would reject them. Discard
test-signed installers; never publish one.

## Validation

```bash
node --test tools/packaging/electron-package-identity.test.mjs  # build identity, publish endpoint, workflow contract
pnpm run verify:package-layout -- windows x64                    # against a real build
pnpm run release:notes:validate
```

Not locally verifiable without a published release: a real N → N+1
self-update (install N, publish N+1, run the updater against it), which also
exercises `verifyUpdateCodeSignature` with the production certificate.
