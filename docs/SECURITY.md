# ClearMind security

Audit date: 2026-10-09. Scope: the backend and security-relevant configuration. It covers:
- the Vercel functions `api-src/{v1,mcp,oauth,http,idToken}.ts`, built to `api/*.js`;
- `server/` and `shared/agents/`;
- `firestore.rules`;
- dependencies, secrets and git history;
- the production web bundle and the production HTTP surface.

Web and mobile client code was **read** for context but not changed. Findings that belong to those codebases are listed with an owner.

Method: code review against the checklist below; unit tests for every fix; Firestore emulator tests for the rules; and a few read-only requests to `https://clearmind.meertech.tech`. Nothing in production was modified: no rules deploy, no auth or console changes.

## Threat model in one paragraph

All user data lives in Firestore under `users/{uid}/…`. Shared workspaces live under `workspaces/{id}`. The data has three ways in:
1. **Firebase client SDKs** (web and mobile), guarded by `firestore.rules`.
2. **Agent tokens** `cm_<uid>_<secret>` for MCP, REST and CLI, verified server-side by firebase-admin. Only `sha256(token)` is stored, and the lookup key is the hash of the whole token, so the uid inside a token can't be swapped to reach another user (there's a test for this in `shared/agents/agents.test.ts`).
3. **OAuth 2.1** for claude.ai and ChatGPT connectors. It mints the same kind of agent token after the user consents with a Firebase ID token.

firebase-admin bypasses rules, so every server path must take the uid from a verified credential, never from the request. The audit confirmed that every Firestore path in `api-src/` and `server/` meets this rule.

## Findings

Severity is rated on exploitability × impact for this app. **Status** is one of:
- `fixed`: in this branch;
- `fixed (deploy)`: in the repo, but takes effect only after `firebase deploy --only firestore:rules`;
- `open`: needs the owner or another codebase.

