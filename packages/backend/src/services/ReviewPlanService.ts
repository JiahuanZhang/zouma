import type {
  ReviewPlan,
  ReviewPlanWithRelations,
  CreateReviewPlanDTO,
  UpdateReviewPlanDTO,
  PaginationParams,
  TriggerConfig,
} from '@zouma/common';
import { DatabaseManager } from '../database/index.js';
import { ReviewTaskService } from './ReviewTaskService.js';

const SELECT_WITH_RELATIONS = `
  SELECT
    p.*,
    r.name as repo_name,
    l.name as llm_config_name
  FROM review_plan p
  LEFT JOIN git_repo r ON p.repo_id = r.id
  LEFT JOIN llm_config l ON p.llm_config_id = l.id
`;

function parseRow<T extends { trigger_config: TriggerConfig | string }>(row: T): T {
  if (typeof row.trigger_config === 'string') {
    row.trigger_config = JSON.parse(row.trigger_config) as TriggerConfig;
  }
  return row;
}

function parseRows<T extends { trigger_config: TriggerConfig | string }>(rows: T[]): T[] {
  return rows.map(parseRow);
}

export class ReviewPlanService {
  static findAll(params?: PaginationParams): { items: ReviewPlanWithRelations[]; total: number } {
    const db = DatabaseManager.getDatabase();
    const total = (
      db.prepare('SELECT COUNT(*) as count FROM review_plan').get() as { count: number }
    ).count;

    if (params) {
      const offset = (params.page - 1) * params.pageSize;
      const items = parseRows(
        db.prepare(`${SELECT_WITH_RELATIONS} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
          .all(params.pageSize, offset) as ReviewPlanWithRelations[]
      );
      return { items, total };
    }

    const items = parseRows(
      db.prepare(`${SELECT_WITH_RELATIONS} ORDER BY p.id DESC`)
        .all() as ReviewPlanWithRelations[]
    );
    return { items, total };
  }

  static findById(id: number): ReviewPlanWithRelations | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(`${SELECT_WITH_RELATIONS} WHERE p.id = ?`)
      .get(id) as ReviewPlanWithRelations | undefined;
    return row ? parseRow(row) : undefined;
  }

  static findAllEnabled(): ReviewPlan[] {
    const rows = DatabaseManager.getDatabase()
      .prepare('SELECT * FROM review_plan WHERE enabled = 1')
      .all() as ReviewPlan[];
    return parseRows(rows);
  }

  static create(dto: CreateReviewPlanDTO): ReviewPlanWithRelations {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        `INSERT INTO review_plan (name, repo_id, llm_config_id, target_branch, file_patterns, trigger_type, trigger_config, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dto.name,
        dto.repo_id,
        dto.llm_config_id,
        dto.target_branch ?? null,
        dto.file_patterns ?? null,
        dto.trigger_type,
        JSON.stringify(dto.trigger_config),
        dto.enabled ?? 1
      );
    return ReviewPlanService.findById(Number(result.lastInsertRowid))!;
  }

  static update(id: number, dto: UpdateReviewPlanDTO): ReviewPlanWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = db
      .prepare('SELECT * FROM review_plan WHERE id = ?')
      .get(id) as ReviewPlan | undefined;
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'trigger_config' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return ReviewPlanService.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE review_plan SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return ReviewPlanService.findById(id);
  }

  static delete(id: number): boolean {
    const db = DatabaseManager.getDatabase();
    const result = db.prepare('DELETE FROM review_plan WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static trigger(id: number): { plan: ReviewPlanWithRelations; taskId: number } | undefined {
    const db = DatabaseManager.getDatabase();
    const raw = db.prepare('SELECT * FROM review_plan WHERE id = ?').get(id) as ReviewPlan | undefined;
    if (!raw) return undefined;
    const plan = parseRow(raw);

    const task = ReviewTaskService.create({
      name: `[计划] ${plan.name} - ${new Date().toLocaleString('zh-CN')}`,
      repo_id: plan.repo_id,
      llm_config_id: plan.llm_config_id,
      target_branch: plan.target_branch ?? undefined,
      file_patterns: plan.file_patterns ?? undefined,
    }, { planId: plan.id, planName: plan.name });

    db.prepare(
      `UPDATE review_plan SET last_triggered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(id);

    return { plan: ReviewPlanService.findById(id)!, taskId: (task as any).id };
  }
}
