import type {
  ReviewTask,
  ReviewTaskWithRelations,
  CreateReviewTaskDTO,
  UpdateReviewTaskDTO,
  PaginationParams,
} from '@zouma/common';
import { DatabaseManager } from '../database/index.js';

const SELECT_WITH_RELATIONS = `
  SELECT
    t.*,
    r.name as repo_name,
    l.name as llm_config_name
  FROM review_task t
  LEFT JOIN git_repo r ON t.repo_id = r.id
  LEFT JOIN llm_config l ON t.llm_config_id = l.id
`;

export class ReviewTaskService {
  static findAll(params?: PaginationParams): { items: ReviewTaskWithRelations[]; total: number } {
    const db = DatabaseManager.getDatabase();
    const total = (
      db.prepare('SELECT COUNT(*) as count FROM review_task').get() as { count: number }
    ).count;

    if (params) {
      const offset = (params.page - 1) * params.pageSize;
      const items = db
        .prepare(`${SELECT_WITH_RELATIONS} ORDER BY t.id DESC LIMIT ? OFFSET ?`)
        .all(params.pageSize, offset) as ReviewTaskWithRelations[];
      return { items, total };
    }

    const items = db
      .prepare(`${SELECT_WITH_RELATIONS} ORDER BY t.id DESC`)
      .all() as ReviewTaskWithRelations[];
    return { items, total };
  }

  static findById(id: number): ReviewTaskWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    return db
      .prepare(`${SELECT_WITH_RELATIONS} WHERE t.id = ?`)
      .get(id) as ReviewTaskWithRelations | undefined;
  }

  static create(dto: CreateReviewTaskDTO): ReviewTask {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        `INSERT INTO review_task (name, repo_id, llm_config_id, target_branch, file_patterns)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        dto.name,
        dto.repo_id,
        dto.llm_config_id,
        dto.target_branch ?? null,
        dto.file_patterns ?? null
      );
    return ReviewTaskService.findById(Number(result.lastInsertRowid))!;
  }

  static update(id: number, dto: UpdateReviewTaskDTO): ReviewTaskWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = db
      .prepare('SELECT * FROM review_task WHERE id = ?')
      .get(id) as ReviewTask | undefined;
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return ReviewTaskService.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE review_task SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return ReviewTaskService.findById(id);
  }

  static delete(id: number): boolean {
    const db = DatabaseManager.getDatabase();
    const result = db.prepare('DELETE FROM review_task WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static execute(id: number): ReviewTaskWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = db
      .prepare('SELECT * FROM review_task WHERE id = ?')
      .get(id) as ReviewTask | undefined;
    if (!existing) return undefined;

    db.prepare(
      `UPDATE review_task SET status = 'pending', result = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(id);

    return ReviewTaskService.findById(id);
  }
}