| # | Severity | Finding | Where | Status | Remediation |
|---|---|---|---|---|---|
| S1 | **Critical** | The Gemini API key is compiled into the public web bundle. Production chunk `assets/geminiService-*.js` contains a Google API key (prefix `AIzaSyCEjl…`). Anyone can use it on the owner's quota and bill. | `vite.config.ts` (`define` of `process.env.GEMINI_API_KEY` / `API_KEY`), `services/geminiService.ts:43` | **open** (server side done) | **Rotate the key now** (GCP console → Credentials). Then use the new server proxy `POST /api/v1/ai/generate` (contract below) with the server-only env var `GEMINI_SERVER_API_KEY`. The web agent removes the `define` and calls the proxy. |
| S2 | **High** | The mobile app inlines `EXPO_PUBLIC_GEMINI_API_KEY` into the binary (`extra.geminiApiKey`). Anything `EXPO_PUBLIC_*` can be pulled out of the APK/IPA. | `apps/mobile/app.config.ts:146`, `apps/mobile/lib/config.ts:37` | **open** | Same proxy (native apps send no `Origin`, so CORS doesn't apply). Delete the EAS env var after the switch and rotate the key. |
| S3 | High | OAuth access tokens never expired, and the token response had no `expires_in`. A leaked connector token stayed valid until someone revoked it by hand. | `api-src/oauth.ts` `mintAccessToken` | fixed | Access tokens get `expiresAt` (24 h), and `authenticate()` rejects them once expired. `expires_in` is returned. Refresh tokens expire after 90 days unused. Older tokens without `expiresAt` keep working. |
| S4 | Medium | Refresh-token rotation wasn't atomic, so two concurrent refreshes could both mint tokens. | `api-src/oauth.ts` refresh grant | fixed | Read and delete now happen in one Firestore transaction (test: concurrent refresh gives one 200 and one 400). The superseded access token is deleted, so daily rotations don't pile up in Settings. |
| S5 | Medium | Unauthenticated `POST /api/oauth/revoke` with any well-formed `cm_<uid>_…` did a merge-`set`. That **created** `{revoked:true}` docs under any user's `agentTokens`. Those docs have no `createdAt`, and the Settings list sorts with `b.createdAt.localeCompare` (`shared/data/agentTokens.ts:36`), which throws on them: a remote way to break a victim's Integrations screen. | `api-src/oauth.ts` revoke | fixed | Revoke only updates tokens that already exist. |
| S6 | Medium | The join-via-link rule only pinned `ownerUid`, `ownerEmail` and `name`. A joiner could change **any other field** of the workspace doc in the same write. | `firestore.rules` (join rule) | fixed (deploy) | Added `diff(resource.data).affectedKeys().hasOnly(['memberEmails','updatedAt'])`. The emulator test fails on the old rules and passes on the new ones. The client's `joinWorkspace` already writes only those two fields. |
| S7 | Medium | Workspace membership is granted by `request.auth.token.email` without `email_verified`. Email/password sign-up doesn't require verification, so an attacker who registers an invited person's email **before they do** gets that person's workspace access. | `firestore.rules` `isWsMember` and the join rule | **open** | Product decision needed: add `&& request.auth.token.email_verified == true` to the email branches (diff below). Unverified email/password users, and some GitHub sign-ins whose `email_verified` is false, would lose access until they verify. |
| S8 | Medium | Nothing limited OAuth register, token or approve requests, or failed authentication. Dynamic Client Registration (DCR) could be spammed into Firestore, and failed-auth floods cost reads. | `api-src/oauth.ts`, `api-src/mcp.ts`, `api-src/v1.ts` | fixed | Two-tier limiter (`server/rateLimit.ts`): a per-instance memory store in front of a Firestore fixed-window counter (hashed keys, admin-only collection, fails open). Limits are in the table under "Rate limiting". |
| S9 | Medium | The consent page `/oauth/authorize` can be framed. Production sends only HSTS: no `X-Frame-Options` or CSP `frame-ancestors`. A clickjacking page could get a signed-in user to click **Allow** for an attacker's client. | `vercel.json` (no `headers`) | **open** (web agent owns `vercel.json`) | Add the headers block below. |
| S10 | Medium | Consent phishing via DCR. Anyone can register `client_name: "Claude"` with their own redirect. `hostLabel` used `endsWith('claude.ai')`, so `evilclaude.ai` counted as Claude. | `shared/agents/oauth.ts` | fixed | A self-declared Claude/ChatGPT/Anthropic/OpenAI name whose redirect is off-domain is stored as `"<name> (via <host>)"`. Domain matching is exact or a true subdomain. Control and bidi characters are stripped, and `client_uri` must be https. DCR itself stays open by design (MCP spec). |
| S11 | Low | The redirect-URI scheme denylist was incomplete: `blob:`, `about:`, `vbscript:`, `intent:`, `chrome-extension:` and userinfo in https URLs got through. | `shared/agents/oauth.ts` `isAllowedRedirect` | fixed | Wider denylist, credentials rejected, 2000-char cap. Existing registered clients are unaffected because matching uses the stored list. |
| S12 | Low | A caller-supplied `client_id` went straight into a Firestore document path (`oauthClients/${client_id}`). | `api-src/oauth.ts` client/approve | fixed | `CLIENT_ID_RE = ^cmc_[A-Za-z0-9]{24}$` is checked before any path is built. |
| S13 | Low | The token endpoint didn't require `client_id` for `authorization_code` (RFC 6749 §4.1.3). PKCE already bound the code, so the impact was minimal. | `api-src/oauth.ts` | fixed | `client_id` is required and must match. claude.ai, ChatGPT and the MCP SDK all send it. |
| S14 | Medium | Tool arguments were only checked for presence of required fields. Wrong types reached domain code, there was no size or depth cap, and `__proto__`/`constructor` keys were accepted. | `shared/agents/tools.ts` `callTool` | fixed | `shared/agents/validate.ts` validates against each tool's schema. It handles types, enums, a 200k-char string cap, a 1000-item array cap, a nesting depth of 8, and rejects prototype keys. It coerces common LLM drift (`"10"`→10, `"P1"`→`p1`) so agents keep working. |
| S15 | Low | Malformed JSON returned **500** "Internal error". The OAuth form reader had no body-size limit. | `api-src/http.ts`, `api-src/oauth.ts` | fixed | `HttpError` gives `400 invalid_json` and `413 payload_too_large`. Form bodies are capped at 64 KB and parsed into a null-prototype map. |
| S16 | Low | There was no request correlation, logs were unstructured, and OAuth logged raw exception messages, which can contain Firestore paths with uids. | `api-src/*` | fixed | `withRequest()` adds an `X-Request-Id` (taken from the request if well-formed, else a new UUID), writes one JSON access-log line (path only, never the query string), and returns a generic 500. `redact()` strips agent, refresh and code tokens, Bearer values, JWTs, `AIza` keys, PEM blocks and credential query params from every log string. |
| S17 | Medium | The MCP `?key=cm_…` credential sits in the URL, so it ends up in Vercel request logs, proxies and browser history. | `api-src/mcp.ts` `credential()` | **open** (accepted for compatibility) | Our own logs drop the query string. Documented as "prefer OAuth or the header" in `docs/AGENTS.md`. Plan to deprecate, and tell users who used it to rotate those tokens. |
| S18 | Low | Fetching Google's signing certs had no timeout or retry, and a new `kid` wasn't fetched until the cache expired. | `api-src/idToken.ts` | fixed | 4 s timeout, one retry, and a refetch on unknown `kid`. |
| S19 | Low | The OAuth 404 echoed the route name back in the response. | `api-src/oauth.ts` | fixed | Static message. |
| S20 | Low | The OAuth issuer and metadata come from `x-forwarded-host`. | `api-src/http.ts` `originOf` | fixed (opt-in) | Set `PUBLIC_ORIGIN=https://clearmind.meertech.tech` in Vercel to pin it. The responses aren't cached (`no-store`), so this was only a self-inflicted spoof. |
| S21 | Medium | The service worker caches **every** 200 GET, including cross-origin requests and `/api/*`, and serves them cache-first. It ignores `Cache-Control: no-store`, so it can serve stale authenticated JSON or stale Firestore/Google responses. | `public/sw.js:110-130` | **open** (web agent) | Skip `/api/`, `/.well-known/` and every non-same-origin request in the fetch handler, and respect `no-store`. |
| S22 | Low | Mobile workspace ids are `Date.now().toString(36)-Math.random()…` (about 41 bits, not a CSPRNG). Join-via-link security depends on the id being unguessable. The web build uses `crypto.randomUUID()`. | `apps/mobile/lib/id.ts:6`, `services/workspaceService.ts:25` (its fallback) | **open** (mobile agent) | Use `expo-crypto` `randomUUID()` for workspace ids. Rate limits make brute force impractical today, but the id is the only secret. |
| S23 | Medium | `npm audit --omit=dev` (root, without workspaces) reported 19 issues: 1 critical, 11 high. | `package-lock.json` | partially fixed | Patch-level lockfile bumps: `@grpc/grpc-js` 1.14.6 / 1.9.16, `undici` 6.29, `ws` 8.22/7.5.13/6.2.6, `websocket-driver` 0.7.5, `fast-uri` 3.1.8. That clears the critical. What's left is in the next section. |
| S24 | Info | The Firebase **web** API key (`AIzaSyBnuk…`) is in the bundle. That's public by design. | `services/firebase.ts` | **open** (console) | Restrict it in GCP: HTTP referrers `clearmind.meertech.tech/*`, `clearmind.expo.app/*`, `localhost`; API restrictions to Identity Toolkit, Token Service, Firestore and Installations. Restrict the Android and iOS keys by package / bundle id. |
| S25 | Low | The per-token `rateLimit` (requests/min) is per instance only, because Vercel instances share no memory. | `shared/agents/tools.ts` `rateLimit` | open (documented) | It's a soft limit. If a hard per-token limit is ever needed, reuse `FirestoreLimitStore` (one transactional write per call, about 30-80 ms from iad1→Tokyo; see RELIABILITY.md). |
| S26 | Info | Secrets scan. The working tree and all 151 commits (`git log --all -p`) contain no private keys, service-account JSON, `AIza` keys, `GOCSPX-` client secrets, keystore passwords or tokens. Only CI variable *names* appear. The root `.gitignore` didn't cover credential files (mobile's did). | `.gitignore` | fixed | Root `.gitignore` now covers `google-services.json`, `GoogleService-Info.plist`, `service-account*.json`, `*.jks`/`*.keystore`/`*.p8`/`*.p12`/`*.pem`, `credentials.json` and `.env.*`. |
| S27 | Info | No debug or admin endpoints found. Production has no source maps (`*.map` falls through to `index.html`). There are no verbose modes. `/api` has only three functions. | `api/` | ok | n/a |
| S28 | Info | Android permissions are minimal: a `blockedPermissions` list strips biometric, overlay, storage, media and microphone. `android:allowBackup` uses the Expo default (on). | `apps/mobile/app.config.ts:56-75` | open (mobile agent, optional) | Consider `android.allowBackup: false`, or backup rules that exclude the SQLite DB and secure-store. |
| S29 | Info | CORS. MCP and OAuth send `Access-Control-Allow-Origin: *` **without** `Allow-Credentials`. Every endpoint uses bearer tokens or PKCE with no cookies, and MCP clients (claude.ai, chatgpt.com, Inspector, desktop webviews) need open CORS. REST had no CORS at all. | `api-src/http.ts` | fixed | REST (`/api/v1`) uses an **allowlist**: the two web hosts, `localhost:3000` and `localhost:8081`, plus `CORS_ALLOWED_ORIGINS`. It reflects the origin only when allowlisted, adds `Vary: Origin`, never sends credentials, and ignores other origins (test included). |

