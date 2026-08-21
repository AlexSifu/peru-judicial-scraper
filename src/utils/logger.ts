type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: Level = 'info';

export function setLogLevel(level: 'debug' | 'info'): void {
  minLevel = level;
}

function log(level: Level, message: string): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
  const line = `[${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string): void => log('debug', message),
  info: (message: string): void => log('info', message),
  warn: (message: string): void => log('warn', message),
  error: (message: string): void => log('error', message),
};
