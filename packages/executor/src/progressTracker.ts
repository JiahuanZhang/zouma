import { DatabaseManager } from '@zouma/common';
import type { ProgressPhase, ProgressStatus } from '@zouma/common';

export class ProgressTracker {
  private db = DatabaseManager.getDatabase();
  private insertStmt;
  private currentAgentName: string | null = null;
  private agentStartTime: number | null = null;
  private currentAgentTokens: number = 0;
  private currentPhase: ProgressPhase | null = null;
  private currentBatchIndex: number | null = null;

  constructor(private taskId: number) {
    this.insertStmt = this.db.prepare(
      `INSERT INTO review_progress
        (task_id, step_type, phase, batch_index, batch_total, agent_name, tool_name,
         status, strategy, mode, total_files, file_count, issue_count,
         duration_ms, tokens_used, cost_usd, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
  }

  clearProgress(): void {
    try {
      this.db.prepare('DELETE FROM review_progress WHERE task_id = ?').run(this.taskId);
    } catch (err) {
      console.warn(`[ProgressTracker] clearProgress failed for task ${this.taskId}:`, err);
    }
  }

  // ── Task level ──

  taskStart(opts: {
    strategy: string;
    mode: string;
    totalFiles: number;
    totalBatches: number;
  }): void {
    this.insert({
      stepType: 'task_start',
      strategy: opts.strategy,
      mode: opts.mode,
      totalFiles: opts.totalFiles,
      batchTotal: opts.totalBatches,
      status: 'running',
    });
  }

  taskEnd(opts: {
    status: ProgressStatus;
    durationMs: number;
    issueCount: number;
    tokensUsed?: number;
    costUsd?: number;
  }): void {
    this.closeActiveAgent();
    this.insert({
      stepType: 'task_end',
      status: opts.status,
      durationMs: opts.durationMs,
      issueCount: opts.issueCount,
      tokensUsed: opts.tokensUsed,
      costUsd: opts.costUsd,
    });
  }

  // ── Phase level ──

  phaseStart(phase: ProgressPhase): void {
    this.currentPhase = phase;
    this.insert({ stepType: 'phase_start', phase, status: 'running' });
  }

  phaseEnd(
    phase: ProgressPhase,
    opts: {
      durationMs: number;
      fileCount?: number;
      issueCount?: number;
      detail?: Record<string, unknown>;
    }
  ): void {
    this.closeActiveAgent();
    this.insert({
      stepType: 'phase_end',
      phase,
      status: 'completed',
      durationMs: opts.durationMs,
      fileCount: opts.fileCount,
      issueCount: opts.issueCount,
      detail: opts.detail ? JSON.stringify(opts.detail) : undefined,
    });
  }

  // ── Batch level ──

  batchStart(
    phase: ProgressPhase,
    index: number,
    total: number,
    fileCount: number,
    detail?: Record<string, unknown>
  ): void {
    this.currentPhase = phase;
    this.currentBatchIndex = index;
    this.insert({
      stepType: 'batch_start',
      phase,
      batchIndex: index,
      batchTotal: total,
      fileCount,
      status: 'running',
      detail: detail ? JSON.stringify(detail) : undefined,
    });
  }

  batchEnd(
    phase: ProgressPhase,
    index: number,
    opts: {
      status: ProgressStatus;
      durationMs: number;
      issueCount: number;
      tokensUsed?: number;
      costUsd?: number;
    }
  ): void {
    this.closeActiveAgent();
    this.insert({
      stepType: 'batch_end',
      phase,
      batchIndex: index,
      status: opts.status,
      durationMs: opts.durationMs,
      issueCount: opts.issueCount,
      tokensUsed: opts.tokensUsed,
      costUsd: opts.costUsd,
    });
    this.currentBatchIndex = null;
  }

  // ── Agent level ──

  agentStart(agentName: string): void {
    this.closeActiveAgent();
    this.currentAgentName = agentName;
    this.agentStartTime = Date.now();
    this.currentAgentTokens = 0;
    this.insert({
      stepType: 'agent_start',
      phase: this.currentPhase ?? undefined,
      batchIndex: this.currentBatchIndex ?? undefined,
      agentName,
      status: 'running',
    });
  }

  agentAddTokens(tokens: number): void {
    this.currentAgentTokens += tokens;
  }

  agentEnd(agentName: string, opts?: { tokensUsed?: number }): void {
    const durationMs = this.agentStartTime ? Date.now() - this.agentStartTime : undefined;
    const tokensUsed =
      opts?.tokensUsed ?? (this.currentAgentTokens > 0 ? this.currentAgentTokens : undefined);
    this.insert({
      stepType: 'agent_end',
      phase: this.currentPhase ?? undefined,
      batchIndex: this.currentBatchIndex ?? undefined,
      agentName,
      status: 'completed',
      durationMs,
      tokensUsed,
    });
    this.currentAgentName = null;
    this.agentStartTime = null;
    this.currentAgentTokens = 0;
  }

  // ── Tool call level ──

  toolCall(toolName: string, detail?: Record<string, unknown>): void {
    this.insert({
      stepType: 'tool_call',
      phase: this.currentPhase ?? undefined,
      batchIndex: this.currentBatchIndex ?? undefined,
      agentName: this.currentAgentName ?? undefined,
      toolName,
      detail: detail ? JSON.stringify(detail) : undefined,
    });
  }

  // ── SDK message handler ──

  handleSDKEvent(message: {
    type: string;
    subtype?: string;
    description?: string;
    task_id?: string;
    message?: { content?: Array<{ type: string; name?: string; input?: unknown }> };
    parent_tool_use_id?: string;
    usage?: { total_tokens?: number };
    total_cost_usd?: number;
    num_turns?: number;
  }): void {
    switch (message.type) {
      case 'system': {
        break;
      }
      case 'assistant': {
        if (message.usage?.total_tokens) {
          this.agentAddTokens(message.usage.total_tokens);
        }
        const blocks = message.message?.content ?? [];
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name) {
            const inputSummary = this.summarizeToolInput(block.name, block.input);
            this.toolCall(block.name, inputSummary);
          }
        }
        break;
      }
    }
  }

  getCurrentAgentName(): string | null {
    return this.currentAgentName;
  }

  // ── Internal ──

  private closeActiveAgent(): void {
    if (this.currentAgentName) {
      this.agentEnd(this.currentAgentName);
    }
  }

  private summarizeToolInput(
    toolName: string,
    input: unknown
  ): Record<string, unknown> | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const obj = input as Record<string, unknown>;
    switch (toolName) {
      case 'Read':
        return { path: obj.file_path ?? obj.path };
      case 'Grep':
        return { pattern: obj.regex ?? obj.pattern, path: obj.path };
      case 'Glob':
        return { pattern: obj.pattern, path: obj.path };
      default:
        return { tool: toolName };
    }
  }

  private insert(opts: {
    stepType: string;
    phase?: string;
    batchIndex?: number;
    batchTotal?: number;
    agentName?: string;
    toolName?: string;
    status?: string;
    strategy?: string;
    mode?: string;
    totalFiles?: number;
    fileCount?: number;
    issueCount?: number;
    durationMs?: number;
    tokensUsed?: number;
    costUsd?: number;
    detail?: string;
  }): void {
    try {
      this.insertStmt.run(
        this.taskId,
        opts.stepType,
        opts.phase ?? null,
        opts.batchIndex ?? null,
        opts.batchTotal ?? null,
        opts.agentName ?? null,
        opts.toolName ?? null,
        opts.status ?? null,
        opts.strategy ?? null,
        opts.mode ?? null,
        opts.totalFiles ?? null,
        opts.fileCount ?? null,
        opts.issueCount ?? null,
        opts.durationMs ?? null,
        opts.tokensUsed ?? null,
        opts.costUsd ?? null,
        opts.detail ?? null
      );
    } catch (err) {
      console.warn(`[ProgressTracker] insert failed (${opts.stepType}):`, err);
    }
  }
}