## Fixes in this branch: the details

### OAuth server (`api-src/oauth.ts`, `shared/agents/oauth.ts`)

What was already correct and is now under test (`server/oauthHandler.test.ts`, 11 tests, with an in-memory Firestore):
- redirect_uri exact match, with only loopback ports allowed to vary (RFC 8252);
- PKCE S256 required, `plain` refused;
- codes are single-use: the transaction flips `used` before any check, so a failed PKCE attempt burns the code;
- 5-minute code TTL;
- everything stored hashed;
- `state` echoed back unchanged.

Consent CSRF isn't possible: `/approve` needs the user's Firebase ID token in the JSON body, and no cookie is involved. Clickjacking is S9.

New in this branch:
- access tokens expire (S3);
- refresh rotation is atomic (S4);
- revoke can't create documents (S5);
- `client_id` shape is validated (S12);
- `client_id` is required at the token endpoint (S13);
- per-IP rate limits (S8);
- bounded string inputs (`state` ≤ 2048, `id_token` ≤ 8192, `resource` ≤ 500);
- look-alike client names are labelled (S10);
- the scheme denylist is wider (S11).

### Rate limiting (`server/rateLimit.ts`)

Vercel functions share no memory, so the options are:
- **(a) per-instance token bucket:** free, but a soft limit, because each new instance resets it;
- **(b) Firestore-backed counter:** global; one transactional write per counted request;
- **(c) Vercel Firewall / WAF rate-limit rules:** best (enforced at the edge), but needs dashboard access.

