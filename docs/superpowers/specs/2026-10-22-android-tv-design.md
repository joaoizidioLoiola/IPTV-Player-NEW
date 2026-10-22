# IPTV Player NEW — Android and Android TV Design

**Date:** 2026-10-22
**Branch:** `feature/android-tv-player` (from `main` @ `ba7c8c03c`)
**Status:** Design specification. Decisions confirmed by the product owner.
**Companions:** `2026-10-21-plans-ads-privacy-architecture.md` (commercial model), `2026-10-21-commercialization-and-scale.md` (business analysis).

Every claim is marked **[FATO]** (verified in this repository or in an official source),
**[RECOMENDAÇÃO]** or **[DECISÃO]** (confirmed by the product owner).

---

## 1. Decision summary

| Question | Decision |
| --- | --- |
| Floor for the main APK | **[DECISÃO]** API 24 (Android 7.0). API 21 is cut from the main product. |
| Architecture | **[DECISÃO]** Hybrid: Angular UI + Capacitor shell + native Media3 player plugin. |
| Delivery order | **[DECISÃO]** Full hybrid, not a shell-first MVP. |
| TV targets | **[DECISÃO]** Both Android TV / Google TV and generic AOSP TV boxes. |
| Distribution | **[DECISÃO]** Direct APK from our own site first. |
| Layout strategy | **[RECOMENDAÇÃO]** Same information architecture and the same components, two shells (touch and TV) with their own tokens. Not one layout stretched. |

---

## 2. Why the player must be native

**[FATO]** The WebView cannot play the streams IPTV actually ships:

| Stream need | WebView | Native |
| --- | --- | --- |
| MPEG-TS over UDP multicast / IGMP | **No** — JavaScript has no UDP socket | `UdpDataSource` in Media3 |
| RTSP | **No** — Chromium does not implement RTSP in `<video>` | `media3-exoplayer-rtsp` |
| AC3 / EAC3 / DTS passthrough | Unreliable | Platform decoder |
| HEVC, 4K on a weak box | Transmux in JS, burns CPU | Hardware decode |
| Widevine L1 commercial DRM | Generally unavailable | Media3 with security level control |

**[FATO]** The repository already documents this limit for DRM: only ClearKey is
playable in-app (`libs/shared/interfaces/src/lib/channel-drm.interface.ts:1-5`),
and Shaka refuses to start when DRM is unsupported
(`libs/ui/playback/src/lib/shaka-engine/shaka-video-session.ts:52-54`). Android TV
boxes without Google services frequently lack Widevine entirely.

**[FATO]** Media3 1.11.1 (stable, 2026-09-10) requires `minSdk 23`; API 21 would
require pinning to 1.8.x or older.

**[RECOMENDAÇÃO]** The Angular layer never renders video. It navigates, browses and
selects; the native plugin opens playback.

---

## 3. Runtime architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Angular app (apps/web, PWA build)                            │
│  browse · search · EPG · favorites · settings · playlists    │
│  no <video> element for linear streams                       │
└───────────────┬──────────────────────────────────────────────┘
                │ Capacitor bridge (typed plugin methods)
