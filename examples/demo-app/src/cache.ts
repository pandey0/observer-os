import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

export async function getSession(token: string): Promise<{ id: string; name: string; email: string } | null> {
  const raw = await redis.get(`session:${token}`).catch(() => null);
  if (!raw) return null;
  return JSON.parse(raw) as { id: string; name: string; email: string };
}

export async function setSession(token: string, user: { id: string; name: string; email: string; avatar_color: string }): Promise<void> {
  await redis.setex(`session:${token}`, 60 * 60 * 24 * 7, JSON.stringify(user));
}

export async function deleteSession(token: string): Promise<void> {
  await redis.del(`session:${token}`);
}

export async function getProjectCounts(projectId: string): Promise<Record<string, number> | null> {
  const raw = await redis.get(`project:${projectId}:counts`).catch(() => null);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, number>;
}

export async function setProjectCounts(projectId: string, counts: Record<string, number>): Promise<void> {
  await redis.setex(`project:${projectId}:counts`, 60, JSON.stringify(counts));
}

export async function invalidateProjectCounts(projectId: string): Promise<void> {
  await redis.del(`project:${projectId}:counts`).catch(() => {});
}

// Simple rate limiter — returns true if request is allowed
export async function checkRateLimit(key: string, limit: number, windowSecs: number): Promise<boolean> {
  const k = `ratelimit:${key}`;
  const count = await redis.incr(k).catch(() => 0);
  if (count === 1) await redis.expire(k, windowSecs).catch(() => {});
  return count <= limit;
}

redis.on('error', (err: Error) => {
  console.warn('[redis] connection error:', err.message);
});
