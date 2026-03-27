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

  const gitRepoColumns = db.prepare('PRAGMA table_info(git_repo)').all() as { name: string }[];
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

  const planColumns = db.prepare('PRAGMA table_info(review_plan)').all() as { name: string }[];

  if (!planColumns.some((c) => c.name === 'trigger_type')) {
    db.exec(`ALTER TABLE review_plan ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'interval'`);
  }
  if (!planColumns.some((c) => c.name === 'trigger_config')) {
    db.exec(`ALTER TABLE review_plan ADD COLUMN trigger_config TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!planColumns.some((c) => c.name === 'last_triggered_at')) {
    db.exec(`ALTER TABLE review_plan ADD COLUMN last_triggered_at TEXT`);
  }
  if (!planColumns.some((c) => c.name === 'enabled')) {
    db.exec(`ALTER TABLE review_plan ADD COLUMN enabled INTEGER DEFAULT 1`);
  }

  // 迁移：旧的 interval_hours/daily_time 列 → trigger_config JSON
  if (planColumns.some((c) => c.name === 'interval_hours')) {
    const oldPlans = db
      .prepare('SELECT id, trigger_type, interval_hours, daily_time FROM review_plan')
      .all() as {
      id: number;
      trigger_type: string;
      interval_hours: number | null;
      daily_time: string | null;
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
      repo_id INTEGER NOT NULL,
      llm_config_id INTEGER NOT NULL,
      target_branch TEXT,
      file_patterns TEXT,
      plan_id INTEGER,
      plan_name TEXT,
      repo_name TEXT,
      llm_config_name TEXT,
      status TEXT DEFAULT 'pending',
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const reviewTaskColumns = db.prepare('PRAGMA table_info(review_task)').all() as {
    name: string;
  }[];
  if (!reviewTaskColumns.some((c) => c.name === 'plan_id')) {
    db.exec(`ALTER TABLE review_task ADD COLUMN plan_id INTEGER`);
  }
  if (!reviewTaskColumns.some((c) => c.name === 'plan_name')) {
    db.exec(`ALTER TABLE review_task ADD COLUMN plan_name TEXT`);
  }
  if (!reviewTaskColumns.some((c) => c.name === 'repo_name')) {
    db.exec(`ALTER TABLE review_task ADD COLUMN repo_name TEXT`);
    db.exec(
      `UPDATE review_task SET repo_name = (SELECT name FROM git_repo WHERE git_repo.id = review_task.repo_id)`
    );
  }
  if (!reviewTaskColumns.some((c) => c.name === 'llm_config_name')) {
    db.exec(`ALTER TABLE review_task ADD COLUMN llm_config_name TEXT`);
    db.exec(
      `UPDATE review_task SET llm_config_name = (SELECT name FROM llm_config WHERE llm_config.id = review_task.llm_config_id)`
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS review_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES review_task(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_review_log_task_id ON review_log(task_id)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS review_progress (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     INTEGER NOT NULL REFERENCES review_task(id) ON DELETE CASCADE,
      step_type   TEXT NOT NULL CHECK(step_type IN ('task_start','task_end','phase_start','phase_end','batch_start','batch_end','agent_start','agent_end','tool_call')),
      phase       TEXT,
      batch_index INTEGER,
      batch_total INTEGER,
      agent_name  TEXT,
      tool_name   TEXT,
      status      TEXT CHECK(status IS NULL OR status IN ('running','completed','failed')),
      strategy    TEXT,
      mode        TEXT,
      total_files INTEGER,
      file_count  INTEGER,
      issue_count INTEGER,
      duration_ms INTEGER,
      tokens_used INTEGER,
      cost_usd    REAL,
      detail      TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_review_progress_task_id ON review_progress(task_id)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS review_issues (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     INTEGER NOT NULL REFERENCES review_task(id) ON DELETE CASCADE,
      severity    TEXT NOT NULL CHECK(severity IN ('error','warning','info')),
      category    TEXT NOT NULL CHECK(category IN ('style','logic','robustness')),
      file        TEXT NOT NULL,
      line        INTEGER,
      description TEXT NOT NULL,
      suggestion  TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_review_issues_task_id ON review_issues(task_id)
  `);
}
