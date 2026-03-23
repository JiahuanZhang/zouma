import { Router } from 'express';
import { gitRepoRouter } from './gitRepoRoutes.js';
import { llmConfigRouter } from './llmConfigRoutes.js';
import { reviewTaskRouter } from './reviewTaskRoutes.js';
import { systemRouter } from './systemRoutes.js';

export const apiRouter = Router();

apiRouter.use('/git-repos', gitRepoRouter);
apiRouter.use('/llm-configs', llmConfigRouter);
apiRouter.use('/review-tasks', reviewTaskRouter);
apiRouter.use('/system', systemRouter);
