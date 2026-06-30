export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(startMs: number, endMs?: number): string {
  const dur = (endMs ?? Date.now()) - startMs;
  if (dur < 1000) return `${dur}ms`;
  if (dur < 60_000) return `${(dur / 1000).toFixed(1)}s`;
  return `${Math.floor(dur / 60_000)}m ${Math.floor((dur % 60_000) / 1000)}s`;
}

export function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}
