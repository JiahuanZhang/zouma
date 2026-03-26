import { DatabaseManager } from '@zouma/common';
import type { ReviewLogger } from './core/reviewTypes.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const CONSOLE_PREFIX: Record<LogLevel, string> = {
  debug: '  .',
  info: '  ->',
  warn: '  !',
  error: '  X',
};

export function createDbLogger(taskId: number, consoleLevel: LogLevel = 'info'): ReviewLogger {
  const consoleLevelNum = LEVEL_ORDER[consoleLevel];

  const insertStmt = DatabaseManager.getDatabase().prepare(
    `INSERT INTO review_log (task_id, level, message, detail) VALUES (?, ?, ?, ?)`
  );

  function writeDb(level: LogLevel, msg: string, detail?: string): void {
    try {
      insertStmt.run(taskId, level, msg, detail ?? null);
    } catch {
      // DB write failure should not break the review process
    }
  }

  function writeConsole(level: LogLevel, msg: string): void {
    if (LEVEL_ORDER[level] < consoleLevelNum) return;
    const prefix = CONSOLE_PREFIX[level];
    if (level === 'error') {
      console.error(`${prefix} ${msg}`);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${msg}`);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }

  return {
    debug(msg: string, fileExtra?: string): void {
      writeConsole('debug', msg);
      writeDb('debug', msg, fileExtra);
    },

    info(msg: string, fileExtra?: string): void {
      writeConsole('info', msg);
      writeDb('info', msg, fileExtra);
    },

    warn(msg: string, fileExtra?: string): void {
      writeConsole('warn', msg);
      writeDb('warn', msg, fileExtra);
    },

    error(msg: string, fileExtra?: string): void {
      writeConsole('error', msg);
      writeDb('error', msg, fileExtra);
    },

    fileOnly(level: string, msg: string): void {
      const lvl = (level as LogLevel) in LEVEL_ORDER ? (level as LogLevel) : 'debug';
      writeDb(lvl, msg);
    },

    async flush(): Promise<void> {
      // SQLite writes are synchronous, nothing to flush
    },
  };
}
