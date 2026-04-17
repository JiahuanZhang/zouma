import { Router } from 'express';
import { ReviewPlanController } from '../controllers/ReviewPlanController.js';

export const reviewPlanRouter = Router();

reviewPlanRouter.get('/', ReviewPlanController.getAll);
reviewPlanRouter.get('/:id', ReviewPlanController.getById);
reviewPlanRouter.post('/', ReviewPlanController.create);
reviewPlanRouter.post('/:id/trigger', ReviewPlanController.trigger);
reviewPlanRouter.put('/:id', ReviewPlanController.update);
reviewPlanRouter.delete('/:id', ReviewPlanController.remove);

// Git webhook 接收端点
reviewPlanRouter.post('/webhook/:planId', ReviewPlanController.handleWebhook);
