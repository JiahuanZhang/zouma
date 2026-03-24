import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/index.js';
import { ErrorHandler } from './middleware/errorHandler.js';
import { DatabaseManager } from './database/index.js';
import { initializeDatabase } from './database/index.js';

class App {
  private app = express();
  private port: number;

  constructor() {
    this.port = Number(process.env.PORT) || 3000;
    this.setup();
  }

  private setup(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use('/api', apiRouter);
    this.app.use(ErrorHandler.handle);

    initializeDatabase();
  }

  start(): void {
    this.app.listen(this.port, () => {
      console.log(`[Server] Running at http://localhost:${this.port}`);
    });

    process.on('SIGINT', () => {
      DatabaseManager.close();
      process.exit(0);
    });
  }
}

const server = new App();
server.start();
