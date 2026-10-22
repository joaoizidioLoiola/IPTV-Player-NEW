# IPTV Player NEW — Commercialization and Scale Analysis

**Date:** 2026-10-21
**Base:** `E:\DEV\iptv-player` @ `e6e45be4a` (fork of `4gray/iptvnator` v0.25.0, MIT)
**Status:** Analysis for decision. No product change is implied by this document.

Every claim is marked **[FATO]** (verified in this repository), **[RECOMENDAÇÃO]**, or
**[HIPÓTESE]**. Effort figures are developer-days for one experienced dev in this codebase.

---

## 1. Executive summary

The application is a **player**: it ships no channels, no playlists, and no media. That
boundary is the entire commercial asset, and it is also the boundary that must not be
crossed. Everything below is organized around one decision:

> Sell the software, never the content.

Three facts decide the near term:

- **[FATO]** The MIT license permits selling the software outright. It does not grant
  the brand, and it does not grant the third-party obligations that come with bundling
  LGPL media components.
- **[FATO]** The product is not yet releasable as a *paid* product. Signing, an update
  channel, legal documents, and credential storage at rest are all missing — each
  independently blocking (Section 3).
- **[FATO]** The largest engineering liability is not any missing feature; it is keeping
  a fork of Electron/Angular/Chromium alive for the next three years (Section 7).

**[RECOMENDAÇÃO]** Ship as **open-core with a perpetual license**. The free tier is the
distribution channel; the paid tier unlocks power features. Recurring-revenue B2B
white-label is the second wave, at month 12+, only if the team grows.

---

## 2. Business model

### 2.1 What MIT resolves, and what it does not

**[FATO]** `LICENSE.md` grants the right to use, copy, modify, merge, publish,
distribute, sublicense, and **sell** copies. The fork may be closed-source if desired.

MIT explicitly does **not** resolve:

| Unresolved by MIT | Consequence for this product |
| --- | --- |
| Trademark | `TRADEMARK.md` reserves "IPTVnator" and the logo. The fork already uses its own name and icon. The upstream name must not appear in the installer, About, site, or store listing. |
| Warranty / liability | "AS IS, NO WARRANTY" transfers risk to the seller. Selling means owning the defects. |
| Patents | MIT has no patent grant. Low risk for a player; relevant if patented codecs are added. |
| Third-party licenses | Bundled LGPL/GPL media components and Apache-2.0 libraries carry their own obligations. These are the seller's to satisfy, not the upstream's. |
| Content rights | Streams, playlists, EPG, and artwork belong to the end user. The software license grants nothing about them. |

### 2.2 The hard line

**[RECOMENDAÇÃO]** The following are non-negotiable and should be stated in the EULA:

- No bundled playlists, channels, or EPG data. The app never ships content.
- No DRM circumvention, no decryptors, no "premium channel unlock".
- No curated free-content feature — that converts the seller from tool vendor into
  content distributor.
- No third-party artwork scraping without a license.
- No use of the upstream name or logo in any listing, installer, or marketing surface.

**[HIPÓTESE]** Direct Windows distribution (site + GitHub Releases, optionally Microsoft
Store) is materially more tolerant of an IPTV player than mobile app stores, which
treat the category as high-risk by association. Validate before investing in a Store
submission.

### 2.3 Models considered

| Model | Verdict | Why |
| --- | --- | --- |
| **Open-core + perpetual license** | **Recommended** | MIT permits it. The free tier is the funnel; the paid tier is a one-time purchase with no SLA burden. Engineering needed (license key, offline activation, feature flags) is small and reusable. |
| **B2B white-label for ISPs** | Second wave, month 12+ | Highest LTV and real recurring revenue: the ISP owns the legal content, we sell the tool. Requires build parameterization, a per-tenant config, contract support, and a sales motion a 1–3 person team cannot run in year one. |
| **SaaS subscription for a local player** | Rejected | A local player does not justify a recurring fee; the user base is hostile to subscriptions; free competitors exist. |
| **Ad-supported** | Rejected | PII, consent, and near-zero ad value in a video player. |
| **Freeware, no monetization** | Rejected | No revenue, and the maintenance cost (§7) is real regardless. |

---

## 3. Release readiness gate

