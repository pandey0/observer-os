# Observer OS — Deployment Architecture

Observer OS is **local-first**. The entire core platform — Event Log, Projection Engine, Session Engine, Context Engine, AI Context API, and Runtime Explorer — runs on the developer's machine. No cloud dependency for any core feature.

---

## Deployment Model Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Developer Machine (local)                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               Observer OS Core Process                    │  │
│  │                                                           │  │
│  │   Event Log  │  Projection Engine  │  Session Engine      │  │
│  │   Context Engine  │  AI Context API (localhost:7892)      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                                       │
│              ┌──────────┴──────────┐                           │
│              │                     │                           │
│  ┌───────────▼──────┐  ┌───────────▼──────────────────────┐   │
│  │  Runtime Explorer │  │  Plugin Processes                 │   │
│  │  (Electron / web  │  │  Browser Observer                 │   │
│  │   / VS Code panel)│  │  PostgreSQL Observer              │   │
│  └───────────────────┘  │  React Observer                   │   │
│                         │  [other plugins]                  │   │
│                         └──────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               Instrumented Application                   │   │
│  │   (Browser tab · Node.js server · PostgreSQL · etc.)    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │  opt-in only
                              ▼
                    ┌──────────────────┐
                    │   Observer Cloud  │
                    │   (future, opt-in)│
                    │   Session sharing │
                    │   Remote AI access│
                    └──────────────────┘
```

---

## Local Deployment Modes

### Mode 1: Standalone Daemon (recommended)

Observer OS runs as a background process (daemon/service). The Runtime Explorer connects to it via localhost. This is the standard deployment for most developers.

```bash
# Start Observer
observer start

# Check status
observer status

# Stop Observer
observer stop

# Open Runtime Explorer
observer open
```

### Mode 2: VS Code Extension Host

Observer OS embedded inside a VS Code extension. The extension host process runs the Observer core. The Runtime Explorer appears as a VS Code panel. Useful for developers who want everything in one window.

### Mode 3: CLI Mode

Observer OS invoked per-command for scripted workflows (CI, testing, one-shot context generation).

```bash
# Start a session, run tests, capture context on failure
observer session start --name "test-run-$(date +%s)"
npm test
observer context --anchor last-error --depth detailed --format markdown > context.md
observer session end
```

---

## Process Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Observer Core (single process)                              │
│                                                              │
│  ┌─────────────────┐   ┌─────────────────────────────────┐  │
│  │  Event Log      │   │  HTTP Server (localhost:7892)    │  │
│  │  (append-only)  │   │  AI Context API                  │  │
│  └────────┬────────┘   └─────────────────────────────────┘  │
│           │                                                  │
│  ┌────────▼────────┐   ┌─────────────────────────────────┐  │
│  │  Projection     │   │  WebSocket Server (localhost)    │  │
│  │  Engine         │   │  Live subscriptions              │  │
│  └────────┬────────┘   └─────────────────────────────────┘  │
│           │                                                  │
│  ┌────────▼────────┐   ┌─────────────────────────────────┐  │
│  │  Session Engine │   │  Plugin Manager                  │  │
│  │  Context Engine │   │  Lifecycle, health, reconnect    │  │
│  └─────────────────┘   └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

     IPC (local socket or localhost HTTP)

┌────────────────────────────────────┐
│  Plugin Process(es)                │
│  (each plugin in its own process)  │
│                                    │
│  Browser Observer process          │
│  PostgreSQL Observer process       │
│  [other plugin processes]          │
└────────────────────────────────────┘

     localhost:7892

┌────────────────────────────────────┐
│  Runtime Explorer                  │
│  (Electron app / VS Code panel /   │
│   browser dev tools panel)         │
└────────────────────────────────────┘
```

**Open question**: Should plugins run in the same process as Observer core (simpler, less isolation) or in isolated child processes (harder plugin crashes, better isolation)? See [RFC-0009 Open Questions](../rfcs/0009-plugin-sdk.md).

---

## Local Storage Layout