The branch implements (a) in front of (b) for the sensitive routes. A flood from one IP is absorbed by the instance's memory store without any Firestore write. Global counting needs one transaction, and only on the counted path. Auth failures are counted **only when they happen**, so legitimate traffic pays nothing. Once an IP is over the limit, each instance remembers it and short-circuits with `429` before looking up any token. Keys are `sha256(rule:subject)`, so no raw IP or uid is stored. If Firestore is down the limiter **fails open** and logs a warning, because it's defence in depth, not authentication.

| Rule | Limit | Key |
|---|---|---|
| `oauth-register` | 30 / hour | IP |
| `oauth-approve` | 30 / 10 min | IP |
| `oauth-token` (token and revoke) | 300 / 10 min | IP (generous, because claude.ai and ChatGPT reach us from shared egress IPs) |
| `auth-fail` (MCP and REST, bad token) | 30 / 10 min | IP |
| `ai-min` / `ai-day` (AI proxy) | 15 / min, 300 / day | uid |

Recommended addition (owner, Vercel dashboard → Firewall): a rate-limit rule on `/api/oauth/*` and `/api/mcp` at the edge, for example 600 requests/min per IP. Optionally, a Firestore **TTL policy** on `rateLimits.expireAt` so old counters are cleaned up.

### Input validation (`shared/agents/validate.ts`)

Applied in `callTool` to MCP, REST and CLI alike. Details are in S14; the tests are in `shared/agents/validate.test.ts` and `shared/agents/agents.test.ts`.

Prototype pollution: `JSON.parse` creates `__proto__` as an *own* property, and object spread copies it as data, so there was no global pollution path. Such keys are now rejected outright anyway.

There's no server-side HTML or Markdown rendering: the API returns JSON only, and `X-Content-Type-Options: nosniff` is set on every API response.

### Errors, logs and health (`api-src/http.ts`, `api-src/v1.ts`)

