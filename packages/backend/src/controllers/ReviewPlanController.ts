import type { Request, Response } from 'express';
import crypto from 'crypto';
import type {
  CreateReviewPlanDTO,
  UpdateReviewPlanDTO,
  ReviewPlanTriggerType,
  TriggerConfig,
  WebhookTriggerConfig,
  WebhookLogStatus,
} from '@zouma/common';
import { ResponseHelper, Validator, DatabaseManager } from '@zouma/common';
import { ReviewPlanService } from '../services/ReviewPlanService.js';
import { RepoNotReadyError } from '../services/GitRepoService.js';

const VALID_TRIGGER_TYPES: ReviewPlanTriggerType[] = ['interval', 'daily', 'webhook'];

function validateTriggerConfig(type: ReviewPlanTriggerType, config: TriggerConfig): string | null {
  if (!config || typeof config !== 'object') return 'trigger_config 必须为对象';

  if (type === 'interval') {
    const c = config as { interval_hours?: number };
    if (!c.interval_hours || typeof c.interval_hours !== 'number' || c.interval_hours < 1) {
      return 'interval 类型需要 trigger_config.interval_hours (>= 1)';
    }
  } else if (type === 'daily') {
    const c = config as { time?: string };
    if (!c.time || !/^\d{2}:\d{2}$/.test(c.time)) {
      return 'daily 类型需要 trigger_config.time (格式 HH:mm)';
    }
  }
  // webhook 类型 config 可选（secret 可空）
  return null;
}

function extractBranchFromPayload(eventType: string | undefined, payload: unknown): string | null {
  if (!eventType || !payload) return null;
  const body = payload as Record<string, unknown>;

  // push 事件: payload.ref = "refs/heads/main"
  if (eventType === 'push' && body.ref) {
    return (body.ref as string).replace('refs/heads/', '');
  }
  // pull_request 事件: payload.pull_request.base.ref
  if (eventType === 'pull_request' && body.pull_request) {
    const pr = body.pull_request as Record<string, unknown>;
    return (pr.base as Record<string, unknown>)?.ref as string | null;
  }
  return null;
}

function matchBranchPattern(branch: string | null, patterns: string[]): boolean {
  if (!branch) return false;
  return patterns.some((p) => {
    if (p.endsWith('*')) return branch.startsWith(p.slice(0, -1));
    return branch === p;
  });
}

