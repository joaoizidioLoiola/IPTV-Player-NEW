# IPTV Player NEW — Plans, Ads, Privacy and Release Architecture

**Date:** 2026-10-21
**Status:** Design specification. Approved direction: direct-sale ads, Lemon Squeezy licensing, local trial, IPTV-bundle channel.
**Companion documents:** `2026-10-21-commercialization-and-scale.md` (business model; its ad rejection is superseded by §3 of this document, and its open-core/perpetual recommendation is superseded by §2 of this one).

Every claim is marked **[FATO]** (verified in this repository or in an official source),
**[RECOMENDAÇÃO]** (a decision this document proposes) or **[PRECISA REVISÃO JURÍDICA]**.

---

## 1. Scope

This document specifies the four systems the product needs before it can be sold:

1. **Plans and licensing** — five tiers, issued as prepaid time-boxed licenses.
2. **Advertising** — direct-sale slots, no third-party ad SDK, no third-party script.
3. **User-data protection** — secrets in the Windows Credential Manager, encrypted
   payloads at rest, and the migration that removes plaintext from existing profiles.
4. **Release readiness** — own update feed, own signing, own CI, and the documentation
   structure that makes all of it auditable.

Legal material in §5 is a technical compliance structure, not legal advice.

---

## 2. Plans and licensing

### 2.1 The tier model

**[RECOMENDAÇÃO]** The five tiers are **prepaid time-boxed licenses**, not recurring
subscriptions. "1 month", "3 months", "6 months" and "12 months" are durations, not
renewal cadences. This removes dunning, failed charges, cancellation flows and
webhooks from the operating model: when the period ends, the license is over.

| Tier | Duration | Ads | Purpose |
| --- | --- | --- | --- |
| Trial | ~3 hours | None | Evaluation before purchase |
| 1 month | 30 days | Yes, regular | Entry price; lowest commitment |
| 3 months | 90 days | Yes, occasional | Middle tier; the bundle tier |
| 6 months | 180 days | None | Committed customer |
| 12 months | 365 days | None | Best margin; renewal target |

