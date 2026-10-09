# ClearMind reliability

A small app's SRE baseline: what the production path actually is, where it can fail, what was measured, what the targets are, and what to do when something breaks. Security findings are in [SECURITY.md](SECURITY.md).

## 1. Production request path

```
                          ┌──────────────────────── Vercel ────────────────────────────┐
 browser / PWA ──DNS──►   │ Anycast edge (TLS, HSTS; nearest PoP, e.g. cpt1)           │
 (clearmind.meertech.tech)│   ├─ static: index.html + /assets/* (immutable hashes)     │
                          │   │     (SPA rewrite: everything not /api, /.well-known)   │
 claude.ai / ChatGPT ───► │   └─ /api/*  ──► Serverless Functions, region iad1 (US-E)  │
 Claude Code / CLI / curl │        api/v1.js   REST + /health + /ready + /ai/generate  │
                          │        api/mcp.js  MCP (stateless Streamable HTTP)         │
                          │        api/oauth.js OAuth AS (+ /.well-known rewrites)     │
                          │        maxDuration 30 s · 1024 MB · autoscaled per request │
                          └───────────────┬───────────────────────┬────────────────────┘
                                          │ gRPC (firebase-admin) │ HTTPS
                                          ▼                       ▼
                   Firestore (Native) asia-northeast1      Google securetoken certs (cached)
                   users/{uid}/…  workspaces/…             Gemini API (AI proxy, 25 s budget)
                   oauth*/  rateLimits/  _health/
                          ▲
 web + mobile apps ───────┘ Firebase JS / RN SDK directly (realtime listeners, offline cache),
                            Firebase Auth (ID tokens), guarded by firestore.rules

 Second static host: clearmind.expo.app (EAS Hosting) serves the same web build but has
 no functions; it calls https://clearmind.meertech.tech/api/* (CORS allowlisted).
```

Facts behind the diagram, all verified:
- `vercel.json` sets `functions."api/*.js": { maxDuration: 30, memory: 1024 }`, with no `regions` key.
- Production responses carry `x-vercel-id: cpt1::iad1::…`, so the edge was in Cape Town and the functions in Washington DC.
- `firebase firestore:databases:get` (read-only) reports location **asia-northeast1** (Tokyo). Delete protection: **disabled**. Point-in-time recovery: **disabled**.

**What doesn't apply here.** Firestore is a serverless, Google-managed database, so there are no connections to pool and no replicas to balance. firebase-admin keeps one gRPC channel per function instance, reused across warm invocations through the module-level `repo` / `db` singletons. Vercel scales functions horizontally on its own, one invocation per concurrent request, and the edge is anycast. **Load balancing isn't needed.** Neither tier has a box to put behind a balancer, and nothing measured here shows a scaling bottleneck. The real limits are listed below.

## 2. Real limits and single points of failure

| Component | Limit / SPOF | Impact | Mitigation |
|---|---|---|---|
| **Region mismatch** (functions iad1 ↔ Firestore Tokyo) | Each Firestore round trip crosses the Pacific: about 150-170 ms RTT (estimated, not measured). An MCP tool call makes 4-6 sequential round trips (token lookup, `loadState`, commit transaction, audit). | Adds roughly 0.6-1 s to every authenticated tool call. This is the biggest latency lever. | Add `"regions": ["hnd1"]` (Tokyo) to `vercel.json` (web agent owns the file). Firestore's location can't be changed. |
| **`loadState` reads the whole account** | Every tool call reads **every document** in 9 collections (`server/firestoreRepo.ts` `loadState`). | Cost and quota grow with account size. A user with 3,000 tasks+notes costs about 3,000 reads per call. On the Spark (free) plan, 50k reads/day means about 15 calls/day for that user. | Check the billing plan (Blaze recommended). Longer term: per-tool scoped queries, or a per-instance state cache with a short TTL. |
| Firestore regional (asia-northeast1) | Single region; 99.99% SLA. No PITR and no delete protection. | A regional outage takes down every client, including direct-SDK web and mobile (offline caches keep the apps usable). An accidental delete can't be recovered. | **Enable delete protection and PITR (7 days), and add scheduled backups** (owner, console or `gcloud firestore databases update --delete-protection --enable-pitr`). |
| Firestore per-document writes | About 1 sustained write/sec per document. | Applies to `rateLimits/{hash}` docs under bursts from one IP. | Within the limits, an instance's memory tier absorbs the burst. Contention shows up as a failed transaction, and the limiter fails open. |
| Vercel functions | One region; 30 s `maxDuration`; cold starts (measured below at about 1.2-1.6 s extra); plan-level concurrency and invocation quotas. | An iad1 incident takes down MCP, REST and OAuth; static web keeps working. | Vercel's status page and instant rollback (runbook §5.5). Multi-region functions need a Pro plan and aren't worth it at this size. |
| Vercel edge + DNS for `meertech.tech` | SPOF for the custom domain. | A DNS problem takes the site down; the second host `clearmind.expo.app` keeps serving the web app. | Keep the expo.app host deployed (`npm run deploy:web`); it's a working fallback for the web UI. |
| Firebase Auth / securetoken certs | Needed for OAuth consent and the AI proxy. Certs are cached for about 1 h per Cache-Control; 4 s timeout plus one retry. | An outage blocks new connector sign-ins. Existing agent tokens keep working because they don't depend on Firebase Auth. | None needed. |
| Gemini API | External quota and outages. | Only AI features degrade (`502`/`503`/`504` from `/api/v1/ai/generate`). | Per-user limits (15/min, 300/day); clients show the error. |
| `FIREBASE_SERVICE_ACCOUNT` env var | One credential for all server access. | If it's revoked or rotated wrongly, every function fails. | `/api/v1/ready` reports `firebaseAdmin: fail` within seconds. Rotation runbook in §5.6. |
| Deploy pipeline | Vercel deploys `main` automatically. `api/*.js` are **committed build outputs**. | Forgetting `npm run build:agent` ships stale functions. | `docs/RELEASE.md` checklist. A CI check could compare a rebuild against the committed files. |

