import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

workspacesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const result = await pool.query(`
    SELECT w.id, w.name, w.slug, w.created_at, wm.role,
           COUNT(DISTINCT wm2.user_id) as member_count
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
    JOIN workspace_members wm2 ON wm2.workspace_id = w.id
    GROUP BY w.id, w.name, w.slug, w.created_at, wm.role
    ORDER BY w.created_at DESC
  `, [req.user!.id]);
  res.json({ workspaces: result.rows });
});

workspacesRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const { name, slug } = req.body as { name?: string; slug?: string };
  if (!name) return res.status(400).json({ error: 'name required' });
  const finalSlug = slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ws = await client.query(
      'INSERT INTO workspaces (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id, name, slug, created_at',
      [name.trim(), finalSlug, req.user!.id],
    );
    await client.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [ws.rows[0].id, req.user!.id, 'admin']);
    await client.query('COMMIT');
    return res.status(201).json(ws.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique')) return res.status(409).json({ error: 'Workspace slug already taken' });
    throw err;
  } finally {
    client.release();
  }
});

workspacesRouter.get('/:slug/members', async (req: AuthenticatedRequest, res) => {
  const ws = await pool.query('SELECT id FROM workspaces WHERE slug = $1', [req.params['slug']]);
  if (!ws.rows.length) return res.status(404).json({ error: 'Workspace not found' });
  const members = await pool.query(`
    SELECT u.id, u.name, u.email, u.avatar_color, wm.role, wm.joined_at
    FROM workspace_members wm JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = $1 ORDER BY wm.joined_at
  `, [ws.rows[0].id]);
  return res.json({ members: members.rows });
});

workspacesRouter.post('/:slug/invite', async (req: AuthenticatedRequest, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  const ws = await pool.query('SELECT id FROM workspaces WHERE slug = $1', [req.params['slug']]);
  if (!ws.rows.length) return res.status(404).json({ error: 'Workspace not found' });
  const user = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (!user.rows.length) return res.status(404).json({ error: `No account found for ${email}` });
  try {
    await pool.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [ws.rows[0].id, user.rows[0].id, 'member']);
    return res.status(201).json({ message: `${user.rows[0].name} added to workspace` });
  } catch {
    return res.status(409).json({ error: 'User already in workspace' });
  }
});

workspacesRouter.get('/:slug/projects', async (req: AuthenticatedRequest, res) => {
  const ws = await pool.query('SELECT id FROM workspaces WHERE slug = $1', [req.params['slug']]);
  if (!ws.rows.length) return res.status(404).json({ error: 'Workspace not found' });
  const projects = await pool.query(
    'SELECT id, name, slug, description, color, created_at FROM projects WHERE workspace_id = $1 ORDER BY created_at',
    [ws.rows[0].id],
  );
  return res.json({ projects: projects.rows });
});

workspacesRouter.post('/:slug/projects', async (req: AuthenticatedRequest, res) => {
  const ws = await pool.query('SELECT id FROM workspaces WHERE slug = $1', [req.params['slug']]);
  if (!ws.rows.length) return res.status(404).json({ error: 'Workspace not found' });
  const { name, description, color } = req.body as { name?: string; description?: string; color?: string };
  if (!name) return res.status(400).json({ error: 'name required' });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    const result = await pool.query(
      'INSERT INTO projects (workspace_id, name, slug, description, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [ws.rows[0].id, name.trim(), slug, description ?? null, color ?? '#6366f1'],
    );
    return res.status(201).json(result.rows[0]);
  } catch {
    return res.status(409).json({ error: 'Project slug already taken in this workspace' });
  }
});
