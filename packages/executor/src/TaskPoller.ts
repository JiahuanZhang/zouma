import type { ReviewTask } from '@zouma/common';
import { DatabaseManager } from '@zouma/common';
import { TaskRunner } from './TaskRunner.js';

export class TaskPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private runner = new TaskRunner();
  private intervalMs: number;

  constructor(intervalMs?: number) {
    this.intervalMs = intervalMs ?? (Number(process.env.POLL_INTERVAL_MS) || 10000);
  }

  start(): void {
    console.log(`[TaskPoller] 启动轮询, 间隔 ${this.intervalMs}ms`);
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[TaskPoller] 轮询已停止');
    }
  }

  private poll(): void {
    if (this.runner.isRunning) {
      return;
    }

    const task = this.fetchPendingTask();
    if (!task) {
      return;
    }

    console.log(`[TaskPoller] 发现待执行任务 #${task.id}: ${task.name}`);
    this.runner.run(task);
  }

  private fetchPendingTask(): ReviewTask | undefined {
    const db = DatabaseManager.getDatabase();
    return db
      .prepare(`SELECT * FROM review_task WHERE status = 'pending' ORDER BY id ASC LIMIT 1`)
      .get() as ReviewTask | undefined;
  }
}
