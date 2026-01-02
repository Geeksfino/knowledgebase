/**
 * Simple logger utility
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatLog(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(formatLog('info', message, data));
  },
  
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(formatLog('warn', message, data));
  },
  
  error: (message: string, data?: Record<string, unknown>) => {
    console.error(formatLog('error', message, data));
  },
  
  debug: (message: string, data?: Record<string, unknown>) => {
    if (process.env.DEBUG === 'true') {
      console.log(formatLog('debug', message, data));
    }
  },
};

