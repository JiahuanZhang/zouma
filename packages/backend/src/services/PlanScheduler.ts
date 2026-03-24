import type { ReviewPlan, IntervalTriggerConfig, DailyTriggerConfig } from '@zouma/common';
import { ReviewPlanService } from './ReviewPlanService.js';

export class PlanScheduler {
  private static timer: ReturnType<typeof setInterval> | null = null;
  private static readonly CHECK_INTERVAL = 60_000;

  static start(): void {
    if (PlanScheduler.timer) return;
    console.log('[PlanScheduler] Started, checking every 60s');
    PlanScheduler.timer = setInterval(() => PlanScheduler.check(), PlanScheduler.CHECK_INTERVAL);
  }

  static stop(): void {
    if (PlanScheduler.timer) {
      clearInterval(PlanScheduler.timer);
      PlanScheduler.timer = null;
      console.log('[PlanScheduler] Stopped');
    }
  }

  private static check(): void {
    try {
      const plans = ReviewPlanService.findAllEnabled();
      const now = new Date();

      for (const plan of plans) {
        if (PlanScheduler.shouldTrigger(plan, now)) {
          console.log(`[PlanScheduler] Triggering plan: ${plan.name} (id=${plan.id})`);
          ReviewPlanService.trigger(plan.id);
        }
      }
    } catch (err) {
      console.error('[PlanScheduler] Error during check:', err);
    }
  }

  private static shouldTrigger(plan: ReviewPlan, now: Date): boolean {
    const config = plan.trigger_config;

    if (plan.trigger_type === 'interval') {
      const { interval_hours } = config as IntervalTriggerConfig;
      if (!interval_hours) return false;
      if (!plan.last_triggered_at) return true;
      const last = new Date(plan.last_triggered_at + 'Z');
      return now.getTime() - last.getTime() >= interval_hours * 3600_000;
    }

    if (plan.trigger_type === 'daily') {
      const { time } = config as DailyTriggerConfig;
      if (!time) return false;
      const [h, m] = time.split(':').map(Number);
      if (now.getHours() === h && now.getMinutes() === m) {
        if (!plan.last_triggered_at) return true;
        const last = new Date(plan.last_triggered_at + 'Z');
        return now.getTime() - last.getTime() >= 60_000;
      }
    }

    // webhook 类型不走定时调度，由外部 API 触发
    return false;
  }
}