## 3. Measured baseline

Conditions:
- 2026-10-09 15:40 UTC, from a residential connection near Cape Town (edge PoP `cpt1`, functions `iad1`);
- 10 sequential `curl` requests per path, each a new TLS connection;
- unauthenticated, so the function answers 401 **without any Firestore I/O**: pure network plus function overhead;
- `/api/v1/health` isn't in production yet; it ships with this branch.

| Path | p50 total | p95 total¹ | Min | Max | Notes |
|---|---|---|---|---|---|
| `GET /api/v1/me` (401) | **0.61 s** | 2.16 s | 0.54 s | 2.16 s | First request 2.16 s (cold start); warm requests 0.54-0.64 s |
| `GET /api/mcp` (401) | **0.58 s** | 1.79 s | 0.55 s | 1.79 s | First request 1.79 s (cold start); warm requests 0.55-0.60 s |

¹ With n=10, p95 is the slowest sample, which is the cold start. TCP+TLS to the edge took 0.03-0.10 s (median about 0.06 s). Almost all of the remaining time is the edge→iad1 round trip from South Africa plus function time.

An authenticated tool call adds the Firestore round trips described in §2. It wasn't measured, because that needs a real token against production data.

To re-measure after a change (for example the `hnd1` move): use the same command against `/api/v1/health`, and use the server-side `durationMs` from the new access logs. The logs separate function time from the client's network.

```bash
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} %{time_starttransfer} %{time_total}\n" https://clearmind.meertech.tech/api/v1/health; done
```

## 4. SLIs and SLOs

All of these are **targets** proposed for a small app with one maintainer. None of them is measured yet; the measured numbers are in §3. Each SLI comes from the JSON access logs the functions now emit (`{"msg":"request","fn","status","durationMs",…}`). Vercel log drains or the dashboard's log search can compute them.

| SLI | Definition | SLO (28-day window) | Error budget |
|---|---|---|---|
| API availability | Share of `/api/*` requests that don't return 5xx. 4xx responses count as successes because they're client errors. | **99.5%** | About 3.4 h of full outage, or 0.5% of requests |
| Tool-call latency | Server-side `durationMs` p95 for `POST /api/v1/tools/*` and MCP `tools/call` | **< 1.5 s** now (iad1↔Tokyo); **< 0.8 s** after the `hnd1` move | n/a |
| OAuth connector success | Share of `/api/oauth/token` requests that don't return 5xx, and `/approve` 2xx out of all `/approve` that aren't 4xx | **99.5%** | Same as availability |
| Readiness | `/api/v1/ready` returns 200 (external uptime probe every 5 min) | **99.5%** | n/a |
| Static web | Vercel edge availability for `/` | Inherits Vercel's own (no separate SLO) | n/a |

Alert when an error budget burns fast, for example more than 2% of requests are 5xx over 1 h. A free uptime checker on `/api/v1/ready` is enough at this size.

## 5. Runbooks

Every API response carries `X-Request-Id`. Ask the user (or read it in the browser network tab), then search the Vercel logs for it.

### 5.1 API 5xx spike

1. `curl -s https://clearmind.meertech.tech/api/v1/ready`. The response identifies the failing dependency:
   - `firebaseAdmin: fail`: the service account env var is missing or invalid (recent env change? see §5.6);
   - `firestore: fail`: a Firestore outage or quota problem (see §5.3, and status.firebase.google.com).
2. Vercel → Logs, filter `level:error`. Group by `fn` and `msg` (`v1 error`, `mcp error`, `oauth error`, `unhandled`). `detail` is redacted but carries the exception message.
3. Did it start with a deploy? Vercel → Deployments: compare the time. If yes, **roll back first** (§5.5) and debug afterwards.
4. Is it only `ai upstream`? That's a Gemini problem, not a ClearMind outage. Check the Gemini quota in the GCP console.

### 5.2 OAuth connector failures (claude.ai / ChatGPT "couldn't connect")

