# AI agents: MCP, REST API and CLI

ClearMind exposes **one tool catalog** (`shared/agents/tools.ts`) through three doors.
Every door uses the same tokens, scopes, rate limits, audit log and the same
domain operations the apps use, so a task an agent creates is identical to one
you create on your phone and syncs to every device within seconds.

| Door | Where it runs | Use it for |
|---|---|---|
| **Hosted MCP** (Streamable HTTP) | `https://clearmind.meertech.tech/api/mcp` (Vercel) | Claude Code, Codex, any MCP client, from anywhere |
| **Local MCP** (stdio) | `node dist-agent/clearmind-mcp.mjs` on your machine | Same tools, no network hop to Vercel; talks to Firestore directly |
| **REST API** | `https://clearmind.meertech.tech/api/v1` | Scripts, automations, other languages |
| **CLI** | `node dist-agent/clearmind.mjs` | Terminal workflows |

Hosted and local both read and write the **same Firestore data**, so you can mix them freely.

## 1. Create a token

ClearMind → **Settings → Integrations & AI → Connect** (web or mobile).

1. Name the connection (e.g. "Claude Code – laptop").
2. Pick permissions: a preset (**Read only**, **Standard**, **Full**) or individual scopes.
3. Copy the token. **It is shown once.** Only its SHA-256 hash is stored
   (`users/{uid}/agentTokens/{hash}`), so it can't be recovered, only revoked.

The token screen also shows ready-to-paste snippets for each client.

| Scope | Allows |
|---|---|
| `tasks:read` | Inbox, Today, Upcoming, search, comments |
| `tasks:write` | Capture, create, update, complete, move, comment |
| `tasks:delete` ⚠ | Single task deletes |
| `projects:read` | Projects, sections, labels, progress |
| `projects:write` | Create / rename / archive projects and sections |
| `projects:delete` ⚠ | Delete a project (always needs confirmation) |
| `productivity:read` | Momentum, goals, streaks, history |
| `notes:read` | Notes vault: list, read, search, backlinks |
| `notes:write` | Create, edit, rename/move and import notes |
| `notes:delete` ⚠ | Delete notes (more than one needs confirmation) |
| `bulk` ⚠ | Bulk changes and deletes (with confirmation) |

Revoke one connection, or all of them, under **Settings → Integrations** or
**Settings → Security**. Revocation takes effect on the agent's next request.

## 2. Connect a client

### Claude Code: hosted (recommended)

```bash
claude mcp add --transport http clearmind https://clearmind.meertech.tech/api/mcp \
  --header "Authorization: Bearer cm_…"
```

### Claude Code: local

```bash
npm install && npm run build:agent           # produces dist-agent/*.mjs
claude mcp add clearmind -e CLEARMIND_TOKEN=cm_… -- node /path/to/ClearMind/dist-agent/clearmind-mcp.mjs
```

The local server needs Firestore admin credentials. It looks for them in this order:
1. `FIREBASE_SERVICE_ACCOUNT` (JSON or base64 JSON)
2. `CLEARMIND_SERVICE_ACCOUNT` (path)
3. `~/.config/clearmind/service-account.json`
4. Application Default Credentials

Keep the file at mode `600` and **never commit it**.

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.clearmind]
command = "node"
args = ["/path/to/ClearMind/dist-agent/clearmind-mcp.mjs"]
env = { CLEARMIND_TOKEN = "cm_…" }
```

### Any MCP client
Use Streamable HTTP at `/api/mcp` with header `Authorization: Bearer <token>`.
The endpoint is stateless (POST only).

The server provides:
- **Tools:** filtered to the token's scopes.
- **Resources:** `clearmind://today`, `clearmind://inbox`, `clearmind://upcoming`, `clearmind://projects`, `clearmind://productivity`.
- **Prompts:** `plan_my_day`, `weekly_review`, `project_blockers`.

## 3. REST API

```bash
# discover tools (JSON Schema for every input)
curl -H "Authorization: Bearer $CLEARMIND_TOKEN" https://clearmind.meertech.tech/api/v1/tools
# who am I / which scopes
curl -H "Authorization: Bearer $CLEARMIND_TOKEN" https://clearmind.meertech.tech/api/v1/me
# call a tool
curl -X POST https://clearmind.meertech.tech/api/v1/tools/inbox_capture \
  -H "Authorization: Bearer $CLEARMIND_TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Call Ahmed tomorrow 9am p1 #RanaWallet"}'
```

**Responses**
- Success: `{ "ok": true, "result": … }`
- Error: `{ "ok": false, "error": { "code", "message", "data"? } }`

**Status codes**
- `401`: bad, missing or revoked token.
- `403`: missing scope.
- `429`: rate limited (60 requests/min per token by default).
- `409` with code `confirm_required`: see Safety below.

## 4. CLI

