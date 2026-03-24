import 'dotenv/config';
import { DatabaseManager } from '@zouma/common';
import { TaskPoller } from './TaskPoller.js';

const poller = new TaskPoller();

DatabaseManager.getDatabase();
console.log('[Executor] 数据库连接成功');

poller.start();
console.log('[Executor] 执行器已启动');

process.on('SIGINT', () => {
  console.log('[Executor] 正在关闭...');
  poller.stop();
  DatabaseManager.close();
  process.exit(0);
});
