import { Router, type NextFunction, type Response } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getProjectCounts, setProjectCounts, invalidateProjectCounts } from '../cache.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { WebSocketServer, WebSocket } from 'ws';

// Express 4 doesn't auto-catch async errors — wrap every handler
function wrap(fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
}

export function createTasksRouter(wss: WebSocketServer, rooms: Map<string, Set<WebSocket>>): Router {
  const router = Router();
  router.use(requireAuth);

  function broadcast(projectId: string, msg: unknown): void {
    const clients = rooms.get(projectId);
    if (!clients) return;
    const data = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(data);
    }
  }

  // GET /api/projects/:id/tasks
  router.get('/projects/:id/tasks', wrap(async (req: AuthenticatedRequest, res) => {
    const { status, priority, assignee } = req.query as Record<string, string | undefined>;
    let query = `
      SELECT t.*, u.name as assignee_name, u.avatar_color as assignee_color
      FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = $1
    `;
    const params: unknown[] = [req.params['id']];
    if (status) { params.push(status); query += ` AND t.status = $${params.length}`; }
    if (priority) { params.push(priority); query += ` AND t.priority = $${params.length}`; }
    if (assignee) { params.push(assignee); query += ` AND t.assignee_id = $${params.length}`; }
    query += ' ORDER BY t.position, t.created_at';

    const result = await pool.query(query, params);

    // Get counts from Redis cache or DB
    let counts = await getProjectCounts(req.params['id']!);
    if (!counts) {
      const countResult = await pool.query(
        'SELECT status, COUNT(*) as count FROM tasks WHERE project_id = $1 GROUP BY status',
        [req.params['id']],
      );
      counts = {};
      for (const row of countResult.rows as { status: string; count: string }[]) {
        counts[row.status] = parseInt(row.count, 10);
      }
      await setProjectCounts(req.params['id']!, counts);
    }

    return res.json({ tasks: result.rows, counts });
  }));

  // POST /api/projects/:id/tasks
  router.post("/projects/:id/tasks", wrap(async (req: AuthenticatedRequest, res) => {
    const { title, description, priority, assignee_id, due_date } = req.body as {
      title?: string; description?: string; priority?: string; assignee_id?: string; due_date?: string;
    };
    if (!title?.trim()) return res.status(400).json({ error: 'title required' });

    // Validate due_date is not in the past
    if (due_date) {
      const d = new Date(due_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (d < today) return res.status(400).json({ error: 'due_date cannot be in the past' });
    }

    // Validate assignee is in the workspace
    if (assignee_id) {
      const project = await pool.query('SELECT workspace_id FROM projects WHERE id = $1', [req.params['id']]);
      if (!project.rows.length) return res.status(404).json({ error: 'Project not found' });
      const member = await pool.query('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [project.rows[0].workspace_id, assignee_id]);
      if (!member.rows.length) return res.status(403).json({ error: 'Assignee is not a member of this workspace' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (project_id, title, description, priority, assignee_id, due_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params['id'], title.trim(), description ?? null, priority ?? 'medium', assignee_id ?? null, due_date ?? null],
    );
    await invalidateProjectCounts(req.params['id']!);
    broadcast(req.params['id']!, { type: 'task.created', task: result.rows[0] });
    return res.status(201).json(result.rows[0]);
  }));

  // PATCH /api/tasks/:id
  router.patch('/tasks/:id', wrap(async (req: AuthenticatedRequest, res) => {
    const { title, description, status, priority, assignee_id, due_date } = req.body as {
      title?: string; description?: string; status?: string; priority?: string; assignee_id?: string | null; due_date?: string | null;
    };

    const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params['id']]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Task not found' });
    const task = existing.rows[0] as { id: string; project_id: string; [key: string]: unknown };

    // Validate assignee is in workspace
    if (assignee_id) {
      const project = await pool.query('SELECT workspace_id FROM projects WHERE id = $1', [task.project_id]);
      const member = await pool.query('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [project.rows[0].workspace_id, assignee_id]);
      if (!member.rows.length) return res.status(403).json({ error: 'Assignee is not a member of this workspace' });
    }

    const result = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assignee_id = CASE WHEN $5::text = '__clear__' THEN NULL ELSE COALESCE($5::uuid, assignee_id) END,
        due_date = CASE WHEN $6::text = '__clear__' THEN NULL ELSE COALESCE($6::date, due_date) END,
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title ?? null, description ?? null, status ?? null, priority ?? null,
       assignee_id === null ? '__clear__' : (assignee_id ?? null),
       due_date === null ? '__clear__' : (due_date ?? null),
       req.params['id']],
    );

    await invalidateProjectCounts(task.project_id);
    broadcast(task.project_id, { type: 'task.updated', task: result.rows[0] });
    return res.json(result.rows[0]);
  }));

  // DELETE /api/tasks/:id
  router.delete('/tasks/:id', wrap(async (req: AuthenticatedRequest, res) => {
    const existing = await pool.query('SELECT project_id FROM tasks WHERE id = $1', [req.params['id']]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Task not found' });
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params['id']]);
    await invalidateProjectCounts(existing.rows[0].project_id);
    broadcast(existing.rows[0].project_id, { type: 'task.deleted', taskId: req.params['id'] });
    return res.json({ ok: true });
  }));

  // GET /api/tasks/:id/comments
  router.get('/tasks/:id/comments', wrap(async (req: AuthenticatedRequest, res) => {
    const result = await pool.query(`
      SELECT c.*, u.name as user_name, u.avatar_color
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.task_id = $1 ORDER BY c.created_at
    `, [req.params['id']]);
    return res.json({ comments: result.rows });
  }));

  // POST /api/tasks/:id/comments
  router.post('/tasks/:id/comments', wrap(async (req: AuthenticatedRequest, res) => {
    const { body } = req.body as { body?: string };
    if (!body?.trim()) return res.status(400).json({ error: 'body required' });
    const task = await pool.query('SELECT project_id FROM tasks WHERE id = $1', [req.params['id']]);
    if (!task.rows.length) return res.status(404).json({ error: 'Task not found' });
    const result = await pool.query(
      'INSERT INTO comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *',
      [req.params['id'], req.user!.id, body.trim()],
    );
    const comment = { ...result.rows[0], user_name: req.user!.name };
    broadcast(task.rows[0].project_id, { type: 'comment.added', comment, taskId: req.params['id'] });
    return res.status(201).json(comment);
  }));

  // GET /api/projects/:id/activity
  router.get('/projects/:id/activity', wrap(async (req: AuthenticatedRequest, res) => {
    const project = await pool.query('SELECT workspace_id FROM projects WHERE id = $1', [req.params['id']]);
    if (!project.rows.length) return res.status(404).json({ error: 'Project not found' });
    const result = await pool.query(`
      SELECT al.*, u.name as user_name, u.avatar_color
      FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
      WHERE al.workspace_id = $1
      ORDER BY al.created_at DESC LIMIT 50
    `, [project.rows[0].workspace_id]);
    return res.json({ activity: result.rows });
  }));

  return router;
}
