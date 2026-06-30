import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DaemonClient } from './client.js';
import { listSessions, getSession, searchSessions } from './tools/sessions.js';
import { getNodes, getEvents } from './tools/graph.js';
import { getContext, querySession } from './tools/context.js';
import { getPerformance, exportSession } from './tools/analysis.js';
import { debugRequest } from './tools/debug.js';
import * as cdp from './tools/cdp.js';

/** Wrap a handler result as MCP text content. Errors become text, never thrown. */
async function safeRun(fn: () => Promise<string>): Promise<{ content: [{ type: 'text'; text: string }] }> {
  try {
    const text = await fn();
    return { content: [{ type: 'text' as const, text }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
  }
}

export function createServer(client: DaemonClient): McpServer {
  const server = new McpServer({
    name: 'observer-os',
    version: '1.0.0',
  });

  // observer_list_sessions — no input
  server.registerTool(
    'observer_list_sessions',
    {
      description:
        'List all Observer OS sessions with status, node count, and event count. Call this first to discover available sessions.',
    },
    async () => safeRun(() => listSessions(client)),
  );

  // observer_get_session
  server.registerTool(
    'observer_get_session',
    {
      description: 'Get details of a specific Observer OS session by ID.',
      inputSchema: { session_id: z.string().describe('The session ID to retrieve') },
    },
    async (args) => safeRun(() => getSession(client, args as Record<string, unknown>)),
  );

  // observer_search_sessions
  server.registerTool(
    'observer_search_sessions',
    {
      description: 'Search sessions by query text, domain, status, or tag.',
      inputSchema: {
        q: z.string().optional().describe('Free-text search query'),
        domain: z.string().optional().describe('Filter by domain'),
        status: z.string().optional().describe('Filter by status (ACTIVE, CLOSED, etc.)'),
        tag: z.string().optional().describe('Filter by tag'),
      },
    },
    async (args) => safeRun(() => searchSessions(client, args as Record<string, unknown>)),
  );

  // observer_get_nodes
  server.registerTool(
    'observer_get_nodes',
    {
      description:
        'Get all runtime graph nodes for a session. Nodes represent domains: express routes, postgres queries, react components, etc.',
      inputSchema: { session_id: z.string().describe('The session ID') },
    },
    async (args) => safeRun(() => getNodes(client, args as Record<string, unknown>)),
  );

  // observer_get_events
  server.registerTool(
    'observer_get_events',
    {
      description:
        'Get events for a session. Events are the raw timeline of what happened. Use limit to cap results.',
      inputSchema: {
        session_id: z.string().describe('The session ID'),
        limit: z.number().optional().describe('Maximum number of events to return (default: 100)'),
        after_sequence: z.number().optional().describe('Return events after this sequence number'),
      },
    },
    async (args) => safeRun(() => getEvents(client, args as Record<string, unknown>)),
  );

  // observer_get_context
  server.registerTool(
    'observer_get_context',
    {
      description:
        'Build a structured context package around a specific node. Returns Markdown with causal chain, source locations, and related events. Best input for AI analysis.',
      inputSchema: {
        session_id: z.string().describe('The session ID'),
        node_id: z.string().describe('The node ID (use observer_get_nodes first)'),
        depth: z
          .enum(['SURFACE', 'DETAILED', 'FULL'])
          .optional()
          .describe('Context depth: SURFACE, DETAILED (default), or FULL'),
      },
    },
    async (args) => safeRun(() => getContext(client, args as Record<string, unknown>)),
  );

  // observer_query
  server.registerTool(
    'observer_query',
    {
      description:
        'Ask an AI question about a session. Uses the Observer daemon\'s Claude integration to answer using runtime context. Requires ANTHROPIC_API_KEY set on the daemon.',
      inputSchema: {
        session_id: z.string().describe('The session ID'),
        question: z.string().describe('The question to ask about the session'),
        anchor_node_id: z
          .string()
          .optional()
          .describe('Optional node ID to anchor the query context'),
      },
    },
    async (args) => safeRun(() => querySession(client, args as Record<string, unknown>)),
  );

  // observer_get_performance
  server.registerTool(
    'observer_get_performance',
    {
      description:
        'Get performance analysis for a session: p50/p95/p99 timings by event type, slowest operations.',
      inputSchema: { session_id: z.string().describe('The session ID') },
    },
    async (args) => safeRun(() => getPerformance(client, args as Record<string, unknown>)),
  );

  // observer_export_session
  server.registerTool(
    'observer_export_session',
    {
      description: 'Export a session as markdown or JSON. Returns the full session content as text.',
      inputSchema: {
        session_id: z.string().describe('The session ID'),
        format: z
          .enum(['markdown', 'json'])
          .optional()
          .describe('Export format: markdown (default) or json'),
      },
    },
    async (args) => safeRun(() => exportSession(client, args as Record<string, unknown>)),
  );

  // observer_debug_request
  server.registerTool(
    'observer_debug_request',
    {
      description:
        'Reconstruct a full HTTP request chain: request body, SQL queries + params, Redis commands, console.log output, response body, and auto-detected anomalies (N+1, slow queries, SQL errors, schema mismatches). The single best tool for debugging API issues.',
      inputSchema: {
        session_id: z.string().describe('The session ID to inspect'),
        correlation_id: z
          .string()
          .optional()
          .describe('Optional: focus on a specific request correlation ID. Omit to see the last 10 requests.'),
      },
    },
    async (args) => safeRun(() => debugRequest(client, args as Record<string, unknown>)),
  );

  // ─── CDP tools ────────────────────────────────────────────────────────────

  server.registerTool('cdp_status', {
    description: 'Check if Chrome is connected via CDP. Chrome must be running with --remote-debugging-port=9222. Call this before other cdp_ tools.',
  }, async () => safeRun(() => cdp.cdpStatus(client)));

  server.registerTool('cdp_list_pages', {
    description: 'List all open pages/tabs in Chrome. Returns page id, url, and title.',
  }, async () => safeRun(() => cdp.cdpListPages(client)));

  server.registerTool('cdp_navigate', {
    description: 'Navigate the current Chrome page to a URL.',
    inputSchema: { url: z.string().describe('URL to navigate to') },
  }, async (args) => safeRun(() => cdp.cdpNavigate(client, args as Record<string, unknown>)));

  server.registerTool('cdp_new_page', {
    description: 'Open a new Chrome tab, optionally at a URL.',
    inputSchema: { url: z.string().optional().describe('URL to open (optional)') },
  }, async (args) => safeRun(() => cdp.cdpNewPage(client, args as Record<string, unknown>)));

  server.registerTool('cdp_select_page', {
    description: 'Switch the active page for CDP operations. Use cdp_list_pages to get page IDs.',
    inputSchema: { id: z.number().describe('Page ID from cdp_list_pages') },
  }, async (args) => safeRun(() => cdp.cdpSelectPage(client, args as Record<string, unknown>)));

  server.registerTool('cdp_take_screenshot', {
    description: 'Take a screenshot of the current Chrome page or a specific element. Returns base64 PNG.',
    inputSchema: { selector: z.string().optional().describe('CSS selector for element screenshot (optional, defaults to full page)') },
  }, async (args) => {
    try {
      return await cdp.cdpTakeScreenshotRaw(client, args as Record<string, unknown>);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  });

  server.registerTool('cdp_take_snapshot', {
    description: 'Take an accessibility tree text snapshot of the current page. Returns structured a11y tree JSON — useful for understanding page structure without a screenshot.',
  }, async () => safeRun(() => cdp.cdpTakeSnapshot(client)));

  server.registerTool('cdp_evaluate', {
    description: 'Evaluate JavaScript in the current Chrome page context. Returns the result as JSON/string.',
    inputSchema: { script: z.string().describe('JavaScript expression or function body to evaluate') },
  }, async (args) => safeRun(() => cdp.cdpEvaluate(client, args as Record<string, unknown>)));

  server.registerTool('cdp_click', {
    description: 'Click on an element in the current page by CSS selector.',
    inputSchema: { selector: z.string().describe('CSS selector of element to click') },
  }, async (args) => safeRun(() => cdp.cdpClick(client, args as Record<string, unknown>)));

  server.registerTool('cdp_fill', {
    description: 'Type text into an input, textarea, or select element.',
    inputSchema: {
      selector: z.string().describe('CSS selector of input element'),
      value: z.string().describe('Text to type'),
    },
  }, async (args) => safeRun(() => cdp.cdpFill(client, args as Record<string, unknown>)));

  server.registerTool('cdp_press_key', {
    description: 'Press a keyboard key (e.g. Enter, Tab, Escape, ArrowDown).',
    inputSchema: { key: z.string().describe('Key name: Enter, Tab, Escape, Backspace, ArrowUp, ArrowDown, etc.') },
  }, async (args) => safeRun(() => cdp.cdpPressKey(client, args as Record<string, unknown>)));

  server.registerTool('cdp_get_console', {
    description: 'Get console messages captured from the current Chrome page session.',
    inputSchema: { limit: z.number().optional().describe('Max messages to return (default: 50)') },
  }, async (args) => safeRun(() => cdp.cdpGetConsole(client, args as Record<string, unknown>)));

  server.registerTool('cdp_get_network', {
    description: 'Get network requests captured from the current Chrome page session. Shows URL, method, status, and timing.',
    inputSchema: { limit: z.number().optional().describe('Max requests to return (default: 50)') },
  }, async (args) => safeRun(() => cdp.cdpGetNetwork(client, args as Record<string, unknown>)));

  server.registerTool('cdp_heap_snapshot', {
    description: 'Capture a JavaScript heap snapshot summary for memory debugging. Returns size in MB.',
  }, async () => safeRun(() => cdp.cdpHeapSnapshot(client)));

  server.registerTool('cdp_performance_start', {
    description: 'Start a Chrome performance trace. Run the action you want to profile, then call cdp_performance_stop.',
  }, async () => safeRun(() => cdp.cdpStartPerformance(client)));

  server.registerTool('cdp_performance_stop', {
    description: 'Stop the running performance trace and get a summary.',
  }, async () => safeRun(() => cdp.cdpStopPerformance(client)));

  server.registerTool('cdp_emulate', {
    description: 'Emulate a mobile device viewport and user agent.',
    inputSchema: { device: z.string().describe('Device to emulate: "iPhone 12", "iPad", "Galaxy S21", or "desktop"') },
  }, async (args) => safeRun(() => cdp.cdpEmulate(client, args as Record<string, unknown>)));

  return server;
}
