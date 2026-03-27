import type { ReviewTask } from '@zouma/common';
import { DatabaseManager } from '@zouma/common';
import { buildFromDB, preflightLlmCheck } from './configAdapter.js';
import { createDbLogger } from './dbLogger.js';
import { runReview } from './core/orchestrate.js';
import { ProgressTracker } from './progressTracker.js';

export class TaskRunner {
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  async run(task: ReviewTask): Promise<void> {
    this.running = true;
    console.log(`[TaskRunner] 接收任务 #${task.id}: ${task.name}`);

    const logger = createDbLogger(task.id);
    const tracker = new ProgressTracker(task.id);

    const startTime = Date.now();
    try {
      tracker.clearProgress();
      this.clearIssues(task.id);

      console.log(`[TaskRunner] 预检 LLM API 连通性...`);
      await preflightLlmCheck(task);
      console.log(`[TaskRunner] LLM API 预检通过`);

      this.updateStatus(task.id, 'running');
      console.log(`[TaskRunner] 开始执行任务 #${task.id}`);

      const result = await this.executeReview(task, logger, tracker);

      tracker.taskEnd({
        status: 'completed',
        durationMs: Date.now() - startTime,
        issueCount: result.issueCount,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      });

      this.saveIssues(task.id, result.reportJson);
      this.updateStatus(task.id, 'completed', result.reportJson);
      console.log(`[TaskRunner] 任务 #${task.id} 执行完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      tracker.taskEnd({ status: 'failed', durationMs: Date.now() - startTime, issueCount: 0 });
      this.updateStatus(task.id, 'failed', message);
      logger.error(`任务执行失败: ${message}`, stack);
      console.error(`[TaskRunner] 任务 #${task.id} 执行失败:`, message);
    } finally {
      await logger.flush();
      this.running = false;
    }
  }

  private async executeReview(
    task: ReviewTask,
    logger: ReturnType<typeof createDbLogger>,
    tracker: ProgressTracker
  ): Promise<{ reportJson: string; issueCount: number; tokensUsed: number; costUsd: number }> {
    const { appConfig, reviewOptions } = buildFromDB(task);

    logger.info(`评审启动 | 目标: ${reviewOptions.targetPath} | 模型: ${appConfig.model}`);

    const startTime = Date.now();
    const result = await runReview(reviewOptions, appConfig, logger, tracker);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info(
      `评审完成 | 耗时: ${elapsed}s | 文件: ${result.totalFiles} | 问题: ${result.report.issues.length}`
    );
    await logger.flush();

    return {
      reportJson: JSON.stringify(result.report),
      issueCount: result.report.issues.length,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
    };
  }

  private clearIssues(taskId: number): void {
    const db = DatabaseManager.getDatabase();
    db.prepare('DELETE FROM review_issues WHERE task_id = ?').run(taskId);
  }

  private saveIssues(taskId: number, reportJson: string): void {
    try {
      const report = JSON.parse(reportJson) as { issues?: Array<{
        severity: string; category: string; file: string;
        line?: number; description: string; suggestion: string;
      }> };
      if (!report.issues?.length) return;

      const db = DatabaseManager.getDatabase();
      const insert = db.prepare(
        `INSERT INTO review_issues (task_id, severity, category, file, line, description, suggestion)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const batch = db.transaction((issues: typeof report.issues) => {
        for (const i of issues!) {
          insert.run(taskId, i.severity, i.category, i.file, i.line ?? null, i.description, i.suggestion);
        }
      });
      batch(report.issues);
    } catch (err) {
      console.warn(`[TaskRunner] saveIssues failed for task ${taskId}:`, err);
    }
  }

  private updateStatus(taskId: number, status: string, result?: string): void {
    const db = DatabaseManager.getDatabase();
    if (result !== undefined) {
      db.prepare(
        `UPDATE review_task SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(status, result, taskId);
    } else {
      db.prepare(
        `UPDATE review_task SET status = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(status, taskId);
    }
  }
}
