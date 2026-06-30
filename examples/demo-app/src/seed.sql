-- ─── Schema ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Seed (idempotent) ────────────────────────────────────────────────────────
-- Users (password for all: "password123")
-- bcrypt hash of "password123" with 10 rounds
INSERT INTO users (id, name, email, password_hash, avatar_color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alice Chen',   'alice@acme.com',  '$2a$10$Vr/w3x1upaa.YE7Wr0cWyO5Gi3G4zx9az.yd.V3Gd4quvM6nO/V7y', '#3b82f6'),
  ('00000000-0000-0000-0000-000000000002', 'Bob Kim',      'bob@acme.com',    '$2a$10$Vr/w3x1upaa.YE7Wr0cWyO5Gi3G4zx9az.yd.V3Gd4quvM6nO/V7y', '#10b981'),
  ('00000000-0000-0000-0000-000000000003', 'Carol Davis',  'carol@acme.com',  '$2a$10$Vr/w3x1upaa.YE7Wr0cWyO5Gi3G4zx9az.yd.V3Gd4quvM6nO/V7y', '#f59e0b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspaces (id, name, slug, owner_id) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Acme Corp', 'acme', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'member'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, workspace_id, name, slug, description, color) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Website Redesign', 'web', 'Redesign the marketing website for Q3 launch', '#6366f1'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010', 'Mobile App', 'mobile', 'iOS and Android app v2.0', '#ec4899')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, due_date, position) VALUES
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', 'Design new homepage hero', 'Create wireframes and high-fidelity mockups for the homepage hero section', 'done', 'high', '00000000-0000-0000-0000-000000000001', '2025-06-15', 0),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000020', 'Implement responsive navigation', 'Build the new nav component with mobile hamburger menu', 'in_progress', 'high', '00000000-0000-0000-0000-000000000002', '2025-07-01', 0),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000020', 'Write copy for features section', NULL, 'todo', 'medium', '00000000-0000-0000-0000-000000000003', '2025-07-10', 0),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000020', 'Set up analytics tracking', 'Integrate Plausible analytics on all pages', 'in_review', 'medium', '00000000-0000-0000-0000-000000000001', '2025-07-05', 0),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000020', 'Performance audit', 'Lighthouse audit, fix Core Web Vitals. Target LCP < 2.5s', 'todo', 'urgent', NULL, '2025-07-15', 1),
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000020', 'SEO meta tags', 'Add proper meta description, OG tags for all pages', 'todo', 'low', '00000000-0000-0000-0000-000000000002', '2025-07-20', 2),
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000021', 'Auth flow redesign', 'New onboarding flow: email → verify → profile setup', 'in_progress', 'urgent', '00000000-0000-0000-0000-000000000001', '2025-06-30', 0),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000021', 'Push notifications', 'Integrate FCM for iOS and Android', 'todo', 'high', '00000000-0000-0000-0000-000000000002', '2025-07-08', 0),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000021', 'Offline mode', 'Cache last 100 items for offline use with service worker', 'todo', 'medium', NULL, NULL, 1),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000021', 'App Store submission prep', 'Screenshots, descriptions, privacy policy update', 'in_review', 'high', '00000000-0000-0000-0000-000000000003', '2025-07-12', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO comments (task_id, user_id, body) VALUES
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'Figma link: https://figma.com/... — nav should match the DS tokens we agreed on.'),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000002', 'Working on it. Should be done by Thursday.'),
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000003', 'Tested the new onboarding on Android — looks good. One issue: back button on step 2 goes to login instead of step 1.'),
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', 'Good catch, fixing now.')
ON CONFLICT DO NOTHING;
