import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { setSession, deleteSession, checkRateLimit } from '../cache.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, avatar_color, created_at',
      [name.trim(), email.toLowerCase().trim(), hash],
    );
    const user = result.rows[0] as { id: string; name: string; email: string; avatar_color: string };
    const token = randomUUID();
    await setSession(token, user);
    return res.status(201).json({ token, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  const allowed = await checkRateLimit(`login:${ip}`, 10, 60);
  if (!allowed) return res.status(429).json({ error: 'Too many login attempts. Try again in a minute.' });

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const result = await pool.query('SELECT id, name, email, password_hash, avatar_color FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  const user = result.rows[0] as { id: string; name: string; email: string; password_hash: string; avatar_color: string } | undefined;
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = randomUUID();
  await setSession(token, { id: user.id, name: user.name, email: user.email, avatar_color: user.avatar_color });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_color: user.avatar_color } });
});

authRouter.delete('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '') ?? '';
  await deleteSession(token);
  return res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});
