# Windows IPTV Player — Design Specification

**Date:** 2026-10-18  
**Status:** Written specification approved on 2026-10-18.  
**Proposed local project path:** `E:\DEV\iptv-player` (not created yet).  
**Working product name:** Windows IPTV Player; replace with a distinct name and icon before packaging.
**Upstream baseline:** `4gray/iptvnator` commit `81910afc22f8d66a14061e58d29e70109ee3efe6`.

## 1. Purpose and success criteria

Create a Windows desktop IPTV player distributed as an installable x64 `setup.exe`. It accepts playlists or provider credentials supplied by the operator and plays the content made available by those sources. It does not provide channels, subscriptions, or other media.

Success means the rebranded app installs and launches on Windows 10/11 x64; imports M3U/M3U8 sources and Xtream Codes accounts; and supports live TV, EPG, movies, series, and the additional desktop features retained from the selected upstream. Provider-facing credentials are not stored in plaintext in the app database, backups, or logs.

## 2. Reference application and evidence

The installed Microsoft Store package is **Smart IPTV for Windows**, publisher `ssProx`, package family `51922ssProx.SmartIPTVforWindows_456ap2qe2bz6g`, version `1.0.8.0` (Store listing ID `9NG6JGCQDSSH`). Static inspection found a .NET 8 WinUI host and an Angular PWA containing IPTVnator identifiers and a local Node backend. REA inspected the managed assembly and parsed the PWA bundle as inert source; it did not execute the app, establish runtime behavior, or recover C# source.

The public [4gray/iptvnator](https://github.com/4gray/iptvnator) project is the selected clean source base. Its current README describes M3U/M3U8, Xtream, Stalker, EPG/XMLTV, catch-up, VOD, series, downloads, favorites, and other desktop features. The installed app's package contents strongly indicate an IPTVnator-derived frontend, but that observation does not prove every upstream feature behaves identically in the Store build.

## 3. Architecture and source strategy

- Start a **separate repository** from the official IPTVnator source and pin the exact upstream commit used as the base; do not copy source from the Store package.
- Keep the existing Electron, Angular, Node backend, and SQLite architecture. This supersedes the earlier WPF/LibVLCSharp proposal.
- Retain upstream desktop features, including Stalker, catch-up, downloads, and radio, alongside the agreed M3U/Xtream, live-TV, EPG, movie, and series flows.
- Use the REA repository only as a local analysis tool; REA is not shipped as a player dependency.
- Use REA at the upstream baseline, after material implementation milestones, and on the final Windows package to inspect static application artifacts and compare evidence. REA findings do not replace source tests or prove runtime behavior.
- Preserve upstream MIT license notices and third-party license notices. Use an original product name, icon, app ID, and package identity. Do not use IPTVnator branding. A factual “based on IPTVnator” attribution is acceptable.

## 4. Windows distribution

- Target Windows 10/11 x64. Confirm the minimum supported Windows build against the selected upstream commit and the final native dependency set.
- Produce the Windows x64 NSIS installer (`setup.exe`) using the upstream Electron Builder packaging path; do not produce macOS or Linux packages for this project.
- Change the upstream app ID, product name, icon, file associations, and user-data location before packaging.
- Do not ship an updater pointed at the upstream IPTVnator release channel. The first local installer has no auto-update endpoint; configure updates only after the new project's release destination is selected.
- The final public product name and release destination remain to be chosen before a distributable release.

## 5. Credential and local-data security

The upstream currently stores Xtream credentials in SQLite and can include them in playlist backups. The fork must change this behavior before release.

- Store Xtream/Stalker account secrets in the Windows Credential Manager, accessed from the Electron main process through a narrow credential-store service. `@napi-rs/keyring` is the initial implementation candidate; verify its native-addon compatibility with the selected Electron build before adopting it.
- Keep only opaque credential references and non-secret metadata in SQLite. Do not send stored secrets back to renderer state unless a specific provider operation requires them.
- M3U source URLs and playlist payloads can also contain tokens. Encrypt persisted M3U source/payload data at rest with the Windows DPAPI-backed asynchronous Electron `safeStorage` API, mediated by the main process. Do not fall back to plaintext if the vault or encryption service is unavailable.
- Redact credentials from logs, diagnostics, error strings, and telemetry. Treat credential-bearing URLs as secrets; do not export them as plain text.
- Backups may preserve non-secret preferences and viewing state, but omit passwords, credential-bearing URLs, and raw M3U data. Restoring a source requires re-entering its credentials or re-importing its playlist.
- Give this app its own data directory. Do not automatically import or migrate databases from IPTVnator or the Store-installed app.
- DPAPI and the Windows Credential Manager protect data at rest against other local users; they do not isolate secrets from other processes running as the same Windows user.

## 6. Data flow and failure behavior

The Angular UI sends source setup and playback requests through the existing Electron/backend boundary. The backend resolves provider data, reads or writes encrypted local records, and requests secrets from the OS credential store only when needed. Playback URLs are constructed for the active stream and are not written to logs or backups. M3U data is decrypted only in the app process as needed for parsing, refresh, and playback.

If a playlist is invalid, a provider is unreachable, playback fails, or the credential store is unavailable, show an actionable error and retain the saved non-secret profile state. Never silently save a password or sensitive URL in plaintext as a recovery path.

## 7. Validation

- Run the source repository's documented type, lint, unit, and Electron integration checks relevant to changed modules.
- Add tests proving credentials are absent from SQLite rows, serialized backups, diagnostics, and logs; exercise unavailable vault behavior and restore/re-entry flows.
- Test encrypted M3U import, refresh, search, playback, restart, and backup/restore using fixture playlists containing credential-bearing URLs.
- Build the Windows x64 installer and smoke-test installation, launch, upgrade/uninstall behavior, and playback using mock streams. A real provider/source is required to claim real-provider compatibility; none has been supplied yet.
- Audit the final dependency and license notices, including the keyring native addon and bundled media/player dependencies.

## 8. Non-goals and constraints

- No IPTV service, playlists, channels, accounts, or media content are provided by the application.
- No source-code extraction or copying from the Microsoft Store package.
- No automatic import of another app's saved credentials or profile.
- No public release or auto-update configuration until the product identity and release destination are chosen.

## 9. Source references

- [Microsoft Store listing](https://apps.microsoft.com/detail/9ng6jgcqdssh)
- [IPTVnator source repository](https://github.com/4gray/iptvnator)
- [IPTVnator MIT license](https://github.com/4gray/iptvnator/blob/master/LICENSE.md)
- [IPTVnator trademark notice](https://github.com/4gray/iptvnator/blob/master/TRADEMARK.md)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [@napi-rs/keyring](https://github.com/Brooooooklyn/keyring-node)
