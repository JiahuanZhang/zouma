import { Router } from 'express';
import { GitRepoController } from '../controllers/GitRepoController.js';

export const gitRepoRouter = Router();

gitRepoRouter.get('/', GitRepoController.getAll);
gitRepoRouter.get('/:id', GitRepoController.getById);
gitRepoRouter.post('/', GitRepoController.create);
gitRepoRouter.post('/detect-local', GitRepoController.detectLocal);
gitRepoRouter.put('/:id', GitRepoController.update);
gitRepoRouter.delete('/:id', GitRepoController.remove);
