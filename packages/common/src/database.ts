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

  static close(): void {
    if (DatabaseManager.instance) {
      DatabaseManager.instance.close();
      DatabaseManager.instance = null;
    }
  }
}
