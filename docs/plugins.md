# Plugin Reference

Observer OS instruments your stack via plugins. Two paths:

- **Zero-config** — `observer run` auto-detects and patches via `@observer-os/auto-instrument`
- **Manual SDK** — import the plugin, wire it up explicitly for fine-grained control

---

## Auto-instrumented (zero-config via `observer run`)

These libraries are detected and patched automatically when present in `node_modules`:

| Library | Package | Events |
|---------|---------|--------|
| Any HTTP server (Express, Fastify, Koa, raw `http`) | built-in | `observer.http-server/request.*` |
| Outgoing HTTP/HTTPS | built-in | `observer.http-client/request.*` |
| PostgreSQL (`pg`) | `pg` | `observer.postgres/query.*` |
| MySQL (`mysql2`) | `mysql2` | `observer.mysql/query.*` |
| Redis (`ioredis`) | `ioredis` | `observer.redis/command.*` |
| WebSocket server (`ws`) | `ws` | `observer.ws/client.*` |

---

## Manual plugins

### `@observer-os/plugin-express`

Fine-grained Express instrumentation with header sanitization and route pattern capture.

```ts
import { createRequestMiddleware, createErrorMiddleware } from '@observer-os/plugin-express';

app.use(createRequestMiddleware(sdk));
// ... your routes ...
app.use(createErrorMiddleware(sdk));
```

**Headers automatically redacted:** `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `proxy-authorization`

**Events:** `observer.express/request.started`, `observer.express/request.completed`, `observer.express/request.failed`, `observer.express/error.caught`

**Route pattern capture:** emits both `path` (actual: `/api/users/42`) and `route` (pattern: `/api/users/:id`)

---

### `@observer-os/plugin-postgres`

```ts
import { patchPool } from '@observer-os/plugin-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
patchPool(pool, sdk);
```

**PII-safe:** logs query text but not parameter values (logs `argKeys` only).

**Events:** `observer.postgres/query.started`, `observer.postgres/query.completed`, `observer.postgres/query.failed`

**Payload includes:** query text (first 500 chars), duration, row count on success, error message on failure.

---

### `@observer-os/plugin-redis`

```ts
import { patchIoRedis } from '@observer-os/plugin-redis';
import Redis from 'ioredis';

const redis = new Redis();
patchIoRedis(redis, sdk);
```

**Events:** `observer.redis/command.started`, `observer.redis/command.completed`, `observer.redis/command.failed`

**Payload includes:** command name, key (arg[0]), duration.

---

### `@observer-os/plugin-prisma`

Uses Prisma's `$extends` API — no prototype patching needed.

```ts
import { createObserverExtension } from '@observer-os/plugin-prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient().$extends(createObserverExtension(sdk));
```

**PII-safe:** logs `argKeys` (argument names) not values.

**Events:** `observer.prisma/query.started`, `observer.prisma/query.completed`, `observer.prisma/query.failed`

---

### `@observer-os/plugin-graphql`

Wraps any `execute`-shaped function — works with Apollo Server, Yoga, Mercurius, etc.

```ts
import { wrapExecute } from '@observer-os/plugin-graphql';
import { execute } from 'graphql';

const instrumentedExecute = wrapExecute(execute, sdk);
```

**Extracts:** `operationType` (query/mutation/subscription) and `operationName` from the DocumentNode.

**Events:** `observer.graphql/operation.started`, `observer.graphql/operation.completed`, `observer.graphql/operation.failed`

**Error capping:** errors array capped at 5 items in payload.

---

### `@observer-os/plugin-http`

Patches `http.request` and `https.request` globally — covers any library that uses Node's built-in HTTP (axios, got, needle, node-fetch v2).

```ts
import { patchHttp } from '@observer-os/plugin-http';
patchHttp(sdk);
```

**Daemon loop prevention:** requests to `localhost:4000` (Observer daemon) are skipped automatically.

**Events:** `observer.http/request.started`, `observer.http/request.completed`, `observer.http/request.failed`

---

### `@observer-os/plugin-react`

```ts
import { createObserverErrorBoundary } from '@observer-os/plugin-react';

const ObserverErrorBoundary = createObserverErrorBoundary(sdk);

// Wrap your app
<ObserverErrorBoundary>
  <App />
</ObserverErrorBoundary>
```

**Events:** `observer.react/error.boundary`, `observer.react/render.error`

---

### `@observer-os/plugin-nextjs`

```ts
// instrumentation.ts (Next.js 13.4+ built-in instrumentation hook)
import { register } from '@observer-os/plugin-nextjs';

export async function register() {
  await register({
    daemonUrl: process.env.OBSERVER_URL ?? 'http://localhost:4000',
  });
}
```

**Covers:** API routes, App Router server components, middleware, fetch calls.

---

## Browser inject script

No npm install. One script tag:

```html
<script src="http://localhost:4000/observer.js"></script>
```

**Patches:** `window.fetch`, `XMLHttpRequest`, `WebSocket`, `console.error`, `window.onerror`, `unhandledrejection`, `history.pushState`

**Auto-connects:** fetches `GET /api/sessions/default` on load, queues events until connected.

**Session ID:** detected automatically — no manual config needed.

---

## Plugin registry

```bash
# Search available plugins
observer registry list
observer registry search --category database
observer registry search --runtime node --tag sql

# Get plugin details
observer registry get plugin-postgres
```

Or call the API directly:

```bash
curl http://localhost:4000/api/registry
curl "http://localhost:4000/api/registry?category=database&runtime=node"
```

---

## Building a custom plugin

```ts
import type { ObserverPlugin, ObserverSDK } from '@observer-os/sdk';

export class MyPlugin implements ObserverPlugin {
  readonly id = 'my-org/my-plugin';
  readonly version = '1.0.0';

  async connect(sdk: ObserverSDK): Promise<void> {
    // Called when a session starts
    sdk.emit({
      type: 'observer.my-plugin/started',
      sourceNodeId: sdk.generateNodeId('my-plugin'),
      occurredAt: Date.now(),
      payload: { version: this.version },
    });
  }

  async disconnect(): Promise<void> {
    // Called when session ends — clean up patches here
  }
}
```

Node type registration (for Explorer UI):

```ts
sdk.registerNodeType({
  type: 'my-plugin/Widget',
  domain: 'my-plugin',
  capabilities: ['QUERYABLE', 'STREAMABLE'],
  relationships: ['DEPENDS_ON'],
});
```

Event type naming convention: `observer.<domain>/<object>.<verb>`
- Domain: your plugin's short name (`my-plugin`)
- Object: the thing being observed (`widget`, `job`, `query`)
- Verb: what happened (`started`, `completed`, `failed`, `created`, `destroyed`)
