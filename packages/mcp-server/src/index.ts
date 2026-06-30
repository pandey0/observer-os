#!/usr/bin/env node
// Entry point: load config, create server, connect stdio transport
import { createServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { DaemonClient } from './client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new DaemonClient(config);
  const server = createServer(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`Observer OS MCP Server running. Daemon: ${config.observerUrl}\n`);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