**[FATO]** The Lemon Squeezy License API models a fixed license length natively: it
returns `status: expired` once the expiry date has passed, whether the product had a
defined license length or a subscription lapsed
(https://docs.lemonsqueezy.com/api/license-api). The same model exists in Keygen,
where `expiry` is computed as `time.now + policy.duration`
(https://keygen.sh/docs/api/licenses/).

**[FATO]** Paddle Billing **does not issue license keys**. Its migration guide lists
"License key generation and activation" as deprecated and states that product
delivery and key generation are not handled by Paddle Billing
(https://developer.paddle.com/migrate/plan). Choosing Paddle means building the
licensing service yourself.

**[RECOMENDAÇÃO]** Use **Lemon Squeezy** as the merchant of record. It issues keys,
hosts the license API, collects and remits tax, and handles chargebacks — with no
server of our own. **[RECOMENDAÇÃO]** Keep the licensing provider behind a narrow
interface so the provider can be swapped without touching the app.

### 2.2 Licensing flow

```
Checkout (Lemon Squeezy)
  → 4 SKUs, each a fixed-length license: 30 / 90 / 180 / 365 days
  → Lemon Squeezy issues the key and delivers it to the buyer
  → app activates the key on first run:
        POST /v1/licenses/activate { key, instance_id, activation_limit }
  → result stored locally, encrypted, with a revalidation interval
  → offline: use the cached entitlement until the grace window ends,
    then require a connection
```

**[FATO]** Lemon Squeezy's activation endpoint takes `instance_id` (one per machine)
and an `activation_limit`, with a documented rate limit of 60 requests per minute
(https://docs.lemonsqueezy.com/api/license-api).

**[RECOMENDAÇÃO]** The app stores the entitlement result with `safeStorage`
(DPAPI on Windows), never as plaintext. A revoked or expired license therefore
requires a network round-trip, which is the same shape as the upstream's own
offline-tolerant update check.

### 2.3 The trial

**[FATO]** A purely local trial is trivially defeated: clearing the app data or
reinstalling resets the counter.

**[RECOMENDAÇÃO]** The trial is deliberately trivial. It is a marketing funnel, not a
protection mechanism — a determined user who resets a three-hour timer is not a
customer who would have paid. Engineering effort goes into the purchase path
instead: the trial's end state is the "activate your license" screen with the
pricing table, not a nag.

**[RECOMENDAÇÃO]** The trial clock uses the earliest of (last observed wall clock,
profile creation time) so a backwards clock change does not extend it. This is
cheap and raises the bar slightly; it is not a security boundary and must not be
described as one.

### 2.4 The IPTV-bundle channel

**[RECOMENDAÇÃO]** Customers who buy an IPTV list receive **three months of the
player included** with the list. This is the strongest distribution channel
available to a product like this: the provider reaches an audience that already
wants the player, at zero customer-acquisition cost.

This makes the bundle a **separate SKU from the retail 3-month tier**:

| | Retail 3-month | Bundle 3-month |
| --- | --- | --- |
| Ads | Occasional | **None** |
| Acquisition | Direct sale | Included in the provider's list price |
| Volume | Small | Potentially large |
| Key issue | — | Bought in bulk, distributed by the provider |

**[RECOMENDAÇÃO]** The bundle is ad-free. A provider who bundles the player with
their own list is paying for that inclusion; showing ads to their customers
devalues what they sold and creates a conflict between the provider's revenue and
ours. The two tiers therefore differ in ad policy, and the app must be able to
express "licensed, ad-free, 3 months" as a distinct entitlement state.

**[PRECISA REVISÃO JURÍDICA]** Selling in bulk to IPTV providers, and receiving
payment from them, moves the product closer to the content supply chain. The
commercialization document recommended excluding IPTV resellers from the
advertising table specifically to keep the player neutral. Bundling licenses is a
different relationship from taking ad money, but the same reputational question
applies, and a provider distributing infringing lists is a customer whose conduct
becomes visible in the app. The terms of service must set out acceptable use, the
licence must be non-transferable beyond the end user's device, and there must be a
takedown channel. **[PRECISA REVISÃO JURÍDICA]** A decision on whether bulk
licences may be sold to providers operating lists of uncertain licensing status is
a legal question, not an engineering one.

### 2.5 What the app enforces, and where

**[FATO]** There is no entitlement, licence, plan or feature-flag system anywhere in
the codebase today. The existing mechanism is **capability gating**:
`RuntimeCapabilitiesService` exposes `supportsEpg`, `supportsDownloads`,
`supportsRecordings`, `supportsRemoteControl`, and route guards such as
`recordingsCapabilityGuard` in `apps/web/src/app/app.routes.ts`.

**[RECOMENDAÇÃO]** Do not overload capability flags with commercial state. Add a
separate `EntitlementService` next to `RuntimeCapabilitiesService`, holding
`{ tier, adsPolicy, expiresAt }`, and a `planFeatureGuard` beside the existing
route guards. Capabilities describe what the platform can do; entitlements describe
what the user bought.

**[RECOMENDAÇÃO]** Entitlement state that gates playback, downloads or database
access must live in the **main process**, mirrored into `electron-conf` exactly as
`APP_UPDATE_CHANNEL` and `PARENTAL_LOCK_ENABLED` already are
(`apps/electron-backend/src/app/events/settings.events.ts`). The renderer is the
untrusted side of this boundary; a licence check that lives only in Angular can be
bypassed by anyone who can edit a file.

**[RECOMENDAÇÃO]** Plan expiry **degrades, it does not block**. When the licence
expires: playback and the user's own playlists keep working; downloads, EPG
refresh, catch-up and recording stop; ads resume at the free-tier policy. A hard
block on a player the user has paid for until the last hour is the kind of thing
that ends up in a consumer-protection complaint. **[FATO]** The Brazilian Consumer
Code (Lei 8.078/1990) and the CDC apply to paid desktop software sold to
consumers; the refund and renewal terms belong in the terms of use, reviewed
before launch.

---

## 3. Advertising

### 3.1 Model

**[RECOMENDAÇÃO]** Direct sale only. No third-party ad network, no ad SDK, no
third-party script.

**[FATO]** Google's ad policies (updated 2026-08-04,
https://support.google.com/adsense/answer/48182) state that ads may not be
"integrated into a software application of any kind", and enumerate the only
permitted viewing frames for monetising an app: the Android WebView API for Ads,
iOS WKWebView, Android Chrome Custom Tabs and Trusted Web Activities, and
SFSafariViewController on iOS 9/10. Windows, WebView2 and Electron are in none of
them. **[FATO]** AdMob is mobile-only; the Flutter issue tracking desktop support
(`googleads-mobile-flutter#525`) was closed as not planned.

**[RECOMENDAÇÃO]** The reasons for rejecting third-party networks are concrete, not
stylistic: those networks require a verified website domain on the publisher
onboarding, they have no desktop SDK, the inventory that accepts app-only
publishers is the lowest quality, popunder and vignette formats are what the
Windows and Defender heuristics look for, and a ban with a withheld balance would
destroy the distribution channel that the paid licence depends on.

### 3.2 Slot placement

**[FATO]** The app has no ad, sponsor or promo code today. Natural surfaces, from
the repository map:

| Surface | Location | Note |
| --- | --- | --- |
| Dashboard empty state | `libs/workspace/dashboard/feature/src/lib/rails/workspace-dashboard-rails.component.html:12-13` | Highest visibility, already asymmetric |
| Workspace shell banner | `libs/workspace/shell/feature/src/lib/workspace-shell/workspace-shell.component.html:118` | Global slot above the router outlet |
| Empty state variants | `libs/playlist/shared/ui/src/lib/recent-playlists/empty-state/empty-state.component.ts:13-14` | `welcome-dashboard`, `welcome-sources`, `no-data` |
| Live channel start | Player view, once per live channel opened | The one in-player impression |
| Server sign-in | `apps/web/src/app/server-storage/server-sign-in.component.ts:29` | B2B provider messaging |

**[RECOMENDAÇÃO]** The in-player slot appears **once when a live channel starts**,
not on pause, not on seek, not on quality change. It must not cover the video, must
be dismissible, and must never delay playback. Any slot that interrupts viewing is
a support ticket generator and a refund reason.

### 3.3 Technical rules

**[FATO]** The renderer is the unguarded HTTP path: the CSP in
`apps/web/src/index.html:11` permits `connect-src 'self' http: https: ws: wss: blob:
data:`, and the TMDB service already does raw `fetch` from the renderer
(`libs/services/src/lib/tmdb-api.service.ts:210`). The main process is the
hardened path: `requestWithValidatedRedirects`
(`apps/electron-backend/src/app/util/validated-axios.ts:229`) revalidates every
redirect hop, and `validateRemoteUrl`
(`apps/electron-backend/src/app/events/url-safety.ts:208`) blocks loopback, private
and reserved addresses, including IPv4-mapped IPv6.

**[RECOMENDAÇÃO]** Ad creatives are **local assets** — HTML/CSS rendered by the
existing Angular components, with the image bundled or fetched through the
main-process guarded client. Consequences that matter:

- The CSP is not relaxed. A third-party ad script would force `script-src` to
  accept a foreign origin, which is a real security regression in an app that
  handles provider credentials.
- No new egress class, no third-party SDK, nothing to disclose in the privacy
  policy beyond "we show sponsor messages".
- The ad slot cannot navigate the app, cannot read the database, and cannot make
  requests of its own.

**[FATO]** Microsoft classifies software as potentially unwanted when it behaves
like advertising software: no obvious close control on the ad, the product name
not visible, no standard uninstaller, the ad not clearly distinguishable from the
app's own content, or the ad triggering a file download. **[RECOMENDAÇÃO]** Each
slot therefore has: a visible close control, a label identifying it as
sponsorship, a border separating it from app content, and no automatic download.

**[FATO]** The upstream's own `request-header-overrides.service.ts` demonstrates the
pattern of a narrowly scoped header shim — it now injects a first-party Referer
for YouTube embed hosts only, so trailer requests are not attributed to the
upstream project. **[RECOMENDAÇÃO]** Ad requests use the product's own
identification in `User-Agent` and `Referer`, never the upstream's.

### 3.4 How the money arrives

**[RECOMENDAÇÃO]** Direct sale, invoiced. The advertiser buys a slot package
(impressions or a fixed period) and pays by invoice — Pix for a Brazilian
advertiser, bank transfer or card through the merchant of record for a foreign
one. There is no network, no minimum withdrawal threshold, no net-15 cycle and no
antifraud clawback on impressions we cannot audit.

**[FATO]** Third-party ad networks impose minimum withdrawal thresholds of roughly
US$ 5 to US$ 1,000, cycles of twice a month, and payment terms of net 7 to net 20.
With small revenue, the balance can sit below the minimum for months.

**[FATO]** Receiving money from abroad requires a CNPJ, a service-export invoice and
a currency-exchange contract. **[RECOMENDAÇÃO]** A merchant of record already
withholds and remits consumption tax in the destination, so a direct-sale invoice
to a foreign advertiser should be routed through the same provider rather than
handled as a raw cross-border service export. Take the tax question to an
accountant before the first foreign invoice — this is a commercial decision with
a real cost difference, not a formality.

### 3.5 Measuring impressions

**[RECOMENDAÇÃO]** The one piece of infrastructure this needs is an impression
counter. Three options, in order of preference:

1. **The advertiser's own tracking** — a unique link or pixel per campaign. We
   measure nothing and are paid on attributed conversions. Lowest friction.
2. **A serverless counter** — one Cloudflare Worker with a KV counter, keyed by
   campaign and day, receiving no identifier of any kind. Enough to bill on
   impressions; still requires the advertiser to trust the number.
3. **A local counter in the app** — not auditable. The advertiser will not accept
   it, and neither should we.

**[RECOMENDAÇÃO]** Start with option 1. If a sponsor requires impression-based
billing, add option 2. Option 3 is not a business arrangement.

**[FATO]** The repository already contains a fail-closed network recorder,
`tools/release/capture-network-gate.ts:31-44`, which records **and cancels**
non-allowlisted traffic at the Electron session level, including main-process
requests. It is the tool that proves both "no ad request when the tier is
ad-free" and "no telemetry egress when telemetry is off".

### 3.6 Sponsors

**[RECOMENDAÇÃO]** The natural first sponsor is a VPN, a legal streaming service,
or a TV tuner/HDMI device — an advertiser whose product is adjacent and lawful.
**[RECOMENDAÇÃO]** Exclude IPTV list resellers from the advertising table in
writing, even at a higher rate: a sponsor that sells infringing content is a
sponsor whose brand appears in the app, and the ad slot is the most visible
surface in the product.

---

## 4. Protecting user data

### 4.1 The current gap

**[FATO]** Provider credentials are stored in plaintext in three places, all
produced by one function:

1. the `playlists.username` and `playlists.password` columns
   (`libs/shared/database/src/lib/schema.ts:31`),
2. the full-document JSON in the `playlists.payload` column
   (`libs/shared/database/src/lib/app-playlist-codec.ts:173`),
3. the user-facing backup file (`libs/services/src/lib/playlist-backup.service.ts`).

**[FATO]** The Windows Credential Manager store is implemented, tested and wired to
the preload bridge (`apps/electron-backend/src/app/services/credential-store.service.ts`,
`apps/electron-backend/src/app/events/credential-store.events.ts`), including a
deterministic reference mapper
(`apps/electron-backend/src/app/services/credential-reference.ts`) that produces
`vault:<sha256>` references. **No production code writes to it yet.**

**[FATO]** Electron's `safeStorage` on Windows uses DPAPI: the key is generated per
user, so the content is protected from other users on the machine but not from
other applications running in the same user session
(https://www.electronjs.org/docs/latest/api/safe-storage).

### 4.2 Target architecture

```
WRITE  renderer ──▶ main (playlist.events.ts)
                     ├─ extract secrets (password, MAC, stalker identity, signatures)
                     ├─ reference = buildCredentialReference({ serverUrl, username, password, mac, serial, deviceIds, signatures })
                     ├─ vault.set(reference, secrets)          ← Windows Credential Manager
                     ├─ strip secrets from the document
                     └─ row.credential_ref = reference;  password = NULL; macAddress = NULL
                       │
                       ▼
                     DB worker stores the row (no secret anywhere)

READ   DB worker ──▶ main
                     ├─ row.credential_ref present?
                     │     ├─ yes ▶ vault.get(reference) ▶ hydrate document with the secrets
                     │     └─ no  ▶ document as stored
                     └─▶ renderer
```

**[FATO]** The reference must be **deterministic from the connection identity**, not
random. Two SQL predicates compare the stored credential columns to decide whether
a clocked payload survives an upsert: `playlistConflictUpdate`
(`libs/shared/database/src/lib/app-playlist-conflict.ts:83-98`) and
`setPlaylistServerTimezone`
(`apps/electron-backend/src/app/database/operations/playlist-server-timezone.operations.ts`).
A random reference makes those comparisons always false and silently drops the
learned Xtream server clock on every metadata write; a stable-per-source
reference makes them always true and keeps a changed password from invalidating
the clock. The `vault:<sha256>` reference satisfies both.

**[RECOMENDAÇÃO]** Add a `credential_ref` column and compare it in those two
predicates, replacing the `username`/`password` comparison. Keep the legacy
columns nullable for schema compatibility and write them as NULL.

**[RECOMENDAÇÃO]** M3U source URLs and raw playlist payloads may also carry
tokens. They are encrypted at rest with `safeStorage` through a main-process
service, using an explicit versioned protected representation. A safeStorage
failure is a hard failure — the app does not fall back to plaintext.

**[FATO]** `safeStorage` is a main-process module, and the database worker runs in
a worker thread. Encryption therefore cannot happen inside the worker: it must
happen at the main/worker boundary, before the write and after the read.

### 4.3 Migration of existing profiles

**[FATO]** The migration must be idempotent and safe on repeated startup, and must
preserve the user's data — the repository rule is that migrations apply in
dependency order, preserve data, and are safe on repeated startup, tested against
actual historical SQLite schemas rather than SQL mocks.

**[RECOMENDAÇÃO]** A one-shot migration, marked in `app_state`, that for each
playlist row holding a plaintext credential: computes the reference, writes the
secrets to the vault, sets `credential_ref`, nulls the plaintext columns, and then
compacts the database (`VACUUM`) so the freed pages are not left in the file. The
vault write happens before the row update, so an interrupted migration leaves the
secret still readable in the old location rather than lost.

**[PRECISA REVISÃO JURÍDICA]** If an earlier build wrote plaintext credentials to
disk, that is a period of processing without the protection the design intends.
Whether a notification to the ANPD or to the data subject is warranted depends on
the exposure window and the user's configuration. This must be assessed before the
first public release, not after.

### 4.4 Backups

**[FATO]** The backup contract is `kind: 'iptvnator-playlist-backup'`, version 1,
and the importer requires exact equality on both
(`libs/services/src/lib/playlist-backup.service.ts:531-539`,
`libs/shared/interfaces/src/lib/playlist-backup.interface.ts:6-7`). Changing the
`kind` would reject existing backups.

**[RECOMENDAÇÃO]** Keep the `kind` value and bump the version for secretless
exports. A v2 export omits passwords, credential-bearing URLs and raw M3U data and
keeps non-secret preferences and viewing state; a v1 import is still accepted,
its credential fields are discarded rather than written, and the user is asked to
re-enter the credentials. The file name is free to change — the importer only
reads the content.

**[FATO]** MIT requires the copyright notice and licence text to be retained in
"all copies or substantial portions of the Software" (LICENSE.md). Renaming the
product is permitted; removing the notice is not. The notice must stay in the
repository **and** in the installer and the About screen.

---

## 5. LGPD structure

**[FATO]** The product is not outside LGPD because it is local. The developer
decides the purposes and means of processing and is the **controller**; the end
user is the **data subject** (art. 5º, VI). The law applies because the service
is offered to people in Brazil (art. 3º, I).

**[FATO]** A provider credential is personal data of the data subject and, for
incident purposes, **authentication data** (Res. CD/ANPD 15/2024, art. 3º, VI).
Its leakage is a relevant incident criterion (art. 5º, IV).

**[FATO]** The `safeStorage`/DPAPI scope is the **user**: protected against other
users of the same machine, not against other processes running as that user.

### 5.1 Legal basis per data category

| Category | Basis | Note |
| --- | --- | --- |
| Provider credential, in use | **Contract** (art. 7º, V) | Needed to play the user's own account |
| Provider credential, stored persistently | **Consent** (art. 7º, I) | Convenience, not necessity of the service |
| Watch history, favourites | **Contract**, strictly local | Becomes sensitive by inference (art. 11, § 1º) if transmitted |
| Telemetry (optional) | **Consent**, opt-in | Never contract — not necessary to play video |
| Crash diagnostics | **Consent** for detail; **legitimate interest** for minimal anonymous reports, with LIA | Crashes can carry credentials; redaction changes the basis |
| Device identifier for licence | **Contract** + **legitimate interest** for anti-fraud, with LIA | Persistent identifier is personal data |
| Advertising | **Consent** for personalised; **legitimate interest** for contextual, with LIA and opt-out | ANPD cookie guide: nothing pre-selected, reject-all available |
| Purchase, invoice | **Contract** + **legal obligation** (tax) | Not usable for marketing without its own basis |

**[FATO]** Art. 7º does not establish a hierarchy: the basis must fit the specific
purpose and comply with art. 6º (purpose, adequacy, necessity, transparency,
security, accountability). Using "contract" for everything is a common and
auditable failure.

### 5.2 Required artefacts

| Artefact | Content | Owner | Evidence |
| --- | --- | --- | --- |
| Privacy policy | Controller, DPO/contact, data, purposes, bases, sharing, transfers, retention, rights, security, ads, children, version/date | Legal + product | Public URL, versioned copy, in-app screenshot |
| Terms of use / EULA | Licence, acceptable use, provider account, plans, billing, refund, availability, liability, forum | Legal | Version accepted on first run |
| First-run notice | Layered summary, separate consent from terms, telemetry/ads choices | Product | Flow recording |
| RO/ROPA | One row per processing: data, purpose, basis, origin, sharing, retention, security, owner | DPO | Versioned record |
| RIPD | Description, necessity, risks, measures, residual risk, approval | DPO + security | Signed document |
| LIA | Interest, necessity, balancing, safeguards, conclusion | DPO | One per legitimate-interest purpose |
| Consent log | consent_id, purpose, text version, screen, timestamp, action, hash | Engineering | Immutable log |
| Retention policy | Category, period, basis, deletion method | DPO | Table + purge job |
| Sub-processor list | Name, country, service, data, role, DPA/SCC, contact | Procurement | Public page |
| DPA / SCC | Instructions, security, sub-processors, audit, incident, deletion, transfers | Legal | Signed contract + annex |
| Incident playbook | Criteria, roles, deadlines, ANPD/data-subject templates, post-mortem | Security + DPO | Runbook + drill |
| Rights runbook | Channels, identity check, SLA, response templates | Support + DPO | Tickets with SLA |
| Security policy | Access, encryption, logging, updates, vendors, backup, training | Security | Signed policy |

**[FATO]** A DPO is generally required (art. 41); a small agent may be exempted
(Res. 2/2022, art. 11) but **always** needs a working channel with data subjects.
High-risk processing removes the exemption (Res. 2/2022, art. 3º, I).

**[FATO]** Incidents: notify the ANPD and the data subject within **3 business
days** of becoming aware (Res. 15/2024, arts. 6º and 9º), doubled for a small
agent (art. 6º, § 8º). Keep a register of **all** incidents for **5 years**,
including those not notified (art. 10).

**[FATO]** International transfers: SCCs under Res. 19/2024 may be adopted without
prior approval, but the annex must be filled in. The adequacy period ended
2025-08-23. The EU was declared adequate by Res. 32/2026 — **the United States
are not covered**.

**[RECOMENDAÇÃO]** The architecture in §3 and §4 is chosen to keep the transfer
surface minimal: a locally rendered ad and a locally encrypted database mean very
few vendors, and therefore very few SCCs. Every vendor added later multiplies the
paperwork. That is a privacy argument for the ad design in §3, not just a
commercial one.

### 5.3 Where the notices appear

| Surface | Content |
| --- | --- |
| Installer | Privacy and terms links; version; telemetry checkbox **unchecked**; notice that the app accesses a third-party account |
| First run | Layered notice; terms acceptance separate from telemetry/ads consent; personalised or non-personalised choice |
| About | Policy, terms, DPO contact, "My data" (export/delete), telemetry toggle, ad preferences, open-source licences |
| Website | Policy, terms, DPO, sub-processors, transfer summary, changelog |
| Ad panel | Current state, purposes, vendors, "disable all", "delete advertising data" |

**[FATO]** The ANPD cookie guide (2022-10-18) recommends a reject-all button,
nothing pre-selected, consent per purpose, and revocation that propagates to
vendors. It is guidance, not binding law, but it is the enforcement reference.

### 5.4 Verification of the data-protection claims

**[RECOMENDAÇÃO]** Technical checks that can be run, not asserted:

- `strings` on the database and on log files must not contain the credential, the
  username, or a `user:pass@` URL.
- `sqlite3 app.db "PRAGMA cipher_version;"` is empty today — the database is not
  encrypted, only the credentials will be.
- `Get-AuthenticodeSignature` on the installer and on every unpacked binary.
- Network capture with telemetry off and an ad-free tier: zero outbound requests
  beyond those the user initiated.
- A crash test with a synthetic credential: the credential must not appear in the
  reported event.
- `Get-Acl` on the data directory: the current user only.
- A deletion test: after clearing the app's data, no database, key, log or
  vendor-side record remains.
- A data-subject request test: export, check the fields, check the deadline.

**[FATO]** The ECA Digital (Lei 15.211/2025), in force since 2026-03-17, requires
privacy by default (art. 7º), age verification without self-declaration for
inappropriate content (art. 9º), parental supervision (arts. 16-18), and **prohibits
profiling for commercial advertising aimed at children and adolescents** (art. 22).
An IPTV player with adult channels and advertisements is in scope.
**[PRECISA REVISÃO JURÍDICA]** Whether the product is "of probable access" by minors
and what age assurance is proportionate must be decided before launch.

---

## 6. Release readiness

### 6.1 Own update feed

**[FATO]** The update channel is switched off:
`APP_UPDATE_FEED_CONFIGURED = false`
(`libs/shared/interfaces/src/lib/app-update-channel.util.ts:34`), and the
repository it points at is still `4gray/iptvnator` (lines 58-59). The startup
check is commented out
(`apps/electron-backend/src/main.ts:183-186`) and `electron-builder.json` has no
`publish` block.

**[FATO]** The upstream CI collects the Windows `latest.yml` metadata
(`.github/workflows/build-and-make.yaml:1365`) and publishes a draft release for
`v*` tags, but every gate is keyed to `github.repository == '4gray/iptvnator'` and
`refs/heads/master` (lines 65, 72, 1219, 1424). The fork is on `main`.

**[RECOMENDAÇÃO]** The feed becomes this repository: the `publish` block names
`joaoizidioLoiola/IPTV-Player-NEW`, `APP_UPDATE_FEED_CONFIGURED` flips to true, the
upstream repository constant is repointed, and the workflow gates are rewritten for
`main`. **[RECOMENDAÇÃO]** The nightly channel, which exists upstream, is not
needed for a product with paid plans — it becomes the beta channel for the next
release, and it is the same machinery with a different destination.

**[FATO]** Windows code signing and the update feed use the same certificate
object. A release pipeline that can sign the installer can also sign the update
metadata, and without signing the updater cannot prove what it downloaded. They
are one purchase and one secret (`CSC_LINK` plus `CSC_KEY_PASSWORD`).

### 6.2 CI

**[FATO]** The upstream workflows require secrets a fork does not receive:
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_*`, `TMDB_API_KEY`, `NIGHTLY_RELEASE_TOKEN`,
`CODECOV_TOKEN`, `DOCKERHUB_*`, `snapcraft_token`, `PAT`. The CI workflow
triggers only on `master` (`.github/workflows/ci.yml:4-9`).

**[RECOMENDAÇÃO]** Replace the workflow set with a Windows-only one: CI on `main`
(typecheck, lint, unit, focused Electron E2E, the network gate), and a release
workflow on `v*` tags that builds the NSIS installer, signs it, publishes the
release with `latest.yml` and the blockmap, and validates the package layout.
Deleting the macOS, Linux, Snap, Flatpak, Docker and website workflows removes
roughly 60% of the matrix cost and every secret that a fork cannot have.

### 6.3 Documentation structure

**[FATO]** The repository keeps one canonical document per subsystem under
`docs/architecture/`, navigated by `docs/maintenance/agent-context-map.md`, with
procedures in `docs/development/`, repository skills in `.codex/skills/`, and a
release note per user-visible change in `.changes/`. `AGENTS.md` requires that
guidance stay small and canonical, with subsystem detail in the linked documents.

**[RECOMENDAÇÃO]** New canonical documents, one per subsystem introduced here:

- `docs/architecture/entitlements.md` — tiers, licence validation, offline
  behaviour, where the state lives, how expiry degrades the product.
- `docs/architecture/ad-slots.md` — slot inventory, rendering rules, frequency
  policy per tier, the Microsoft PUA criteria applied to each slot, measurement.
- `docs/architecture/telemetry-and-privacy.md` — what is collected, what never
  is, the consent model, the data-subject flow, and the network gate.
- `docs/architecture/release-pipeline.md` — updated for the own feed, own
  signing, own branch.

**[FATO]** The existing commercialization document
(`2026-10-21-commercialization-and-scale.md`) recommends open-core with a
perpetual licence and rejects advertising. The decisions in §2 and §3 of this
document supersede it: the licence is time-boxed rather than perpetual, and
advertising is direct-sale rather than rejected. The earlier document is kept as
the audit trail of the reasoning, with a pointer to this one.

---

## 7. Execution order

Sequenced by risk and dependency. Each phase ends with a verifiable exit
criterion.

| Phase | Work | Exit criterion | Gate |
| --- | --- | --- | --- |
| **0** | Credential migration to the vault; protected M3U payload; one-shot data migration | No credential in any SQLite row, WAL file or export; existing profiles keep working | Blocks the first paid release |
| **1** | Own update feed, signing, Windows CI, workflow pruning | Installer signed; N→N+1 update succeeds; CI green on `main` | Blocks any distribution |
| **2** | Entitlement service, tier state, activation, offline grace, degradation on expiry | A purchased key activates, survives restart, and expires correctly offline | Blocks charging |
| **3** | Ad slots, local creatives, frequency per tier, campaign rotation, measurement | An ad-free tier issues no ad request; the network gate proves it | Needs tier state |
| **4** | Privacy artefacts, consent, DPO channel, retention, rights runbook | Artefacts published and linked; consent recorded | Blocks charging |
| **5** | Bundle channel for IPTV providers: bulk keys, ad-free tier, partner terms | A provider can distribute three ad-free months | Needs tiers |

**[RECOMENDAÇÃO]** Phase 0 first, for a reason that is not obvious: the
credential migration is the only item that is a **legal** blocker rather than a
commercial one, it carries the highest data-loss risk, and it is the prerequisite
for writing an honest privacy policy. Everything else can wait for a paying
customer; that cannot.

---

## 8. Open decisions

| Decision | Status |
| --- | --- |
| Product name and icon | Name chosen (`IPTV Player NEW`); original icon shipped |
| Licensing provider | Lemon Squeezy (chosen), with the provider behind an interface |
| Ad model | Direct sale; local creatives; no third-party network |
| Ad placement | Dashboard, empty states, workspace banner, one impression on live start |
| Trial | Local, ~3 hours, deliberately trivial |
| Bundle tier | Three ad-free months, sold in bulk to IPTV providers |
| Expiry behaviour | Degrade, never block |
| Impression measurement | Advertiser tracking first; serverless counter only if required |
| Update feed | This repository, `main` branch, signed |
| Telemetry | Off by default, opt-in, generic events only, no content |
| Egress leaks to fix | `environment.prod.ts:7` (third-party Vercel proxy) and `settings.service.ts:14` (upstream GitHub) — both must go before a privacy policy claims data stays local |
| Legal review | 14 open points in the LGPD dossier; 5 blocking for launch |