- **Error shapes.** Each surface keeps the shape its clients already parse:
  - REST: `{ ok:false, error:{ code, message }, requestId }`;
  - MCP: JSON-RPC `{ error:{ code, message } }`;
  - OAuth: RFC 6749 `{ error, error_description }`.
  Every response carries `X-Request-Id`. No stack trace or exception message reaches a client, and 500s are always generic.
- **Logs.** One JSON line per request: `{level,msg,time,fn,requestId,method,path,status,durationMs}`, plus `error` lines with a redacted `detail`.
- **`GET /api/v1/health`.** Liveness: no I/O, no user data. Returns `{status:'ok',version,time,requestId}`.
- **`GET /api/v1/ready`.** Readiness: Firebase Admin initialises and Firestore `_health/ready` can be read within 3 s. Returns `200 {status:'ready',checks}` or `503 {status:'unavailable',checks:{firebaseAdmin,firestore}}`. Failure details go to logs only.
- **Timeouts.**
  - Google cert fetch: 4 s plus one retry.
  - Readiness: 3 s.
  - Gemini: 25 s, no retry, because generation isn't idempotent and costs money.
  - Firestore admin calls rely on the SDK's own gRPC deadlines and retries, bounded by the function's `maxDuration` of 30 s. Wrapping them in races would only hide work that's still running.

### Gemini server proxy: contract for the web and mobile agents

```
POST https://clearmind.meertech.tech/api/v1/ai/generate
Authorization: Bearer <Firebase ID token>          (user.getIdToken())
Content-Type: application/json
{ "contents": [{ "role": "user" | "model", "parts": [{ "text": "…" }] }],   // ≤ 60 turns, ≤ 120k chars total
  "systemInstruction": "…",                                                  // optional, ≤ 20k chars
  "tools": ["urlContext", "googleSearch"] }                                  // optional (reviewApplication)

200 { "ok": true, "result": { "text": "…" } }
400 invalid · 401 unauthorized · 429 rate_limited (Retry-After) · 502 upstream_error · 503 ai_unavailable · 504 upstream_timeout
    error body: { "ok": false, "error": { "code", "message" }, "requestId" }
```

- The model is fixed server-side (`gemini-2.5-flash`, the model `shared/ai/geminiCore.ts` uses today).
- Client change: in `shared/ai/geminiCore.ts`, replace `ai.models.generateContent({...})` with a `fetch` to this route carrying the same `contents` / `systemInstruction` / `tools`, then read `result.text`. Drop `@google/genai` from the client bundle.
- `reviewApplication` passes `tools: ["urlContext","googleSearch"]`. Its existing retry-without-tools fallback keeps working, because a 502 is thrown as an error.
- Web on `clearmind.expo.app` must call the absolute URL above (that host has no functions). CORS already allows it.
- Owner steps:
  1. Create a new key restricted to the Generative Language API.
  2. Set it as `GEMINI_SERVER_API_KEY` (Vercel, Production and Preview, **not** exposed to the build).
  3. Ship the client change.
  4. Delete the Vercel `GEMINI_API_KEY` and the EAS `EXPO_PUBLIC_GEMINI_API_KEY`.
  5. Delete the leaked key.

### Firestore rules

The emulator suite is `tests/rules/firestore.rules.test.ts`, run with `npm run test:rules`. It needs Java 11+, uses a `demo-` project and never touches production. 14 tests cover:
- owner-only `users/{uid}/**`;
- cross-user denial, including `agentTokens`;
- anonymous denial;
- server-only collections (`oauthClients`, `oauthCodes`, `oauthRefresh`, `rateLimits`, `_health`) denied to clients;
- unknown collections denied;
- workspace member and outsider access to the doc, applications and projects;
- the membership list query;
- owner-only create, rename, delete and immutable ownership;
- join-via-link: own email only, no removals, no other fields;
- joining a nonexistent id is denied.

All 14 pass on the new rules. On the old rules the S6 case fails.

Recommended rule change for S7 (not applied; it needs a product decision):

```
function isWsMember(ws) {
  return request.auth != null && (
    request.auth.uid == ws.ownerUid ||
    (request.auth.token.email != null && request.auth.token.email_verified == true
      && request.auth.token.email in ws.memberEmails)
  );
}
// and in the join-via-link rule:  && request.auth.token.email_verified == true
```

There are no Storage rules because the app doesn't use Firebase Storage. Attachments are Firestore chunks under `users/{uid}`.

### Headers to add to `vercel.json` (owned by the web agent)

