import { Router } from 'express';
import { ReviewTaskController } from '../controllers/ReviewTaskController.js';

export const reviewTaskRouter = Router();

reviewTaskRouter.get('/', ReviewTaskController.getAll);
reviewTaskRouter.get('/:id', ReviewTaskController.getById);
reviewTaskRouter.get('/:id/logs', ReviewTaskController.getLogs);
reviewTaskRouter.get('/:id/progress', ReviewTaskController.getProgress);
reviewTaskRouter.get('/:id/issues', ReviewTaskController.getIssues);
reviewTaskRouter.post('/', ReviewTaskController.create);
reviewTaskRouter.post('/:id/execute', ReviewTaskController.execute);
reviewTaskRouter.put('/:id', ReviewTaskController.update);
reviewTaskRouter.delete('/:id', ReviewTaskController.remove);
