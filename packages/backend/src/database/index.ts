import Database from 'better-sqlite3';
import path from 'path';

export class DatabaseManager {
  private static instance: Database.Database | null = null;

  static getDatabase(): Database.Database {
    if (!DatabaseManager.instance) {
      const dbPath = process.env.DB_PATH || './data/zouma.sqlite';
      const resolvedPath = path.resolve(dbPath);
      DatabaseManager.instance = new Database(resolvedPath);
      DatabaseManager.instance.pragma('journal_mode = WAL');
      DatabaseManager.instance.pragma('foreign_keys = ON');
    }
    return DatabaseManager.instance;
  }

  static initialize(): void {
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
    if (!gitRepoColumns.some(c => c.name === 'local_path')) {
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
      CREATE TABLE IF NOT EXISTS review_task (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        repo_id INTEGER NOT NULL REFERENCES git_repo(id),
        llm_config_id INTEGER NOT NULL REFERENCES llm_config(id),
        target_branch TEXT,
        file_patterns TEXT,
        status TEXT DEFAULT 'pending',
        result TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  static close(): void {
    if (DatabaseManager.instance) {
      DatabaseManager.instance.close();
      DatabaseManager.instance = null;
    }
  }
}
