import { logger as funcsLogger } from "firebase-functions";

export enum LogLevel {
  DEBUG = "debug", // Will log everything
  INFO = "info", // Will log info, warnings, and errors
  WARN = "warn", // Will log warnings and errors
  ERROR = "error", // Will log errors only
  SILENT = "silent", // Won't log anything
}

const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  private logLevel: number;
  private prefix: string = "";

  /**
   * @param logLevel LogLevel to set the logger to. Default is LogLevel.INFO.
   * @param prefix String to prefix all logs with. For example, a value of 'MyExtension' outputs as "[MyExtension]: this is the log message".
   */
  constructor(logLevel: LogLevel | string = LogLevel.INFO, prefix?: string) {
    this.setLogLevel(logLevel);
    this.prefix = prefix ? `[${prefix}]:` : "";
  }

  setLogLevel(logLevel: LogLevel | string): void {
    if (typeof logLevel === "string") {
      this.logLevel = levels[logLevel as keyof typeof levels] ?? levels.info;
    } else {
      this.logLevel = levels[logLevel];
    }
  }

  debug(...args: any[]): void {
    this.runIfLogLevel(levels.debug, funcsLogger.debug, ...args);
  }

  info(...args: any[]): void {
    this.runIfLogLevel(levels.info, funcsLogger.info, ...args);
  }

  warn(...args: any[]): void {
    this.runIfLogLevel(levels.warn, funcsLogger.warn, ...args);
  }

  error(...args: any[]): void {
    this.runIfLogLevel(levels.error, funcsLogger.error, ...args);
  }

  log(...args: any[]): void {
    this.info(...args);
  }

  private runIfLogLevel(level: number, func: Function, ...args: any[]): void {
    if (this.logLevel <= level) {
      if (!this.prefix) func(...args);
      else func(`${this.prefix}`, ...args);
    }
  }
}

export const logger = new Logger();