```
~/.observer/
├── config/
│   ├── settings.json          # global Observer settings
│   └── plugins/               # per-plugin configuration
│       ├── browser.json
│       └── postgresql.json
├── sessions/
│   ├── {session-id}/
│   │   ├── session.json       # session metadata (name, status, timestamps)
│   │   ├── events.ndjson      # append-only event log (one JSON event per line)
│   │   └── snapshots/
│   │       ├── snap_1000.json # snapshot at sequenceNumber 1000
│   │       └── snap_2000.json # snapshot at sequenceNumber 2000
│   └── {session-id-2}/
│       └── ...
└── plugins/
    └── installed/             # plugin binaries / symlinks

{project-root}/
└── .observer/
    ├── workspace.json         # workspace identity and settings
    └── .gitignore             # (generated) ignore .observer/ sensitive data
```

**Data ownership**: All data in `~/.observer/` is readable only by the current OS user. Plugin configurations are stored in plaintext except for secrets (API keys, credentials), which are stored in the OS keychain.

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 4 GB | 8 GB |
| Storage | 1 GB free | SSD with 10 GB free |
| OS | macOS 12+, Ubuntu 20.04+, Windows 11 | macOS 14+, Ubuntu 22.04+ |
| Runtime | Open question (Node.js / Rust / Go) | — |

**Open question**: What is Observer OS's own runtime? Node.js (fastest to build), Rust (best performance and memory), or Go (good balance)? This decision is deferred to the implementation phase.

---

## Port Configuration

| Port | Service | Configurable? |
|------|---------|--------------|
| 7892 | AI Context API (HTTP + WebSocket) | Yes |
| 7893+ | Plugin IPC ports | Yes (auto-assigned) |

**Port 7892** is Observer's default. If occupied, Observer will fail to start with a clear error message pointing to the port configuration setting. Auto-port-selection is not implemented by default (explicit configuration is more reliable).

---

## Security Model

### Local Mode (default)

- AI Context API listens on `localhost` only — not accessible from other machines.
- No authentication required for local connections.
- Plugin processes run as the current user — no privilege escalation.
- Sensitive fields (passwords, tokens, PII) are redacted at Context Engine output time. Original events are stored as emitted (the plugin is responsible for not emitting secrets in payloads).

### Filesystem Permissions

```bash
~/.observer/          # drwx------ (700) — owner only
~/.observer/config/   # drwx------ (700)
~/.observer/sessions/ # drwx------ (700)
```

### Plugin Trust

| Trust level | Who | What they can do |
|-------------|-----|-----------------|
| First-party | `@observer-os/plugin-*` | Full SDK access |
| Verified third-party | Published, signed plugins | Full SDK access |
| Unverified | Unsigned or local plugins | Full SDK access (with warning on first run) |

Observer does not currently sandbox plugins from accessing system resources beyond the SDK. This is a known limitation — see Future Work.

---

## Cloud Mode (opt-in, future)

Cloud mode enables features that require a server: session sharing, remote AI agent access, and team workspaces.

```
Developer Machine → Observer Core → Observer Cloud API
                                          │
                                  Session data (opt-in)
                                          │
                                  Remote AI Agents / Teammates
```

**What changes in cloud mode:**
- Sessions optionally synced to Observer Cloud on close (configurable per-session)
- AI Context API accessible remotely via API key authentication over HTTPS
- Team members can view shared sessions (read-only)

**What never changes:**
- All instrumentation runs locally — cloud has no access to the live runtime
- Developer always controls what is shared
- Core functionality never requires cloud

---

## Development vs. Production

| Mode | Use case | Features |
|------|----------|----------|
| **Development mode** (current) | Local development debugging | Full platform: Explorer, Sessions, Plugins, Context Engine, AI API |
| **Production mode** (future) | Production environment instrumentation | Lightweight: Event emission only, no Explorer, minimal overhead, no Context Engine |

Production mode is future work. It would allow Observer plugins to run in production environments with minimal overhead, emitting events to a collector that bridges to existing observability platforms (Datadog, Grafana, etc.).

---

## References

- [RFC-0006: Projection Engine](../rfcs/0006-projection-engine.md) — storage and performance characteristics
- [RFC-0007: Session Model](../rfcs/0007-session-model.md) — session storage tiers (HOT/WARM/COLD)
- [RFC-0009: Plugin SDK](../rfcs/0009-plugin-sdk.md) — plugin process model
- [RFC-0012: AI Context API](../rfcs/0012-ai-context-api.md) — API server, authentication, port configuration