**[FATO]** column = verified state in this repository. **[RECOMENDAÇÃO]** column = what
would close the gap and how it would be verified.

### 3.1 Blockers — the product cannot be sold until these close

| # | Item | State now | How it closes | Verify |
| --- | --- | --- | --- | --- |
| A1 | **Windows code signing** | **Absent.** `electron-builder.json` has no `certificateFile`/`signtool`; CI signs macOS only (`CSC_*` secrets). Local build output is unsigned. | Obtain an OV or EV Authenticode certificate; configure `win` signing. | `Get-AuthenticodeSignature` on the installer and every unpacked `.exe`/`.dll`/`.node` returns a valid signature. |
| A2 | **Update channel of our own** | **Absent.** No `publish` block, `APP_UPDATE_FEED_CONFIGURED = false`, no `latest.yml` / `app-update.yml` in the build. The feed still points at `4gray/iptvnator`. | Set `publish` to our own repo/host, generate the channel metadata, re-enable the flag. | Update N→N+1 succeeds on a clean Windows machine with the signed installer. |
| A3 | **Legal documents** | **Absent.** Repo root has only `LICENSE.md`, `TRADEMARK.md`, `README.md`, `CHANGELOG.md`. No privacy policy, terms, or EULA. | Publish Privacy Policy, Terms, EULA; link them from About and the installer. | Files exist and are linked; legal review recorded. |
| A4 | **Credentials not at rest in the vault** | **Absent.** `playlists.password` is a plaintext column (`libs/shared/database/src/lib/schema.ts:31`); the codec also carries it into the full-document payload and into backups. The vault service, IPC handlers, and reference mapper exist and are tested, but **no production code writes to them**. | Complete the SQLite→Credential Manager migration (Section 6, R1). | No plaintext credential in a database row, WAL file, or exported backup. |
| A5 | **Reproducible release** | **Absent.** The CI release workflow is hardcoded to `4gray/iptvnator` and to `refs/heads/master`; this fork is on `main` with no remote. The packaging suite has 5 failing assertions that still expect the upstream `publish` block. | Repoint the workflow at our repo and branch; fix the 5 packaging assertions. | `node --test tools/packaging/electron-package-identity.test.mjs` passes; a release tag produces the installer from a clean checkout. |
| A6 | **Honest About page** | **Fixed** in `4f840ad97` — upstream identity, community, funding, and release links removed; dead update actions hidden. | — | `grep -ri "4gray/iptvnator"` over shipped strings returns nothing outside license notices. |

### 3.2 Scale and trust blockers — not required for the first paid release, but they cap it

| # | Item | State now | Effort |
| --- | --- | --- | --- |
| B1 | **Telemetry / crash reporting** | None. Defensible as "nothing leaves the device" — but must be *documented and tested*, not assumed. | P (document) / M (opt-in crash) |
| B2 | **Support channel and policy** | None: no issue templates, no support doc, no response-time commitment. | P |
| B3 | **CVE / framework lifecycle** | Dependabot is weekly, but **Electron majors are ignored** by policy. Pinned `43.3.0` while `43.8.3` exists; Electron 43 EOL is 2027-01-05. | P–M |
| B4 | **SBOM and third-party notices** | None. No `cyclonedx`/`syft`/`pnpm audit` in CI. Only CodeQL. | M |
| B5 | **First-run onboarding** | Missing. A first-run screen that states "this is a player; it provides no content; your data stays on this device" is legal cover and reduces chargebacks. | M |
| B6 | **Proven no-egress** | Not proven by an automated gate. | M |
| B7 | **Windows runtime (MPV) reproducibility** | The pinned Windows MPV runtime asset is expired (30-day retention) and the refresh workflow is gated to the upstream repo. The shipped package contains `embedded-mpv-unavailable.txt`, so the embedded player is degraded. | G (mirror the asset) |
| B8 | **Installer diet** | Installer is 141 MB; unpacked 540 MB. 14.2 MB is foreign-platform binaries (macOS/Linux/arm64); ~46 MB is unused locales; `sqlite3.c` 9 MB; shaka/video.js/hls renderer copies ~57 MB. | P–M |
| B9 | **i18n gaps** | 19 locales; `uk.json` missing upstream; `pt.json` is pt-BR but mixes pt-PT vocabulary and carries a BOM. | P |
| B10 | **Coverage policy** | Real but modest: ratchet 69.54/59.07/67.44/69.85, Tier A = 34 projects. | M |

