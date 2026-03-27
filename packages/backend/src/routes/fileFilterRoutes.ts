import { Router } from 'express';
import { FileFilterController } from '../controllers/FileFilterController.js';

export const fileFilterRouter = Router();

fileFilterRouter.get('/', FileFilterController.getAll);
fileFilterRouter.get('/:id', FileFilterController.getById);
fileFilterRouter.post('/', FileFilterController.create);
fileFilterRouter.put('/:id', FileFilterController.update);
fileFilterRouter.delete('/:id', FileFilterController.remove);
