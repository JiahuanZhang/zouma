import { Router } from 'express';
import { GitRepoController } from '../controllers/GitRepoController.js';

export const gitRepoRouter = Router();

gitRepoRouter.get('/', GitRepoController.getAll);
gitRepoRouter.post('/detect-local', GitRepoController.detectLocal);
gitRepoRouter.get('/:id', GitRepoController.getById);
gitRepoRouter.get('/:id/detail', GitRepoController.getDetail);
gitRepoRouter.get('/:id/review-records', GitRepoController.getReviewRecords);
gitRepoRouter.post('/', GitRepoController.create);
gitRepoRouter.put('/:id', GitRepoController.update);
gitRepoRouter.delete('/:id', GitRepoController.remove);