### 3.3 What is already stronger than a typical fork

**[FATO]** The upstream ships infrastructure most forks never have: a coverage policy
with per-project tiers, a performance ratchet, a Playwright E2E matrix across three
operating systems, a packaged-app smoke test, release notes with a validation tool, and
`pnpm.overrides` plus `patchedDependencies` (41 overrides). That infrastructure is the
asset that makes a fork maintainable — and the reason §7 recommends keeping the fork
rather than rewriting it.

---

## 4. Scaling the engineering

**[RECOMENDAÇÃO]** Target: one build becomes N builds, and the app survives three years
of Chromium churn.

| Area | Decision | Effort (dev-days) |
| --- | --- | --- |
| Framework upgrade policy | Stay within the **last three supported Electron majors** (Chromium shifts every ~8 weeks). One Angular/Nx major at a time, following upstream migrations. Quarterly cadence with a freeze window before each release. | 2–4 per major, ~1–2 dev-days/month |
| Dependency policy | Keep `pnpm.overrides` and `patchedDependencies`. Add Dependabot grouping for majors, `--frozen-lockfile` (already used), signed commits, and provenance on releases. | 3–5 setup, 0.5/month |
| Fork CI for release | **Reuse** `build-and-make.yaml`: drop the macOS/Linux jobs (Windows-only cuts ~60% of matrix cost), repoint the hardcoded `4gray/iptvnator` and `master` gates, add a Windows signing job, set our own `publish`. Do not rewrite from scratch. | 5–8 |
| Signing and auto-update | OV/EV certificate, `win.signtoolOptions`, `publish`, `latest.yml` + blockmap, `verifyUpdateCodeSignature`. | 2–4 after the certificate |
| Telemetry / crash | Crashpad or an opt-in sink. Hard rule: never send playlist URLs, usernames, tokens, or channel titles. Reuse the existing redaction layer. | 3–5 |
| Feature flags | Build-time (Nx configurations) plus a runtime `flags.*` namespace over the existing persisted settings. | 1–2 |
| Beta / canary | Reuse the upstream nightly machinery (`tools/release/nightly-version.mjs` already exists and is tested), repointed at the fork; beta = prerelease channel. | 2–3 |
| Surviving Chromium upgrades | A CI gate that runs the full E2E matrix, the performance ratchet, and the packaged smoke test against the candidate major **before** merge, plus a beta window. | 3–5 setup, 1/major |

**Total:** roughly 30–40 unique dev-days to reach "N builds + 3 years", then 3–4
dev-days/month of continuous maintenance.

**[RECOMENDAÇÃO]** For a single developer this consumes the entire capacity. For 2–3
developers it is sustainable only if the scope is cut (§7).

---

## 5. Security as a product

Ordered by severity. State is verified; the mitigations are the recommendations.

| Risk | State | Mitigation | Effort |
| --- | --- | --- | --- |
| **R1. Credentials at rest** | **[FATO]** Plaintext `password` column, plaintext in the full-document payload, plaintext in exported backups. The vault exists but has no production writer. | Complete the migration: on write, store the secret in the Credential Manager and keep only `vault:<sha256>` in the row; hydrate on read in the main process. Idempotent, rollback-safe, one-shot migration for existing profiles. | M |
| **R2. Credentials in logs** | **[FATO]** A shared redaction layer exists (`libs/shared/logging`) and the repo forbids logging credentials. | Keep the rule; add a test that fails when a logger receives a credential-shaped object. | P |
| **R3. Token-bearing URLs in errors/crash** | **[FATO]** URL credential redaction exists in the shared logging layer and in the download artwork path. | Generalize to every error path, and never include a full stream URL in any crash report. | M |
| **R4. SSRF via user-supplied URLs** | **[FATO]** Not a gap. `validateRemoteUrl` rejects loopback, private, reserved, and IPv4-mapped IPv6 targets, pins DNS resolution, and validates redirects. The oracle's hypothesis to the contrary was checked against the code and does not hold. | Keep the guards; do not add `allowPrivateNetworks` to user-facing flows. | — |
| **R5. Injection through EPG metadata** | **[FATO]** No `innerHTML` or `bypassSecurityTrust` in production code; the renderer interpolates metadata through Angular bindings, and the CSP is restrictive. | Keep it that way; add a lint rule banning `innerHTML` in the renderer. | P |
| **R6. Redistribution and abusive content** | **[FATO]** The app ships no content. | Keep it that way; EULA makes the user responsible for what they watch. | P |
| **R7. Update channel as a remote-execution vector** | **[FATO]** No signing, no channel. | Code signing plus `verifyUpdateCodeSignature`; never disable signature verification. | G (tied to A1/A2) |