```bash
npm run build:agent
alias clearmind="node /path/to/ClearMind/dist-agent/clearmind.mjs"
clearmind login cm_…                       # saved to ~/.config/clearmind/config.json (600)
clearmind today
clearmind add "Prepare Odyssey docs friday 4pm p2 @docs"
clearmind done <task-id>
clearmind stats
clearmind call tasks_list '{"query":"#RanaWallet & overdue"}'
clearmind notes "tag:#ranawallet"            # list / search notes
clearmind read "Projects/RanaWallet/Payments"
echo "# Retro" | clearmind write "Sprint retro" --folder Meetings
clearmind append "Sprint retro" "- action: rotate keys"
clearmind daily "- 09:00 standup done"
clearmind import ~/Obsidian/RanaWallet --into Projects/RanaWallet   # whole vault folder, 200 per batch
```

**Environment variables**
- `CLEARMIND_TOKEN`
- `CLEARMIND_API`: default `https://clearmind.meertech.tech/api`.
- `CLEARMIND_LOCAL=1`: talk to Firestore directly.

## 5. Safety model

- **Scopes** are checked on every call, and tools outside the token's scopes are not even listed.
- **Two-step confirmation** applies to every bulk delete, every project delete and any bulk change affecting more than 25 items:
  1. The first call returns a preview plus a short-lived `confirm_token` that is bound to the exact item set.
  2. Only a second call carrying that token applies the change.
  3. Agents are instructed to show you the preview first.
- **Bulk limit:** 200 items per call.
- **Idempotency:** pass `idempotency_key` to `tasks_create` (and captures). A retried request then returns the same task instead of a duplicate.
- **Audit log:** every call is recorded under `users/{uid}/agentAudit`, with agent, tool, ok/error and a summary. It is visible in **Settings → Integrations**, and Activity shows agent changes with an "agent" badge.
- **Attribution:** records written by agents carry `source` (`mcp`, `api` or `cli`) and `agent` (the token name).
- **Undo:** deletes are tombstones, and `tasks_restore` brings tasks back.

## 6. Example workflows

- **Capture:** "Add *renew the domain next Monday p1* to my inbox" → `inbox_capture`.
- **Plan my day:** use the `plan_my_day` prompt, or `views_today` + `views_overdue`. Then reschedule with `tasks_bulk_update {query:"overdue", due_string:"today"}`. More than 25 tasks returns a preview first.
- **Project setup:**
  1. `projects_create {name:"RanaWallet", sections:["Blocks launch","Payments","Backlog"]}`
  2. `tasks_create` with `project` + `section` + `due_string:"every friday 4pm"`
- **Weekly review:** the `weekly_review` prompt, or `productivity_summary` + `productivity_interval {interval:"last_week"}`.
- **Find blockers:** `productivity_project {project:"RanaWallet"}` returns progress, overdue, blocked and upcoming.
- **Notes vault:** `notes_import` brings in a folder of markdown (keeps folders; existing notes are skipped unless `if_exists:"update"`, which asks for a confirm_token). `notes_get` returns content, properties, outgoing links and backlinks; `notes_update {note, title|folder}` renames/moves and rewrites `[[links]]` in every other note; `notes_daily {append}` logs to today's daily note. Agent-written notes show up in the web vault and on mobile in real time.
- **Filters:** `tasks_list {query:"(today | overdue) & #Work & !@waiting"}`. The full syntax is the same as saved filters in the apps: `today`, `overdue`, `no date`, `next 7 days`, `p1`, `#Project`, `##Exact`, `/Section`, `@label`, `@wait*`, `search: words`, `due before: 2026-11-01`, `created by: agent`, combined with `& | !` and parentheses.

## 7. Tool reference