function logWebhookCall(
  planId: number,
  eventType: string | null,
  branch: string | null,
  req: Request,
  status: WebhookLogStatus,
  message: string | null,
  taskId: number | null = null
): void {
  const db = DatabaseManager.getDatabase();
  const payload = JSON.stringify(req.body).slice(0, 500);
  db.prepare(
    `INSERT INTO webhook_log (plan_id, event_type, branch, source_ip, user_agent, payload_summary, status, message, task_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    planId,
    eventType ?? null,
    branch ?? null,
    req.ip ?? null,
    req.headers['user-agent'] ?? null,
    payload,
    status,
    message ?? null,
    taskId
  );
}

export class ReviewPlanController {
  static getAll(req: Request, res: Response): void {
    const page = Number(req.query.page) || 0;
    const pageSize = Number(req.query.pageSize) || 0;

    if (page > 0 && pageSize > 0) {
      const { items, total } = ReviewPlanService.findAll({ page, pageSize });
      res.json(ResponseHelper.paginated(items, total, { page, pageSize }));
    } else {
      const { items } = ReviewPlanService.findAll();
      res.json(ResponseHelper.success(items));
    }
  }

  static getById(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const item = ReviewPlanService.findById(id);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item));
  }

  static create(req: Request, res: Response): void {
    const dto = req.body as CreateReviewPlanDTO;
    if (!Validator.isNonEmptyString(dto.name)) {
      res.status(400).json(ResponseHelper.error('name 不能为空', 400));
      return;
    }
    if (!Validator.isPositiveInteger(dto.repo_id)) {
      res.status(400).json(ResponseHelper.error('repo_id 无效', 400));
      return;
    }
    if (!Validator.isPositiveInteger(dto.llm_config_id)) {
      res.status(400).json(ResponseHelper.error('llm_config_id 无效', 400));
      return;
    }
    if (!dto.trigger_type || !VALID_TRIGGER_TYPES.includes(dto.trigger_type)) {
      res
        .status(400)
        .json(ResponseHelper.error(`trigger_type 必须为 ${VALID_TRIGGER_TYPES.join('/')}`, 400));
      return;
    }
    const configErr = validateTriggerConfig(dto.trigger_type, dto.trigger_config);
    if (configErr) {
      res.status(400).json(ResponseHelper.error(configErr, 400));
      return;
    }
    const item = ReviewPlanService.create(dto);
    res.status(201).json(ResponseHelper.success(item, '创建成功'));
  }

  static update(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const dto = req.body as UpdateReviewPlanDTO;
    if (dto.trigger_type && !VALID_TRIGGER_TYPES.includes(dto.trigger_type)) {
      res
        .status(400)
        .json(ResponseHelper.error(`trigger_type 必须为 ${VALID_TRIGGER_TYPES.join('/')}`, 400));
      return;
    }
    if (dto.trigger_type && dto.trigger_config) {
      const configErr = validateTriggerConfig(dto.trigger_type, dto.trigger_config);
      if (configErr) {
        res.status(400).json(ResponseHelper.error(configErr, 400));
        return;
      }
    }
    const item = ReviewPlanService.update(id, dto);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item, '更新成功'));
  }

  static remove(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const deleted = ReviewPlanService.delete(id);
    if (!deleted) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(null, '删除成功'));
  }

  static trigger(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    let result: ReturnType<typeof ReviewPlanService.trigger>;
    try {
      result = ReviewPlanService.trigger(id);
    } catch (err) {
      if (err instanceof RepoNotReadyError) {
        res.status(400).json(ResponseHelper.error(err.message, 400));
        return;
      }
      throw err;
    }
    if (!result) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(result, '已触发评审任务'));
  }

  static handleWebhook(req: Request, res: Response): void {
    const planId = Number(req.params.planId);
    if (!Validator.isPositiveInteger(planId)) {
      res.status(400).json(ResponseHelper.error('无效的计划 ID', 400));
      return;
    }

    const plan = ReviewPlanService.findById(planId);
    if (!plan) {
      res.status(404).json(ResponseHelper.error('未找到评审计划', 404));
      return;
    }

    if (plan.trigger_type !== 'webhook') {
      res.status(400).json(ResponseHelper.error('该计划不是 webhook 触发类型', 400));
      return;
    }

    const config = plan.trigger_config as WebhookTriggerConfig;
    const eventType = req.headers['x-github-event'] as string | undefined;
    const branch = extractBranchFromPayload(eventType, req.body);

    // 签名验证
    if (config.secret) {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      if (!signature) {
        logWebhookCall(planId, eventType ?? null, branch, req, 'rejected', '缺少签名头');
        res.status(401).json(ResponseHelper.error('缺少签名头', 401));
        return;
      }

      const payload = JSON.stringify(req.body);
      const expectedSig = `sha256=${crypto
        .createHmac('sha256', config.secret)
        .update(payload)
        .digest('hex')}`;

      if (
        signature.length !== expectedSig.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
      ) {
        logWebhookCall(planId, eventType ?? null, branch, req, 'rejected', '签名验证失败');
        res.status(401).json(ResponseHelper.error('签名验证失败', 401));
        return;
      }
    }

    // 事件类型过滤
    if (config.allowed_events?.length && eventType) {
      if (!config.allowed_events.includes(eventType)) {
        logWebhookCall(planId, eventType, branch, req, 'filtered', `事件类型 ${eventType} 不在允许列表`);
        res.status(200).json(ResponseHelper.success(null, '事件类型不在允许列表，已忽略'));
        return;
      }
    }

    // 分支过滤
    if (config.branch_filter) {
      const allowedBranches = config.branch_filter.split(',').map((s) => s.trim());
      if (!matchBranchPattern(branch, allowedBranches)) {
        logWebhookCall(planId, eventType ?? null, branch, req, 'filtered', `分支 ${branch ?? '未知'} 不在过滤范围`);
        res.status(200).json(ResponseHelper.success(null, '分支不在过滤范围，已忽略'));
        return;
      }
    }

    // 异步触发任务
    try {
      const result = ReviewPlanService.trigger(planId);
      if (!result) {
        logWebhookCall(planId, eventType ?? null, branch, req, 'error', '触发失败');
        res.status(500).json(ResponseHelper.error('触发失败', 500));
        return;
      }
      logWebhookCall(planId, eventType ?? null, branch, req, 'accepted', '任务已入队', result.taskId);
      res.status(202).json(ResponseHelper.success({ taskId: result.taskId }, 'webhook 触发成功，任务已入队'));
    } catch (err) {
      if (err instanceof RepoNotReadyError) {
        logWebhookCall(planId, eventType ?? null, branch, req, 'error', err.message);
        res.status(400).json(ResponseHelper.error(err.message, 400));
        return;
      }
      console.error('[Webhook] Trigger error:', err);
      logWebhookCall(planId, eventType ?? null, branch, req, 'error', '触发评审任务失败');
      res.status(500).json(ResponseHelper.error('触发评审任务失败', 500));
    }
  }
}
