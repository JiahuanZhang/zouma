import type { Request, Response } from 'express';
import type {
  CreateReviewPlanDTO,
  UpdateReviewPlanDTO,
  ReviewPlanTriggerType,
  TriggerConfig,
} from '@zouma/common';
import { ResponseHelper, Validator } from '@zouma/common';
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
}
