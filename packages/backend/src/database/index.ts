import { DatabaseManager } from '@zouma/common';

export { DatabaseManager };

export function initializeDatabase(): void {
  const db = DatabaseManager.getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS git_repo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      branch TEXT DEFAULT 'main',
      access_token TEXT,
      local_path TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const gitRepoColumns = db.prepare("PRAGMA table_info(git_repo)").all() as { name: string }[];
  if (!gitRepoColumns.some((c) => c.name === 'local_path')) {
    db.exec(`ALTER TABLE git_repo ADD COLUMN local_path TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      max_tokens INTEGER DEFAULT 4096,
      temperature REAL DEFAULT 0.3,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS review_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      repo_id INTEGER NOT NULL REFERENCES git_repo(id),
      llm_config_id INTEGER NOT NULL REFERENCES llm_config(id),
      target_branch TEXT,
      file_patterns TEXT,
      trigger_type TEXT NOT NULL DEFAULT 'interval',
      trigger_config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      last_triggered_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 迁移：旧的 interval_hours/daily_time 列 → trigger_config JSON
  const planColumns = db.prepare("PRAGMA table_info(review_plan)").all() as { name: string }[];
  if (planColumns.some((c) => c.name === 'interval_hours')) {
    const oldPlans = db.prepare('SELECT id, trigger_type, interval_hours, daily_time FROM review_plan').all() as {
      id: number; trigger_type: string; interval_hours: number | null; daily_time: string | null;
    }[];
    for (const p of oldPlans) {
      let config = '{}';
      if (p.trigger_type === 'interval' && p.interval_hours) {
        config = JSON.stringify({ interval_hours: p.interval_hours });
      } else if (p.trigger_type === 'daily' && p.daily_time) {
        config = JSON.stringify({ time: p.daily_time });
      }
      db.prepare('UPDATE review_plan SET trigger_config = ? WHERE id = ?').run(config, p.id);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS review_task (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      repo_id INTEGER NOT NULL REFERENCES git_repo(id),
      llm_config_id INTEGER NOT NULL REFERENCES llm_config(id),
      target_branch TEXT,
      file_patterns TEXT,
      plan_id INTEGER REFERENCES review_plan(id),
      status TEXT DEFAULT 'pending',
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const reviewTaskColumns = db.prepare("PRAGMA table_info(review_task)").all() as { name: string }[];
  if (!reviewTaskColumns.some((c) => c.name === 'plan_id')) {
    db.exec(`ALTER TABLE review_task ADD COLUMN plan_id INTEGER REFERENCES review_plan(id)`);
  }
}
