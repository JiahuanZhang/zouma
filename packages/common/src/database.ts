import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findMonorepoRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      if (pkg.workspaces) return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export class DatabaseManager {
  private static instance: Database.Database | null = null;

  static getDatabase(): Database.Database {
    if (!DatabaseManager.instance) {
      const defaultPath = path.join(findMonorepoRoot(), 'data', 'zouma.sqlite');
      const dbPath = process.env.DB_PATH || defaultPath;
      const resolvedPath = path.resolve(dbPath);
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      DatabaseManager.instance = new Database(resolvedPath);
      DatabaseManager.instance.pragma('journal_mode = WAL');
      DatabaseManager.instance.pragma('foreign_keys = ON');
    }
    return DatabaseManager.instance;
  }

  static close(): void {
    if (DatabaseManager.instance) {
      DatabaseManager.instance.close();
      DatabaseManager.instance = null;
    }
  }
}
