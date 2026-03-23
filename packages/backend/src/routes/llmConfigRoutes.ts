import { Router } from 'express';
import { LlmConfigController } from '../controllers/LlmConfigController.js';

export const llmConfigRouter = Router();

llmConfigRouter.get('/', LlmConfigController.getAll);
llmConfigRouter.get('/:id', LlmConfigController.getById);
llmConfigRouter.post('/', LlmConfigController.create);
llmConfigRouter.post('/models', LlmConfigController.fetchModels);
llmConfigRouter.put('/:id', LlmConfigController.update);
llmConfigRouter.delete('/:id', LlmConfigController.remove);
