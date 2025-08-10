import { Context } from "grammy";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  userId?: number;
  chatId?: number;
  username?: string;
  command?: string;
  error?: any;
  [key: string]: any;
}

class Logger {
  private level: LogLevel;

  constructor() {
    const levelStr = process.env.LOG_LEVEL || "INFO";
    this.level = LogLevel[levelStr as keyof typeof LogLevel] || LogLevel.INFO;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage("DEBUG", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage("INFO", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage("WARN", message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage("ERROR", message, context));
    }
  }

  fromContext(ctx: Context): LogContext {
    return {
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      username: ctx.from?.username,
      command: ctx.message?.text?.split(" ")[0],
    };
  }
}

export const logger = new Logger();