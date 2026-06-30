import type { DaemonClient } from '../client.js';

export async function cdpStatus(client: DaemonClient): Promise<string> {
  const data = await client.get<{ connected: boolean; chromeUrl: string; message: string }>('/api/cdp/status');
  return JSON.stringify(data, null, 2);
}

export async function cdpListPages(client: DaemonClient): Promise<string> {
  const data = await client.get<{ pages: unknown[] }>('/api/cdp/pages');
  return JSON.stringify(data.pages, null, 2);
}

export async function cdpNavigate(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const url = args['url'] as string;
  const data = await client.post<{ url: string; title: string }>('/api/cdp/navigate', { url });
  return `Navigated to: ${data.url}\nTitle: ${data.title}`;
}

export async function cdpNewPage(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const data = await client.post<{ id: number; url: string; title: string }>('/api/cdp/pages/new', { url: args['url'] });
  return `Opened new page (id: ${data.id}): ${data.url}`;
}

export async function cdpSelectPage(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  await client.post('/api/cdp/pages/select', { id: args['id'] });
  return `Selected page ${String(args['id'])}`;
}

export async function cdpTakeScreenshot(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const data = await client.post<{ data: string; mimeType: string }>('/api/cdp/screenshot', { selector: args['selector'] });
  // Return as base64 image content for MCP
  return `Screenshot captured (base64 PNG, ${data.data.length} chars). Use the image data:\ndata:image/png;base64,${data.data.slice(0, 100)}...`;
}

export async function cdpTakeScreenshotRaw(client: DaemonClient, args: Record<string, unknown>): Promise<{ content: [{ type: 'image'; data: string; mimeType: string }] }> {
  const data = await client.post<{ data: string; mimeType: string }>('/api/cdp/screenshot', { selector: args['selector'] });
  return { content: [{ type: 'image' as const, data: data.data, mimeType: 'image/png' }] };
}

export async function cdpTakeSnapshot(client: DaemonClient): Promise<string> {
  const data = await client.post<{ snapshot: string }>('/api/cdp/snapshot', {});
  return data.snapshot;
}

export async function cdpEvaluate(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const data = await client.post<{ result: string }>('/api/cdp/evaluate', { script: args['script'] });
  return data.result;
}

export async function cdpClick(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  await client.post('/api/cdp/click', { selector: args['selector'] });
  return `Clicked: ${String(args['selector'])}`;
}

export async function cdpFill(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  await client.post('/api/cdp/fill', { selector: args['selector'], value: args['value'] });
  return `Filled "${String(args['selector'])}" with value`;
}

export async function cdpPressKey(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  await client.post('/api/cdp/press-key', { key: args['key'] });
  return `Pressed key: ${String(args['key'])}`;
}

export async function cdpGetConsole(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const data = await client.get<{ messages: unknown[] }>(`/api/cdp/console?limit=${String(args['limit'] ?? 50)}`);
  if (!data.messages.length) return 'No console messages captured yet. Make sure the page is loaded with CDP connected.';
  return JSON.stringify(data.messages, null, 2);
}

export async function cdpGetNetwork(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const data = await client.get<{ requests: unknown[] }>(`/api/cdp/network?limit=${String(args['limit'] ?? 50)}`);
  if (!data.requests.length) return 'No network requests captured yet. Make sure the page is loaded with CDP connected.';
  return JSON.stringify(data.requests, null, 2);
}

export async function cdpHeapSnapshot(client: DaemonClient): Promise<string> {
  const data = await client.post<{ totalSize: number; summary: string }>('/api/cdp/heapsnapshot', {});
  return data.summary;
}

export async function cdpStartPerformance(client: DaemonClient): Promise<string> {
  const data = await client.post<{ message: string }>('/api/cdp/performance/start', {});
  return data.message;
}

export async function cdpStopPerformance(client: DaemonClient): Promise<string> {
  const data = await client.post<{ summary: string }>('/api/cdp/performance/stop', {});
  return data.summary;
}

export async function cdpEmulate(client: DaemonClient, args: Record<string, unknown>): Promise<string> {
  const data = await client.post<{ ok: boolean; device: string }>('/api/cdp/emulate', { device: args['device'] });
  return `Emulating: ${data.device}`;
}