**Priority: R1 → R3 → R4 → R5 → R7.** R4 and R5 turned out to be already handled; the
real exposure is R1.

---

## 6. 90 / 180 / 365 days

### Phase 1 — days 0–90: "sellable, without promising scale"

- **[RECOMENDAÇÃO]** Exit criteria, all verifiable:
  - Signed installer and signed unpacked binaries (A1).
  - Own update channel with a tested N→N+1 upgrade (A2).
  - Privacy Policy, Terms, and EULA published and linked (A3).
  - Credential migration to the Credential Manager complete, with a real-schema migration test (A4, R1).
  - `pnpm audit --prod` triaged; `SECURITY.md` published (B3).
  - Release CI repointed at our repo and `main`; packaging suite green (A5).
  - Idle-network capture proves zero egress (B6).
- **[RECOMENDAÇÃO]** Do **not**: ship auto-update publicly before it is signed; add
  features; enable telemetry; target the Microsoft Store; touch macOS or Linux.

### Phase 2 — days 90–180: "updatable and observable"

- **[RECOMENDAÇÃO]** Exit criteria: update channel in production; beta/canary channel;
  opt-in crash reporting or a documented and tested no-egress posture; license keys with
  offline activation and feature flags; CI gate for framework majors.
- **[RECOMENDAÇÃO]** Do **not**: start B2B white-label; raise prices; port to Tauri.

### Phase 3 — days 180–365: "recurring revenue and survival"

- **[RECOMENDAÇÃO]** Exit criteria: 1–2 white-label pilots with a parameterized build;
  a written framework LTS policy actually met; upgrade PRs opened by CI rather than by
  hand; an explicit, reviewed decision to keep the fork or to freeze it.
- **[RECOMENDAÇÃO]** Do **not**: expand to mobile or Android TV; build our own cloud
  backend (it would destroy the "data stays on the device" argument); pursue macOS or
  Linux while the scope is Windows-only.

---

## 7. The main risk, and the architecture decision that mitigates it

**[HIPÓTESE]** The main risk is that this becomes a **maintenance hobby**: a fork of
Electron/Angular/Chromium consumed by one to three developers, producing no sellable
value, and abandoned in 2027. The cost is structural: Chromium shifts every ~8 weeks,
each major needs migrations, native dependency patches, and regression testing.

**[RECOMENDAÇÃO]** Mitigate by reducing the maintained surface and by turning the
upgrade into a pipeline instead of a manual task:

- **Option A — keep the fork, cut the scope (recommended).** Remove what we do not
  sell: macOS and Linux packaging, the self-hosted PWA backend, Snap/Flatpak/AppImage,
  and niche features. Smaller surface, fewer breaking upgrades. The existing test,
  ratchet, and packaging infrastructure is reused as-is.
- **Option B — migrate to a smaller core (Tauri/Rust).** Rewriting a mature Angular
  application in Rust is 6–12 full-time dev-months and discards the entire test suite
  and feature set. Not viable without capital.

**Verdict: Option A.** What the project lacks is not a rewrite — it is a cut and an
automated upgrade gate. If, at 365 days, maintenance still consumes more than half of
the team's time, the correct decision is to **freeze features and sell the current state
as a stable LTS**, not to rewrite.

---

## 8. Summary of the decisions taken

| Decision | Outcome |
| --- | --- |
| Business model | Open-core with a perpetual license now; B2B white-label from month 12 |
| Content boundary | Ship the software, never content; player-only stays a hard line |
| Release order | Sign → update channel → legal → credential migration → then sell |
| Maintenance strategy | Cut the surface, automate the upgrade gate, keep the fork |
| If time runs out | Freeze and sell as LTS; do not rewrite |
