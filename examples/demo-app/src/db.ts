import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const pool = new Pool({
  host: process.env['PGHOST'] ?? 'localhost',
  port: parseInt(process.env['PGPORT'] ?? '5433', 10),
  database: process.env['PGDATABASE'] ?? 'observer_demo',
  user: process.env['PGUSER'] ?? 'demo',
  password: process.env['PGPASSWORD'] ?? 'demo123',
  max: 10,
});

export async function initDb(): Promise<void> {
  const seedPath = join(dirname(fileURLToPath(import.meta.url)), 'seed.sql');
  const sql = await readFile(seedPath, 'utf-8');
  await pool.query(sql);
  console.log('[db] schema ready');
}
