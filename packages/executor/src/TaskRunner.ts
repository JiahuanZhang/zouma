import type { ReviewTask } from '@zouma/common';
import { DatabaseManager } from '@zouma/common';

export class TaskRunner {
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  async run(task: ReviewTask): Promise<void> {
    this.running = true;
    console.log(`[TaskRunner] 接收任务 #${task.id}: ${task.name}`);

    try {
      this.updateStatus(task.id, 'running');
      console.log(`[TaskRunner] 开始执行任务 #${task.id}`);

      const result = await this.executeReview(task);

      this.updateStatus(task.id, 'completed', result);
      console.log(`[TaskRunner] 任务 #${task.id} 执行完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus(task.id, 'failed', message);
      console.error(`[TaskRunner] 任务 #${task.id} 执行失败:`, message);
    } finally {
      this.running = false;
    }
  }

  /**
   * 具体评审执行逻辑 — placeholder，后续填充
   */
  private async executeReview(_task: ReviewTask): Promise<string> {
    // TODO: 实现具体的评审逻辑（Git操作、LLM调用等）
    return 'review completed (placeholder)';
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
