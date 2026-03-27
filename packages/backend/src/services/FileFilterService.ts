import type {
  FileFilter,
  CreateFileFilterDTO,
  UpdateFileFilterDTO,
  PaginationParams,
} from '@zouma/common';
import { DatabaseManager } from '../database/index.js';

export class FileFilterService {
  static findAll(params?: PaginationParams): { items: FileFilter[]; total: number } {
    const db = DatabaseManager.getDatabase();
    const total = (
      db.prepare('SELECT COUNT(*) as count FROM file_filter').get() as { count: number }
    ).count;

    if (params) {
      const offset = (params.page - 1) * params.pageSize;
      const items = db
        .prepare('SELECT * FROM file_filter ORDER BY is_builtin DESC, id ASC LIMIT ? OFFSET ?')
        .all(params.pageSize, offset) as FileFilter[];
      return { items, total };
    }

    const items = db
      .prepare('SELECT * FROM file_filter ORDER BY is_builtin DESC, id ASC')
      .all() as FileFilter[];
    return { items, total };
  }

  static findById(id: number): FileFilter | undefined {
    const db = DatabaseManager.getDatabase();
    return db.prepare('SELECT * FROM file_filter WHERE id = ?').get(id) as FileFilter | undefined;
  }

  static create(dto: CreateFileFilterDTO): FileFilter {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        `INSERT INTO file_filter (name, include_extensions, exclude_patterns, description)
         VALUES (?, ?, ?, ?)`
      )
      .run(dto.name, dto.include_extensions, dto.exclude_patterns ?? null, dto.description ?? null);
    return FileFilterService.findById(Number(result.lastInsertRowid))!;
  }

  static update(id: number, dto: UpdateFileFilterDTO): FileFilter | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = FileFilterService.findById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE file_filter SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return FileFilterService.findById(id);
  }

  static delete(id: number): boolean {
    const db = DatabaseManager.getDatabase();
    const existing = FileFilterService.findById(id);
    if (!existing) return false;
    if (existing.is_builtin) {
      throw new Error('内置筛选模式不可删除');
    }
    const result = db.prepare('DELETE FROM file_filter WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
