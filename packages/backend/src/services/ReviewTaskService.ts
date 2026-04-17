import type {
  ReviewTask,
  ReviewTaskWithRelations,
  CreateReviewTaskDTO,
  UpdateReviewTaskDTO,
  PaginationParams,
  ReviewLog,
  ReviewProgress,
  TaskProgressSummary,
  PhaseProgressItem,
  BatchProgressItem,
  AgentProgressItem,
  ToolCallItem,
  ProgressPhase,
  ProgressStatus,
  ReviewIssueRecord,
} from '@zouma/common';
import { DatabaseManager } from '../database/index.js';
import { GitRepoService } from './GitRepoService.js';

export class ReviewTaskService {
  static findAll(params?: PaginationParams & { planId?: number }): { items: ReviewTaskWithRelations[]; total: number } {
    const db = DatabaseManager.getDatabase();
    
    let baseSql = 'FROM review_task';
    const queryParams: unknown[] = [];
    
    if (params?.planId) {
      baseSql += ' WHERE plan_id = ?';
      queryParams.push(params.planId);
    }

    const totalRes = db.prepare(`SELECT COUNT(*) as count ${baseSql}`).get(...queryParams) as { count: number };
    const total = totalRes.count;

    if (params && params.page && params.pageSize) {
      const offset = (params.page - 1) * params.pageSize;
      const items = db
        .prepare(`SELECT * ${baseSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...queryParams, params.pageSize, offset) as ReviewTaskWithRelations[];
      return { items, total };
    }

    const items = db
      .prepare(`SELECT * ${baseSql} ORDER BY id DESC`)
      .all(...queryParams) as ReviewTaskWithRelations[];
    return { items, total };
  }

  static findById(id: number): ReviewTaskWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    return db.prepare('SELECT * FROM review_task WHERE id = ?').get(id) as
      | ReviewTaskWithRelations
      | undefined;
  }

  static create(
    dto: CreateReviewTaskDTO,
    snapshot?: { planId?: number; planName?: string }
  ): ReviewTask {
    const db = DatabaseManager.getDatabase();
    const repo = GitRepoService.assertRepoReadyForReview(dto.repo_id);
    const llmRow = db.prepare('SELECT name FROM llm_config WHERE id = ?').get(dto.llm_config_id) as
      | { name: string }
      | undefined;

    const result = db
      .prepare(
        `INSERT INTO review_task (name, repo_id, llm_config_id, target_branch, file_patterns, file_filter_id, plan_id, plan_name, repo_name, llm_config_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dto.name,
        dto.repo_id,
        dto.llm_config_id,
        dto.target_branch ?? null,
        dto.file_patterns ?? null,
        dto.file_filter_id ?? null,
        snapshot?.planId ?? null,
        snapshot?.planName ?? null,
        repo.name,
        llmRow?.name ?? null
      );
    return ReviewTaskService.findById(Number(result.lastInsertRowid))!;
  }

  static update(id: number, dto: UpdateReviewTaskDTO): ReviewTaskWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = db.prepare('SELECT * FROM review_task WHERE id = ?').get(id) as
      | ReviewTask
      | undefined;
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

  static findLogsByTaskId(taskId: number): ReviewLog[] {
    const db = DatabaseManager.getDatabase();
    return db
      .prepare('SELECT * FROM review_log WHERE task_id = ? ORDER BY id ASC')
      .all(taskId) as ReviewLog[];
  }

  static execute(id: number): ReviewTaskWithRelations | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = db.prepare('SELECT * FROM review_task WHERE id = ?').get(id) as
      | ReviewTask
      | undefined;
    if (!existing) return undefined;
    GitRepoService.assertRepoReadyForReview(existing.repo_id);

    db.prepare(
      `UPDATE review_task SET status = 'pending', result = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(id);

    return ReviewTaskService.findById(id);
  }

  static findIssuesByTaskId(
    taskId: number,
    filters?: { severity?: string; category?: string }
  ): ReviewIssueRecord[] {
    const db = DatabaseManager.getDatabase();
    const conditions = ['task_id = ?'];
    const params: unknown[] = [taskId];

    if (filters?.severity) {
      conditions.push('severity = ?');
      params.push(filters.severity);
    }
    if (filters?.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }

    return db
      .prepare(`SELECT * FROM review_issues WHERE ${conditions.join(' AND ')} ORDER BY id ASC`)
      .all(...params) as ReviewIssueRecord[];
  }

  static findProgressByTaskId(taskId: number): TaskProgressSummary | null {
    const db = DatabaseManager.getDatabase();
    const task = db.prepare('SELECT * FROM review_task WHERE id = ?').get(taskId) as
      | ReviewTask
      | undefined;
    if (!task) return null;

    const rows = db
      .prepare('SELECT * FROM review_progress WHERE task_id = ? ORDER BY id ASC')
      .all(taskId) as ReviewProgress[];

    return aggregateProgress(taskId, task, rows);
  }
}

type PairEntry = { startRow?: ReviewProgress; endRow?: ReviewProgress };

interface ClassifiedRows {
  taskStartRow?: ReviewProgress;
  taskEndRow?: ReviewProgress;
  phaseMap: Map<string, PairEntry>;
  batchMap: Map<string, PairEntry>;
  agentRows: ReviewProgress[];
  toolRows: ReviewProgress[];
}

function classifyRows(rows: ReviewProgress[]): ClassifiedRows {
  const phaseMap = new Map<string, PairEntry>();
  const batchMap = new Map<string, PairEntry>();
  const agentRows: ReviewProgress[] = [];
  const toolRows: ReviewProgress[] = [];

  for (const row of rows) {
    switch (row.step_type) {
      case 'phase_start':
      case 'phase_end': {
        const phase = row.phase ?? '';
        if (!phaseMap.has(phase)) phaseMap.set(phase, {});
        const entry = phaseMap.get(phase)!;
        if (row.step_type === 'phase_start') entry.startRow = row;
        else entry.endRow = row;
        break;
      }
      case 'batch_start':
      case 'batch_end': {
        const key = `${row.phase}:${row.batch_index}`;
        if (!batchMap.has(key)) batchMap.set(key, {});
        const entry = batchMap.get(key)!;
        if (row.step_type === 'batch_start') entry.startRow = row;
        else entry.endRow = row;
        break;
      }
      case 'agent_start':
      case 'agent_end':
        agentRows.push(row);
        break;
      case 'tool_call':
        toolRows.push(row);
        break;
    }
  }

  return {
    taskStartRow: rows.find((r) => r.step_type === 'task_start'),
    taskEndRow: rows.find((r) => r.step_type === 'task_end'),
    phaseMap,
    batchMap,
    agentRows,
    toolRows,
  };
}

function resolveStatus(row: ReviewProgress | undefined, fallback: ProgressStatus): ProgressStatus {
  return row ? ((row.status as ProgressStatus) ?? fallback) : 'running';
}

function toToolCallItem(t: ReviewProgress): ToolCallItem {
  return {
    toolName: t.tool_name ?? '',
    agentName: t.agent_name,
    detail: t.detail,
    createdAt: t.created_at,
  };
}

function parseDetail(row: ReviewProgress | undefined): Record<string, unknown> | null {
  if (!row?.detail) return null;
  try {
    return JSON.parse(row.detail) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildPhases(
  phaseMap: Map<string, PairEntry>,
  batchMap: Map<string, PairEntry>
): PhaseProgressItem[] {
  const phases: PhaseProgressItem[] = [];
  for (const [phase, { startRow, endRow }] of phaseMap) {
    const phaseBatches = [...batchMap.values()].filter(
      (b) => b.startRow?.phase === phase || b.endRow?.phase === phase
    );
    phases.push({
      phase: phase as ProgressPhase,
      status: resolveStatus(endRow, 'completed'),
      startedAt: startRow?.created_at ?? '',
      endedAt: endRow?.created_at ?? null,
      durationMs: endRow?.duration_ms ?? null,
      batchCount: phaseBatches.length,
      completedBatches: phaseBatches.filter((b) => b.endRow?.status === 'completed').length,
      issueCount: endRow?.issue_count ?? 0,
      detail: parseDetail(endRow),
    });
  }
  return phases;
}

function buildBatchAgents(
  agentRows: ReviewProgress[],
  toolRows: ReviewProgress[],
  phase: ProgressPhase,
  batchIndex: number,
  batchDurationMs?: number | null
): AgentProgressItem[] {
  const agentPairs = buildAgentPairs(agentRows, phase, batchIndex);
  const agents: AgentProgressItem[] = agentPairs.map((pair) => ({
    agentName: pair.name,
    status: resolveStatus(pair.endRow, 'completed'),
    durationMs: pair.endRow?.duration_ms ?? null,
    tokensUsed: pair.endRow?.tokens_used ?? 0,
    toolCalls: toolRows
      .filter(
        (t) => t.phase === phase && t.batch_index === batchIndex && t.agent_name === pair.name
      )
      .map(toToolCallItem),
  }));

  const orphanTools = toolRows
    .filter((t) => t.phase === phase && t.batch_index === batchIndex && !t.agent_name)
    .map(toToolCallItem);

  if (orphanTools.length > 0) {
    agents.unshift({
      agentName: 'orchestrator',
      status: 'completed',
      durationMs: batchDurationMs ?? null,
      tokensUsed: 0,
      toolCalls: orphanTools,
    });
  }

  return agents;
}

function buildBatches(
  batchMap: Map<string, PairEntry>,
  agentRows: ReviewProgress[],
  toolRows: ReviewProgress[]
): BatchProgressItem[] {
  const batches: BatchProgressItem[] = [];
  for (const [, { startRow, endRow }] of batchMap) {
    const ref = endRow ?? startRow;
    if (!ref) continue;
    const phase = ref.phase as ProgressPhase;
    const batchIndex = ref.batch_index ?? 0;

    const batchDurationMs = endRow?.duration_ms ?? null;
    const startDetail = parseDetail(startRow);
    const fileList = Array.isArray(startDetail?.files) ? (startDetail.files as string[]) : [];
    batches.push({
      phase,
      batchIndex,
      batchTotal: startRow?.batch_total ?? endRow?.batch_total ?? 0,
      status: resolveStatus(endRow, 'completed'),
      fileCount: startRow?.file_count ?? 0,
      fileList,
      issueCount: endRow?.issue_count ?? 0,
      durationMs: batchDurationMs,
      tokensUsed: (endRow?.tokens_used ?? 0) || (startRow?.tokens_used ?? 0),
      costUsd: (endRow?.cost_usd ?? 0) || (startRow?.cost_usd ?? 0),
      startedAt: startRow?.created_at ?? '',
      agents: buildBatchAgents(agentRows, toolRows, phase, batchIndex, batchDurationMs),
    });
  }
  return batches;
}

function countIssuesFromTable(taskId: number): number {
  const db = DatabaseManager.getDatabase();
  const row = db
    .prepare('SELECT COUNT(*) as count FROM review_issues WHERE task_id = ?')
    .get(taskId) as { count: number };
  return row.count;
}

function aggregateProgress(
  taskId: number,
  task: ReviewTask,
  rows: ReviewProgress[]
): TaskProgressSummary {
  const { taskStartRow, taskEndRow, phaseMap, batchMap, agentRows, toolRows } = classifyRows(rows);
  const phases = buildPhases(phaseMap, batchMap);
  const batches = buildBatches(batchMap, agentRows, toolRows);

  const completedBatches = batches.filter((b) => b.status === 'completed').length;
  const failedBatches = batches.filter((b) => b.status === 'failed').length;
  const lastPhaseRunning = phases.find((p) => p.status === 'running');

  let totalFiles = taskStartRow?.total_files ?? 0;
  const collectPhase = phaseMap.get('collect_files');
  if (totalFiles === 0) {
    totalFiles = collectPhase?.endRow?.file_count ?? 0;
  }

  let fileList: string[] = [];
  if (collectPhase?.endRow?.detail) {
    try {
      const parsed = JSON.parse(collectPhase.endRow.detail);
      if (Array.isArray(parsed.files)) fileList = parsed.files;
    } catch {
      /* ignore */
    }
  }

  const totalIssues = countIssuesFromTable(taskId);

  return {
    taskId,
    strategy: taskStartRow?.strategy ?? null,
    mode: taskStartRow?.mode ?? null,
    totalFiles,
    fileList,
    totalBatches: batches.length,
    completedBatches,
    failedBatches,
    currentPhase: lastPhaseRunning?.phase ?? null,
    overallStatus: task.status,
    startedAt: taskStartRow?.created_at ?? null,
    endedAt: taskEndRow?.created_at ?? null,
    totalDurationMs: taskEndRow?.duration_ms ?? null,
    totalIssues,
    totalTokens: taskEndRow?.tokens_used ?? batches.reduce((s, b) => s + b.tokensUsed, 0),
    totalCostUsd: taskEndRow?.cost_usd ?? batches.reduce((s, b) => s + b.costUsd, 0),
    phases,
    batches,
  };
}

function buildAgentPairs(
  agentRows: ReviewProgress[],
  phase: ProgressPhase,
  batchIndex: number
): Array<{ name: string; startRow?: ReviewProgress; endRow?: ReviewProgress }> {
  const map = new Map<
    string,
    { name: string; startRow?: ReviewProgress; endRow?: ReviewProgress }
  >();
  for (const row of agentRows) {
    if (row.phase !== phase || row.batch_index !== batchIndex) continue;
    const name = row.agent_name ?? '';
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name });
    const entry = map.get(name)!;
    if (row.step_type === 'agent_start') entry.startRow = row;
    else if (row.step_type === 'agent_end') entry.endRow = row;
  }
  return [...map.values()];
}