┌───────────────▼──────────────────────────────────────────────┐
│ Native layer (apps/android-player/android)                   │
│  ├─ Media3 plugin  → fullscreen Activity, PlayerView,        │
│  │                    MediaSession, foreground service      │
│  ├─ Preferences    → settings + user data (favorites,       │
│  │                    playback positions)                   │
│  ├─ SQLite plugin  → playlists (reuses the shared schema)   │
│  └─ TV bridge      → isTv, back button, leanback, immersive │
└──────────────────────────────────────────────────────────────┘
```

**[FATO]** The repository already has the right runtime abstraction:
`RuntimeEnvironment = 'electron' | 'pwa'` in
`libs/services/src/lib/runtime-capabilities.service.ts:4`, with `isPwa` defined as
`!isElectron` (`:34`) and every feature gated by capability
(`supportsEpg` `:111`, `supportsSqlite` `:180`, `supportsDownloads` `:250`,
`supportsEmbeddedMpv` `:339`, `supportsRemoteControl` `:350`).

**[RECOMENDAÇÃO]** Do not widen the union. A new runtime without `window.electron`
falls into the PWA branch automatically, and every Electron-only feature
degrades on its own. What Android needs is a set of **positive** capabilities the
PWA branch does not have:

| Capability | Meaning |
| --- | --- |
| `isAndroid` | Running inside the Capacitor shell |
| `isAndroidTv` | `UiModeManager` reports television |
| `hasDpad` | Remote control is the primary input |
| `supportsNativePlayer` | Media3 plugin available |
| `supportsBackgroundPlayback` | Foreground service available |
| `supportsSystemIntents` | Play in external player, open in browser |

**[FATO]** The canonical rule is written down: renderer code that branches by
runtime must use `RuntimeCapabilitiesService` instead of adding new
`window.electron` or `DataService.getAppEnvironment()` checks
(`docs/architecture/pwa-self-hosted.md`, "Service factory and build bases").

**[FATO]** `global.d.ts:19` types `electron: ElectronBridgeApi` as **required**.
**[RECOMENDAÇÃO]** Make it optional (`electron?:`) when the Android runtime lands,
so new code cannot assume the bridge exists.

### 3.1 Storage

**[FATO]** `PlaylistStorageBackend` already has one decision point:
`PlaylistStorageKind = 'electron' | 'server' | 'indexeddb'` in
`libs/services/src/lib/playlist-storage-backend.ts:37`, with `kind()` at `:48-55`
resolving server → electron (if `supportsSqlite`) → indexeddb.

**[RECOMENDAÇÃO]** Add `'sqlite-native'`, backed by the community Capacitor SQLite
plugin, reusing `libs/shared/database/src/lib/schema.ts` as DDL. The shared
`connection.ts` is Node-bound and must not be reused; the schema SQL can be.
Settings and user data move from `StorageMap` and `localStorage` to the
Capacitor Preferences adapter behind the existing tokens, so no feature changes.

**[IMPLEMENTADO — Fase 1]** O backend `sqlite-native`
(`libs/services/src/lib/native-playlist-store.ts`) usa
`@capacitor-community/sqlite@8.1.1` (MIT, peer Capacitor 8, sem pacote web
obrigatório no Android) sobre `databases/iptv-player-newSQLite.db`, com
parâmetros vinculados e uma conexão memoizada por store. O upgrade de schema
precisa ser registrado **antes** de `createConnection`: o plugin captura o mapa
de upgrades ao construir a conexão e só o aplica no `open()`, então registrar
depois deixa um banco novo sem tabelas. Verificado no emulador: um documento
semeado renderiza em "Recently Used Sources" e sobrevive à remoção de
`app_webview` e `cache`. Pendente: mover settings/user data para
`@capacitor/preferences` (adaptador assíncrono) e revisar `allowBackup` para o
banco.

**[FATO]** The web runtime keeps playlists in IndexedDB
(`libs/shared/interfaces/src/lib/indexed-db.config.ts:9-61`) and user data in
`localStorage` through `USER_DATA_STORAGE`
(`libs/services/src/lib/user-data-storage.ts:15-52`).

### 3.2 Provider access and the proxy question

**[FATO]** `PwaService` routes every provider call to the web backend:
`corsProxyUrl` at `apps/web/src/app/services/pwa.service.ts:113`, with
`/provider-targets`, `/parse`, `/xtream`, `/stalker` used at `:424-458` and
`:624-652`. The reasons are not only CORS: DNS pinning, redirect validation and
Stalker token handling live in the backend.

**[FATO]** The desktop main process has the hardened equivalent —
`requestWithValidatedRedirects` (`apps/electron-backend/src/app/util/validated-axios.ts:229`)
and `validateRemoteUrl`
(`apps/electron-backend/src/app/events/url-safety.ts:208`), which blocks
loopback, private and reserved addresses including IPv4-mapped IPv6.

**[FATO]** A WebView has the same CORS and mixed-content restrictions as a
browser.

**[IMPLEMENTADO — Fase 1.5]** O APK **não** usa o `web-backend`. A ponte
`CapacitorHttp` (`apps/web/src/app/services/native-http.service.ts`) executa a
requisição na pilha HTTP da plataforma, e o
`NativeProviderTransportService` reproduz `/parse`, `/xtream` e `/stalker` em
TypeScript reutilizando `createPlaylistObject`, `normalizeXtreamServerUrl`,
`buildStalkerIdentityRequestContext` e `buildStalkerRequestUrl` — o mesmo
contrato do Electron e do backend. `PwaService` só desvia para esse caminho
quando `isNativeCapacitorShell()` é verdadeiro; PWA e Electron continuam no
transporte anterior.

**[FATO]** Validado no emulador contra o `xtream-mock-server` em
`http://10.0.2.2:3211`: `get_account_info`, categorias,
`get_live_streams`, `get_vod_streams` e `get_series` responderam 200 via
`CapacitorHttp`, e o dashboard carregou 180 itens. Nenhuma chamada a
`/provider-targets`. Um eco de headers confirmou que `Cookie`, `Authorization`
e `SN` chegam intactos ao portal (necessário para Stalker).