1. Discovery: `curl -s https://clearmind.meertech.tech/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`. Both must return JSON whose `issuer` / `resource` use `https://clearmind.meertech.tech` (pin it with the `PUBLIC_ORIGIN` env var).
2. `curl -si -X POST https://clearmind.meertech.tech/api/mcp` should return 401 with `WWW-Authenticate: Bearer resource_metadata=…`. Without it, clients never start OAuth.
3. Logs, `fn:oauth`:
   - `rate limited` with `rule: oauth-*`: a shared egress IP hit a limit. Raise the limit in `server/rateLimit.ts` `LIMITS`, rebuild, deploy.
   - `invalid_grant` loops: check whether the user revoked access in Settings, or a refresh token expired (90 days unused). The user reconnects.
   - `login_required`: the user's Firebase session on the consent page expired. They sign in again.
4. Connectors that worked before this branch and now fail at refresh: access tokens expire after 24 h. A client that ignores `expires_in` and never refreshes gets 401 with `WWW-Authenticate … invalid_token`; spec-compliant clients refresh at that point. Temporary relief: raise `OAUTH_ACCESS_TTL_MS` in `shared/agents/oauth.ts`.
5. End-to-end check against a preview deployment: `node scripts/e2e-oauth.mjs` (see the header of that script for env).

### 5.3 Firestore quota / cost

1. Firebase console → Usage. Reads are dominated by `loadState` (the whole account read per tool call; see §2).
2. If one agent is hammering the API: find its `tokenId` in `users/{uid}/agentAudit`. The user can revoke it in Settings → Integrations, or you can set `revoked: true` on `users/{uid}/agentTokens/{hash}` with the admin SDK.
3. Spark plan exhausted: upgrade to Blaze and set a budget alert. Quotas reset daily at midnight Pacific time.
4. If `rateLimits` writes show up high, someone is flooding auth endpoints. Add a Vercel Firewall rule for that IP or path.

### 5.4 Stale web bundle

The web app is served from two hosts. Vercel auto-deploys `main`; `clearmind.expo.app` needs `npm run deploy:web`. The service worker (`public/sw.js`) serves cached assets cache-first. Runbook and fix ownership: the web agent (see SECURITY.md S21 for the cache-everything issue). API changes don't depend on the bundle, but the AI-proxy migration does: until the new bundle reaches users, old bundles keep calling Gemini directly with the embedded key.

### 5.5 Rollback

- **Functions and web (Vercel):** Vercel dashboard → Project → Deployments → pick the last good **Production** deployment → ⋯ → **Promote to Production** (Instant Rollback, about seconds). CLI: `vercel rollback <deployment-url>`. `api/*.js` are part of each deployment, so this rolls back both API and web together.
- **Firestore rules:** Firebase console → Firestore → Rules → history → select the previous version → Publish. Alternatively: `git show <good-rev>:firestore.rules > firestore.rules && firebase deploy --only firestore:rules`.
- **Data:** only possible after PITR or backups are enabled (§2). Today an accidental bulk delete has no rollback beyond ClearMind's own tombstones (`tasks_restore`).
- After rolling back, revert the commit on `main`. Otherwise the next merge redeploys the broken version.

### 5.6 Key and credential rotation

| Credential | Where | Rotate by | Blast radius while rotating |
|---|---|---|---|
| Gemini key (server) | Vercel `GEMINI_SERVER_API_KEY` | Create the new key (restricted to the Generative Language API) → update the env var → redeploy → delete the old key | AI features fail between the env change and the redeploy (about 1 min) |
| Gemini key (leaked, client) | Vercel `GEMINI_API_KEY`, EAS `EXPO_PUBLIC_GEMINI_API_KEY` | After the clients use the proxy: delete the env vars and delete the key in GCP | Old app versions lose AI. That's intended. |
| Firebase service account | Vercel `FIREBASE_SERVICE_ACCOUNT` (JSON or base64) | GCP → IAM → Service accounts → Keys → add key → update the env var (Production and Preview) → redeploy → `/api/v1/ready` returns 200 → delete the old key | Brief, if the old key stays valid until the redeploy finishes |
| Agent tokens (one user) | `users/{uid}/agentTokens` | The user: Settings → Security → revoke all. Takes effect on the next request. | That user's agents and connectors |
| All OAuth connectors | `oauthRefresh/*` | Delete the collection (admin), and optionally set `revoked: true` on every `agentTokens` doc with `via: 'oauth'`. Users reconnect. | All connector users |
| Firebase web / Android / iOS API keys | Build-time config | Public identifiers: restrict them rather than rotate them. Rotating requires new web and mobile builds. | n/a |
| Android upload keystore | GitHub/EAS secrets | Play Console upload-key reset (see `docs/RELEASE.md`) | Releases blocked until it's reset |

## 6. Recommendations, in order

1. Enable Firestore **PITR, delete protection and scheduled backups** (owner, console). Today there's no data recovery.
2. Move functions to **`hnd1`** (`vercel.json` `regions`) to put them next to Firestore. Re-measure with §3.
3. Confirm the **Blaze** plan plus a budget alert. Then reduce the reads in `loadState` per tool.
4. Point an external uptime check at `/api/v1/ready` and set up a log drain or saved search for `level:error`.
5. Add a CI step that runs `npm test`, `npx tsc --noEmit`, `npm run test:rules` and `npm run build:agent && git diff --exit-code api/`.
