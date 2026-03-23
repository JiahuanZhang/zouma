import { Router } from 'express';
import { SystemController } from '../controllers/SystemController.js';

export const systemRouter = Router();

systemRouter.get('/browse-dirs', SystemController.browseDirectories);