| Tool | Scopes | What it does |
|---|---|---|
| `inbox_capture` | tasks:write | Quickly add a thought, note or task to the Inbox without deciding where it belongs. |
| `inbox_list` | tasks:read | List open items in the Inbox (tasks and notes not yet organised into a project), newest first. |
| `tasks_create` | tasks:write | Create a task with structured fields. |
| `tasks_get` | tasks:read | Get one task with its sub-tasks and comments. |
| `tasks_list` | tasks:read | List tasks, optionally filtered by project, section, label, priority or a filter query (e.g. |
| `tasks_update` | tasks:write | Update fields of a task (title, description, due, priority, project, section, labels, recurrence, reminders, duration). |
| `tasks_complete` | tasks:write | Complete a task. |
| `tasks_reopen` | tasks:write | Reopen a completed task (and completed parents). |
| `tasks_delete` | tasks:delete | Delete one task and its sub-tasks. |
| `tasks_restore` | tasks:write | Undo a delete by restoring tasks by id. |
| `tasks_move` | tasks:write | Move tasks to a project and/or section (sub-tasks follow). |
| `tasks_bulk_update` | tasks:write, bulk | Apply the same change (priority, due, labels, project/section) to many tasks — select by ids or a filter query. |
| `tasks_bulk_complete` | tasks:write, bulk | Complete many tasks (by ids or filter query). |
| `tasks_bulk_delete` | tasks:delete, bulk | Delete many tasks (by ids or filter query). |
| `search_global` | tasks:read | Full-text search across task titles, descriptions, comments/notes, project and section names and labels; also returns matching projects and labels. |
| `views_today` | tasks:read | Today's plan: overdue tasks and tasks due today (in the user's time zone), plus completed-today count. |
| `views_upcoming` | tasks:read | Tasks grouped by day for the next N days (default 7). |
| `views_overdue` | tasks:read | Every open overdue task, oldest first. |
| `projects_list` | projects:read | All projects (nested order) with open task counts and progress. |
| `projects_get` | projects:read, tasks:read | A project workspace: sections with their open tasks, tracker statistics (progress, overdue, blocked, due this week, trend) and recent activity. |
| `projects_create` | projects:write | Create a project (optionally nested, with sections, or from a template id: software-release, product-launch, kanban, weekly-review, personal). |
| `projects_update` | projects:write | Rename, recolour, re-parent, favourite, archive/unarchive a project or change its view. |
| `projects_delete` | projects:delete | Delete a project with its sub-projects, sections and tasks. |
| `sections_list` | projects:read | Sections of a project in order, with open task counts. |
| `sections_create` | projects:write | Create a section in a project (e.g. |
| `sections_update` | projects:write | Rename a section, or move it to a new position (0-based) within its project. |
| `labels_list` | tasks:read | All labels with open task counts. |
| `labels_create` | tasks:write | Create a label (idempotent by name). |
| `comments_create` | tasks:write | Add a comment or note to a task (or a project). |
| `comments_list` | tasks:read | Comments/notes on a task or project. |
| `reminders_set` | tasks:write | Replace a task’s reminders. |
| `productivity_summary` | productivity:read | Momentum score and level, today's progress vs daily goal, this week by day vs weekly goal, streaks and the 8-week trend. |
| `productivity_interval` | productivity:read | Completed tasks for today, yesterday, this_week, last_week, this_month, last_month or a custom from/to range — with breakdowns by priority, project, on-time vs late, and source (mobile/web/agent). |
| `productivity_project` | productivity:read, projects:read | Execution tracker for a project (and its sub-projects): progress, completed this week, overdue, blocked, priority distribution, trend, recently completed and upcoming. |
| `activity_list` | tasks:read | Recent changes with where they came from (android/ios/web/mcp/api/cli) and which agent made them. |
| `filters_list` | tasks:read | Saved filters/views and the filter query syntax. |
| `filters_save` | tasks:write | Save a reusable filter (appears on mobile and web). |
| `templates_list` | projects:read | Available project templates (use projects_create with template=<id>). |
| `preferences_get` | tasks:read | Time zone, week start, daily/weekly goals and other settings that affect dates and productivity. |
| `notes_list` | notes:read | List notes in the vault (newest first) with path, tags, link counts and an excerpt. |
| `notes_get` | notes:read | Read one note by id, vault path ("Folder/Title"), title or alias: full markdown content, frontmatter properties, headings, outgoing [[links]] (resolved or not) and backlinks with context. |
| `notes_search` | notes:read | Full-text search across notes with Obsidian-style operators: words (AND), "exact phrase", -exclude, OR, tag:#x, path:folder, file:name, line:, content:, task:, task-todo:, task-done:, [property:value]. |
| `notes_create` | notes:write | Create a markdown note in the vault. |
| `notes_update` | notes:write | Edit a note: replace content, append or prepend text, merge frontmatter properties (null removes a key), bookmark, or rename/move it (title/folder) — renames rewrite [[links]] in every other note automatically. |
| `notes_daily` | notes:write | Get (or create) the daily note for a date (default today, user time zone) in the Daily folder, optionally appending text — e.g. |
| `notes_import` | notes:write | Create many notes at once (max 200 per call) — e.g. |
| `notes_delete` | notes:delete | Delete notes by id/path/title (moved to trash on every device). |

## 8. Development

| Task | Command |
|---|---|
| Rebuild bundles after changing `shared/`, `server/`, `api-src/` or `cli/` | `npm run build:agent` (esbuild → `dist-agent/*.mjs` (gitignored) and `api/mcp.js`, `api/v1.js` (committed; Vercel deploys them)) |
| Unit and protocol tests | `npx vitest run` (`shared/agents/agents.test.ts`, `server/mcp.test.ts` drives a real MCP SDK client) |
| Live end to end | `npm run test:e2e:agent`: creates a throwaway anonymous account, exercises MCP and REST, then deletes everything |

Hosted endpoints need the Vercel env var `FIREBASE_SERVICE_ACCOUNT` (base64 JSON
for `clearmind-agent@…`, role `roles/datastore.user`), set for Production and Preview.
