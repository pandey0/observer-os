# Task Manager

A real team task management app built with Express, PostgreSQL, Redis, and WebSocket.
Instrumented by Observer OS automatically via `observer run` — zero code changes.

## What this is

A Jira/Linear-lite with:
- User auth (Bearer token sessions in Redis, 7-day TTL)
- Workspaces → Projects → Tasks → Comments
- Kanban board UI (Todo / In Progress / In Review / Done)
- Real-time updates via WebSocket (when someone moves a task, everyone sees it)
- Activity feed per project

## Start

```bash
chmod +x scripts/start.sh
./scripts/start.sh
```

Opens at http://localhost:3000. Observer graph at http://localhost:5173.

**Test accounts (password: `password123`):**
| Email | Role |
|-------|------|
| alice@acme.com | Admin |
| bob@acme.com | Member |
| carol@acme.com | Member |

## What Observer captures automatically

Observer runs via `observer run` — no code changes to this app.

| Action | Observer sees |
|--------|--------------|
| Sign in | Redis SET session + pg SELECT users (linked) |
| Load tasks | Redis GET cache miss → pg SELECT tasks |
| Load tasks again | Redis GET cache HIT (no pg query) |
| Create task (invalid due date) | Express 400 response — FAILED node |
| Assign to non-member | Express 403 response — FAILED node |
| Move task to Done | pg UPDATE + Redis invalidate + WS broadcast |
| Comment on task | pg INSERT + WS broadcast |
| Open two browser tabs | Two WS connections, both get real-time updates |
| Register with duplicate email | pg unique violation → 409 — FAILED node |

## API

```
POST /api/auth/register   { name, email, password }
POST /api/auth/login      { email, password }
DELETE /api/auth/logout

GET  /api/workspaces
POST /api/workspaces
GET  /api/workspaces/:slug/projects
POST /api/workspaces/:slug/projects
POST /api/workspaces/:slug/invite   { email }

GET  /api/projects/:id/tasks        ?status=todo&priority=high
POST /api/projects/:id/tasks        { title, description, priority, due_date, assignee_id }
PATCH /api/tasks/:id                { status, priority, assignee_id, due_date }
DELETE /api/tasks/:id

GET  /api/tasks/:id/comments
POST /api/tasks/:id/comments        { body }

GET  /api/projects/:id/activity
```

## Give Claude access via MCP

Add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "observer-os": {
      "command": "node",
      "args": ["/absolute/path/to/observe/packages/mcp-server/dist/index.js"],
      "env": { "OBSERVER_URL": "http://localhost:4000" }
    }
  }
}
```

| Tool | What it does |
|---|---|
| `observer_debug_request` | Full HTTP chain debug — request/response bodies, SQL queries + params, console output, anomalies |

Ask Claude: "why is the task creation failing?" — it calls Observer tools directly, no copy-paste needed.
