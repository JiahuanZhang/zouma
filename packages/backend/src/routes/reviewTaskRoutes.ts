import { Router } from 'express';
import { ReviewTaskController } from '../controllers/ReviewTaskController.js';

export const reviewTaskRouter = Router();

reviewTaskRouter.get('/', ReviewTaskController.getAll);
reviewTaskRouter.get('/:id', ReviewTaskController.getById);
reviewTaskRouter.post('/', ReviewTaskController.create);
reviewTaskRouter.put('/:id', ReviewTaskController.update);
reviewTaskRouter.delete('/:id', ReviewTaskController.remove);
