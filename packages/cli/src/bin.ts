#!/usr/bin/env node
import { createClient } from './client.js';
import { listSessions, searchSessions, createSession, deleteSession } from './commands/sessions.js';
import { emitEvent } from './commands/emit.js';
import { querySession } from './commands/query.js';
import { exportSession } from './commands/export.js';

function parseFlags(args: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = 'true';
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function usage(): void {
  process.stdout.write(`
observer <command> [options]

Commands:
  sessions list
  sessions search [--q <text>] [--domain <d>] [--status <s>] [--tag <t>]
  sessions create [--name <name>] [--tags <tag1,tag2>]
  sessions delete <id>
  emit --session <id> --type <type> [--payload <json>]
  query --session <id> "<question>"
  export --session <id> [--format json|markdown]
  run <command>            Run command with Observer auto-instrumentation

Global flags:
  --url <url>     daemon URL (default: http://localhost:4000)
  --key <key>     API key
  --json          output raw JSON
`.trimStart());
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) { usage(); process.exit(0); }

  const { flags, positional } = parseFlags(rawArgs);
  const json = flags['json'] === 'true';
  const client = createClient({ url: flags['url'], apiKey: flags['key'] });

  const cmd = positional[0];
  const sub = positional[1];

  try {
    if (cmd === 'sessions') {
      if (sub === 'list') { await listSessions(client, json); }
      else if (sub === 'search') {
        const params: Record<string, string> = {};
        for (const k of ['q', 'domain', 'status', 'tag', 'from', 'to']) {
          if (flags[k]) params[k] = flags[k]!;
        }
        await searchSessions(client, params, json);
      }
      else if (sub === 'create') {
        const tags = flags['tags'] ? flags['tags'].split(',') : undefined;
        await createSession(client, flags['name'], tags, json);
      }
      else if (sub === 'delete') {
        const id = positional[2] ?? flags['id'];
        if (!id) { process.stderr.write('session id required\n'); process.exit(1); }
        await deleteSession(client, id, json);
      }
      else { usage(); process.exit(1); }
    }
    else if (cmd === 'emit') {
      const sessionId = flags['session'];
      const type = flags['type'];
      if (!sessionId || !type) { process.stderr.write('--session and --type required\n'); process.exit(1); }
      const payload = flags['payload'] ? JSON.parse(flags['payload']) as Record<string, unknown> : {};
      await emitEvent(client, sessionId, type, payload);
    }
    else if (cmd === 'query') {
      const sessionId = flags['session'];
      const question = positional[1] ?? flags['q'];
      if (!sessionId || !question) { process.stderr.write('--session and question required\n'); process.exit(1); }
      await querySession(client, sessionId, question);
    }
    else if (cmd === 'export') {
      const sessionId = flags['session'];
      if (!sessionId) { process.stderr.write('--session required\n'); process.exit(1); }
      const format = (flags['format'] ?? 'json') as 'json' | 'markdown';
      await exportSession(client, sessionId, format);
    }
    else if (cmd === 'run') {
      // Everything after 'run' is the user's command
      const runArgs = positional.slice(1); // positional[0] is 'run'
      const { runCommand } = await import('./commands/run.js');
      await runCommand(runArgs, flags);
    }
    else { usage(); process.exit(1); }
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