**[FATO]** `environment.prod.ts` não aponta mais para a API do upstream
(`https://iptvnator-playlist-parser-api.vercel.app`, que responde 402). O padrão
passa a ser `/api`, sobrescrito pelo `assets/app-config.js` de cada deployment.

**[INFERÊNCIA]** A proteção SSRF do backend (DNS pinning, bloqueio de IP
privado) não se aplica ao APK: o dispositivo acessa a rede do usuário, e
provedores locais são um caso de uso legítimo. A validação da URL digitada
continua no formulário.

---

## 4. Toolchain and packaging

**[FATO]** Capacitor 8 requires Node 22+, JDK 21, AGP 8.13.0, Gradle 8.14.3,
Kotlin 2.2.20, `minSdk 24`, `compileSdk 36`, `targetSdk 36`
(https://capacitorjs.com/docs/updating/8-0, updated 2026-10-15).

**[FATO]** Capacitor requires a WebView with Chrome 60 or later
(https://capacitorjs.com/docs/android, updated 2026-10-15). The practical floor
is therefore the installed WebView, not the OS version.

**[FATO]** The Play Store requires `targetSdk 36` for new apps and updates from
2026-08-31, and `targetSdk 34+` for Android TV apps
(https://developer.android.com/google/play/requirements/target-sdk, updated
2026-10-16). It does **not** impose a minimum `minSdk`.

**[FATO]** Google Play's TV app quality guidelines require a 320×180 banner, an
icon of at least 160×160, delivery as an AAB, 64-bit support, and 16 KB page
size alignment from 2026-08-01
(https://developer.android.com/docs/quality-guidelines/tv-app-quality, updated
2026-06-29).

**[FATO]** Android developer verification applies to installs from participating
stores in **Brazil** (among others) on certified devices running Android 7 or
later, from 2026-09-30, and globally in 2027
(https://developer.android.com/developer-verification/guides, updated 2026-08-18).

**[FATO]** APK signing: v1 for Android below 7.0, v2 from 7.0, v3 from 9.0 with
key rotation; a signing key must be valid beyond 2033-10-22
(https://source.android.com/docs/security/features/apksigning).

**[RECOMENDAÇÃO]** Distribution starts with a **direct APK** from our own site
(decision). That makes the signing path ours alone — no Play App Signing
mismatch — and sideloads to TV boxes need no store. **[RECOMENDAÇÃO]** Register
the developer account and the app for Brazil before public launch, because
sideloading to end users in Brazil falls under the verification regime.

**[RECOMENDAÇÃO]** Two application IDs are unnecessary while only the direct
channel exists; decide on a Play App Signing key if the Play channel opens later.

### 4.1 Manifest

**[FATO]** A TV app needs an intent filter with both `LAUNCHER` and
`LEANBACK_LAUNCHER`, `uses-feature android:software.leanback` and
`android.hardware.touchscreen` both with `android:required="false"`, and a
320×180 banner
(https://developer.android.com/training/tv/get-started/create).

**[FATO]** The Capacitor documentation has no Android TV page as of October 2026:
the manifest, the D-pad navigation and the native player are all our work.

### 4.2 Native constraints

**[FATO]** Cleartext HTTP is blocked by default from `targetSdk 28`; IPTV
playlists are frequently plain HTTP, which needs `usesCleartextTraffic` or a
`networkSecurityConfig` listing domains
(https://developer.android.com/training/articles/security-config).

**[FATO]** The WebView suspends `requestAnimationFrame` and the `<video>` element
when the app goes to the background. Continuous radio or audio needs a foreground
service with `MediaSession`.

**[FATO]** `shouldEnableServiceWorker()`
(`apps/web/src/app/services/runtime-config.ts:30-46`) disables the service worker
only when `window.electron` exists or the protocol is `file:`. In a Capacitor
WebView the protocol is `https:` on `localhost`, so **the service worker would
register and serve stale chunks inside the APK**. This must be fixed in the
Android runtime, not left to happen.

### 4.3 Developer verification in Brazil

**[FATO]** The 2026-09-30 enforcement wave covers installs **from the seven
participating stores** (Play, HONOR, OPPO, Samsung, Transsion, vivo, Xiaomi) in
Brazil, Indonesia, Singapore and Thailand, on certified Android 7+ devices.
Google's FAQ states that installs from other stores and direct sideloads "won't
apply to your app yet"; the 2027 global phase extends the check to all install
sources, including downloaded APK files
(https://developer.android.com/developer-verification/guides/faq,
https://developer.android.com/developer-verification/guides, updated 2026-09-30).

**[FATO]** Verification has two independent gates: **identity** (individual CPF
or organization CNPJ, tied to a Google Payments profile whose legal name and
address match the documents) and **package registration** (applicationId plus
the SHA-256 of the signing certificate). No manifest attribute or permission
declares it; the on-device Android Developer Verifier checks package name and
signer certificate against Google's registry
(https://developer.android.com/developer-verification/guides).

**[RECOMENDAÇÃO]** Register now, not at launch: the organization path requires a
**D-U-N-S number (28–30 days)** and a website verified in Google Search Console.
A Play Console organization account is the single place to verify identity and
to register packages distributed outside Play; the Android Developer Console is
only for developers who distribute exclusively off-Play. Both cost US$25.
Registration is package + certificate based, so the **self-managed release key
is the identity credential**: register every certificate actually shipped and
back it up (https://developer.android.com/developer-verification/guides/google-play-console).

**[FATO]** ADB installs are exempt, and a failed check blocks install/update but
never removes an existing install; the user can still proceed through the
advanced flow (Developer options, 24-hour wait, biometric confirmation)
(https://developer.android.com/developer-verification/guides/faq).

---

## 5. TV interface

**[FATO]** Android TV layouts are designed at 960×540 dp with 5% overscan —
about 48 dp on the sides and 27 dp top and bottom — with a 12-column, 52 dp grid
and 20 dp gutters (https://developer.android.com/design/ui/tv/guides/styles/layouts).
Typography has its own 15-style scale, larger than the phone scale
(https://developer.android.com/design/ui/tv/guides/styles/typography).

**[FATO]** D-pad navigation requires visible focus indication, predictable focus
order via `android:nextFocus*` for non-trivial graphs, and a predictable Back
button; a TV app should not draw its own back button
(https://developer.android.com/training/tv/get-started/navigation).

**[FATO]** The current app has **no spatial focus model**. What exists is tab
order plus a pane-level roving focus: `ChannelScrollFocusDirective`
(`libs/ui/components/src/lib/channel-scroll-focus/channel-scroll-focus.directive.ts`)
handles ArrowUp/Down/PageUp/PageDown/Home/End for scrolling, and ArrowRight/Left
moves between the category list and the channel list
(`docs/architecture/iptvnator-ui-guidelines.md:511-531`).

**[FATO]** `:focus-visible` is a keyboard heuristic. On a TV driven by D-pad it
usually does not match, so **the focus ring would simply not appear**. The focus
ring itself is a global rule in `apps/web/src/styles.scss:171-177`, enforced by
`tools/nx/check-focus-visible.mjs`.

**[RECOMENDAÇÃO]** Three pieces of work:

1. **Spatial focus service** — a new `libs/ui/tv-focus` (or
   `libs/workspace/tv-focus`) with a registry of focusable items per container,
   geometric neighbour selection on arrow keys, `Home`/`End`, activation on
   `Enter`/`NumpadEnter`, initial focus per route, `scrollIntoView` with
   `block: 'center'`, and a distinct `.tv-focus` class that does not depend on
   `:focus-visible`.
2. **TV shell** — its own tokens for density, typography and overscan-safe
   padding, applied in the workspace shell; 48 dp minimum targets; no reliance on
   `:hover`; a focus indicator that is a shape, not only a colour.
3. **Validator** — a sibling to `tools/nx/check-focus-visible.mjs` that keeps the
   TV focus class covered, so the ring cannot silently disappear.

**[RECOMENDAÇÃO]** First surfaces to wire: the catalogue grid
(`libs/portal/shared/ui/src/lib/grid-list/grid-list.component.scss:204`), the
dashboard rails, the live channel list (item level, not pane level), and the
player controls (`libs/ui/playback/src/lib/player-controls/`).

**[FATO]** The Playwright matrix today covers only desktop viewports
(`apps/web-e2e/playwright.config.ts:140-151`); mobile Chrome and Safari are
commented out (`:155-162`). Phone sizes are tested ad hoc at 375×812, 640×360 and
360×740 (`apps/web-e2e/src/mobile-layout.e2e.ts:38-39`). There is no TV viewport
and no D-pad test.

---

## 6. Phases

| Phase | Work | Exit criterion |
| --- | --- | --- |
| **0** | Toolchain (JDK 21, cmdline-tools); `apps/android-player` project + Capacitor 8; build the PWA bundle into a debug APK; install on a device; Media3 plugin spike against HLS, MPEG-TS, AC3, UDP and RTSP | A debug APK boots on a real device and plays one HLS and one UDP stream through the native player |
| **1** | Runtime capabilities; service worker disabled in the native shell; WebView version gate with a clear message; storage adapters; TV manifest; `isTv` detection | The app runs on phone and TV, keeps playlists across a clear-cache, and refuses old WebViews with an explanation |
| **2** | Media3 plugin: fullscreen Activity, `PlayerView`, headers, live edge, subtitle and audio track selection, `MediaSession` and foreground service; native "open in external player" intent | Linear streams play natively with working audio/subtitle selection; background audio continues |
| **3** | TV shell and spatial focus; overscan-safe tokens; 48 dp targets; hover-independent affordances | 100% of navigation works by D-pad with a visible focus indicator, at 960×540 and 1920×1080 |
| **4** | E2E coverage: TV viewports, D-pad journeys, touch journeys; packaging: keystore, `versionCode` mapping, AAB, 64-bit and 16 KB page alignment | The AAB installs on phone and TV box, and the D-pad suite is green |
| **5** | Distribution: signed APK on our site, developer verification for Brazil, in-app update path for the APK channel | A user can install, update and uninstall without touching a store |

**[RECOMENDAÇÃO]** Phase 0 exists to make the risky assumptions testable on real
hardware: WebView age on a cheap box, whether AC3 decodes, whether UDP arrives,
whether the D-pad reaches the WebView. Every one of those can invalidate a
design choice, and none can be settled from documentation.

---

## 7. Risks

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Old WebView on a TV box | High | High | Version gate at boot with a clear message; the native player does not depend on the WebView |
| AC3 / EAC3 / HEVC does not decode | High | High | Media3 plus a per-device stream test; FFmpeg extension compiled into the app if needed |
| UDP multicast or RTSP in the provider's catalogue | Medium | High | `UdpDataSource` and `media3-exoplayer-rtsp` in Phase 0 |
| Play's IP policy scrutiny | Medium | Critical | Rights due diligence before opening the Play channel; the direct APK channel is unaffected |
| Developer verification in Brazil | High | Medium | Register before launch |
| Focus lost on Angular route change | High | Medium | Spatial focus service with route-level initial focus and automated D-pad tests |
| Two UI shells double the front-end cost | Certain | Medium | Accepted: +20–30% front-end effort, concentrated in focus, shell and list virtualization |
| API 21 demand appears | Low | Medium | A frozen legacy build, separate from this architecture, if ever contracted |

---

## 8. Open decisions

| Decision | Status |
| --- | --- |
| Product name and icon | `IPTV Player NEW`, Frame Play shipped |
| API 21 in the main APK | Cut; a frozen legacy build only if contracted |
| Architecture | Angular + Capacitor + native Media3 plugin |
| Layout strategy | Two shells, shared components |
| Player scope | Native for linear streams; the web player stays for VOD previews if it remains useful |
| Distribution | Direct APK first; Play and Amazon Appstore later |
| Provider proxy | Bridge nativa `CapacitorHttp` no APK (Fase 1.5); `web-backend` permanece para PWA/self-hosted |
| DRM | Only ClearKey in-app, as today; Widevine L1 needs a separate decision |
| Team | One Angular/front engineer and one Android engineer; the project stalls in Phase 2 without the Android one |
