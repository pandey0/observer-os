import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

function findAutoInstrument(): string | null {
  // Try resolving from npm registry first
  try {
    const req = createRequire(import.meta.url);
    return req.resolve('@observer-os/auto-instrument');
  } catch {}

  // Monorepo fallback — relative to packages/cli/dist/commands/run.js
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../auto-instrument/dist/index.js'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/auto-instrument/dist/index.js'),
  ];
  for (const p of candidates) {
    try {
      const { existsSync } = createRequire(import.meta.url)('node:fs') as { existsSync: (p: string) => boolean };
      if (existsSync(p)) return p;
    } catch {}
  }
  return null;
}

export async function runCommand(
  args: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (args.length === 0) {
    process.stderr.write('Usage: observer run <command> [args...]\n');
    process.stderr.write('Example: observer run node server.js\n');
    process.stderr.write('Example: observer run npm start\n');
    process.exit(1);
  }

  const autoInstrumentPath = findAutoInstrument();
  const observerUrl = flags['url'] ?? process.env['OBSERVER_URL'] ?? 'http://localhost:4000';
  const apiKey = flags['key'] ?? process.env['OBSERVER_API_KEY'] ?? '';

  // Build NODE_OPTIONS — prepend --require so it runs before user code
  const existingNodeOptions = process.env['NODE_OPTIONS'] ?? '';
  const requireFlag = autoInstrumentPath ? `--require ${autoInstrumentPath}` : '';
  const nodeOptions = [requireFlag, existingNodeOptions].filter(Boolean).join(' ');

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    OBSERVER_URL: observerUrl,
  };
  if (apiKey) env['OBSERVER_API_KEY'] = apiKey;
  if (nodeOptions) env['NODE_OPTIONS'] = nodeOptions;

  const [cmd, ...cmdArgs] = args;

  if (!autoInstrumentPath) {
    process.stderr.write('[Observer] warning: auto-instrument not found — running without instrumentation\n');
    process.stderr.write('[Observer] run `pnpm build` in packages/auto-instrument first\n');
  } else {
    process.stderr.write(`[Observer] auto-instrument: ${autoInstrumentPath}\n`);
  }
  process.stderr.write(`[Observer] daemon: ${observerUrl}\n`);
  process.stderr.write(`[Observer] running: ${cmd!} ${cmdArgs.join(' ')}\n`);

  const child = spawn(cmd!, cmdArgs, {
    stdio: 'inherit',
    env,
    shell: false,
  });

  child.on('error', (err) => {
    process.stderr.write(`[Observer] failed to start process: ${err.message}\n`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}