```json
"headers": [
  { "source": "/(.*)", "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
  ]},
  { "source": "/((?!api/|\\.well-known/).*)", "headers": [
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" }
  ]}
]
```

Only `frame-ancestors` is proposed for CSP. A full `script-src` policy needs an inventory of the web app's third-party origins (Firebase Auth popups, Google Fonts, Gemini) and belongs to the web agent. The second rule also covers `/oauth/authorize` (S9).

Optional additions to `vercel.json`:
- `"regions": ["hnd1"]`: see RELIABILITY.md. It cuts each Firestore round trip by about 150 ms.

### Dependency audit

Results for `npm audit --omit=dev`.

**Root (without workspaces), after the lockfile bumps:** 18 issues (0 critical, 11 high, 6 moderate, 1 low).
- `firebase` / `@firebase/firestore` → `@grpc/grpc-js` 1.9.16 (high). Only the client SDK's Node build uses gRPC; the browser bundle uses WebChannel. npm's suggested "fix" is a downgrade to firebase 9, so this is **not exploitable in the deployed web app** and was left alone. The server uses `@google-cloud/firestore` → grpc-js 1.14.6, which is patched.
- `xlsx` 0.18.5 (high: prototype pollution, ReDoS). No fix on npm. SheetJS publishes 0.20.3+ only on its CDN (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). It parses the user's **own** imported spreadsheets in their browser, so exploiting it means the user opening a malicious file. Recommendation for the web agent: move to the CDN tarball.
- `brace-expansion`, `minimatch`, `postcss`, `browserslist`, `nanoid`, `source-map-js`, `@babel/core`, `query-string`, `decode-uri-component`, `@react-navigation/core`, `gaxios` and `uuid` (in `@google-cloud/storage`). These are build tooling hoisted from the mobile workspace or Vite, or unused paths. None of them is in the server request path.

**Including the mobile workspace:** 62 issues before the bumps, 50 after. Most come through `expo` / `@expo/cli` / `@expo/config-plugins` (`xcode`, `xmldom`, `tar`, `send` and similar). The fix is the Expo SDK 57 major upgrade, which belongs to the mobile release pipeline and wasn't attempted here. These are build-time and CLI tools, not code that runs in the app.

`npm audit fix` was **not** used, because it rewrote about 1,200 lockfile lines of mobile Babel dependencies. Only targeted `npm update <pkg> --package-lock-only` patch bumps were applied.

## Items that need the owner's console access

1. **Rotate the leaked Gemini key** (S1/S2), then follow the proxy rollout steps above.
2. **Restrict the Firebase API keys** (S24): web key by referrer and API, Android key by package and SHA-1, iOS key by bundle id.
3. **Deploy the Firestore rules** (S6) once the PR is merged: `firebase deploy --only firestore:rules`. Decide on S7 first.
4. **Vercel env vars:**
   - `GEMINI_SERVER_API_KEY` (new, server-only);
   - `PUBLIC_ORIGIN=https://clearmind.meertech.tech`;
   - optionally `CORS_ALLOWED_ORIGINS` (for example preview URLs).
5. **Vercel Firewall:** an edge rate-limit rule for `/api/oauth/*` and `/api/mcp` (optional, recommended).
6. **Firestore TTL policy** on `rateLimits.expireAt`, `oauthCodes.expiresAt` and `oauthRefresh.expiresAt`. They're numbers today; TTL needs a Timestamp field, so add one if you enable this.
7. **Firebase service account** used by Vercel (`FIREBASE_SERVICE_ACCOUNT`): give it the minimum role (`roles/datastore.user`) instead of the default firebase-adminsdk Editor-like role. Rotate its key if it has ever been pasted anywhere other than Vercel.
8. **Firestore delete protection and PITR:** see RELIABILITY.md. Both are currently disabled.

## Limitations

- The Gemini key's restrictions and whether it has been abused can't be seen without the GCP console. The leaked key was deliberately **not** used to probe the API.
- The Vercel dashboard (firewall, env var exposure, log retention) and the Firebase Auth settings (one account per email, email enumeration protection) weren't inspected.
- No dynamic testing of the web and mobile clients (XSS in Markdown rendering is the web agent's area; the client uses DOMPurify).
- OAuth was tested against an in-memory Firestore double. `scripts/e2e-oauth.mjs` exercises the real flow and should be run against a preview deployment before merging. It's compatible with these changes.
