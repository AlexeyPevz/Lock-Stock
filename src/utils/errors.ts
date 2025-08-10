import { Context } from "grammy";
import { logger } from "./logger";

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, "DATABASE_ERROR", 500);
  }
}

export class GenerationError extends AppError {
  constructor(message: string) {
    super(message, "GENERATION_ERROR", 500);
  }
}

export class NoContentError extends AppError {
  constructor(message: string = "Нет доступного контента") {
    super(message, "NO_CONTENT", 404);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Слишком много запросов") {
    super(message, "RATE_LIMIT", 429);
  }
}

export interface ErrorHandlerOptions {
  adminIds: Set<number>;
  adminLogChatId?: number;
  bot?: any; // Bot instance for admin notifications
}

export function createErrorHandler(options: ErrorHandlerOptions) {
  return async (err: any, ctx: any) => {
    const errorContext = {
      ...logger.fromContext(ctx),
      error: err,
      stack: err.stack,
    };

    // Log error
    if (err instanceof AppError && err.isOperational) {
      logger.warn("Operational error", errorContext);
    } else {
      logger.error("Unexpected error", errorContext);
    }

    // User response
    let userMessage = "Произошла ошибка. Попробуйте позже.";
    
    if (err instanceof AppError) {
      switch (err.code) {
        case "NO_CONTENT":
          userMessage = "К сожалению, доступные раунды закончились. Попробуйте позже или обратитесь к администратору.";
          break;
        case "RATE_LIMIT":
          userMessage = "Слишком много запросов. Подождите немного.";
          break;
        case "VALIDATION_ERROR":
          userMessage = `Ошибка: ${err.message}`;
          break;
        case "GENERATION_ERROR":
          userMessage = "Ошибка при генерации контента. Попробуйте другую команду.";
          break;
      }
    }

    try {
      await ctx.reply(userMessage);
    } catch (replyError) {
      logger.error("Failed to send error message to user", { replyError });
    }

    // Admin notification for critical errors
    if (!err.isOperational && options.adminLogChatId && options.bot) {
      try {
        const adminMessage = [
          "🚨 Критическая ошибка:",
          `User: @${ctx.from?.username || ctx.from?.id}`,
          `Error: ${err.message}`,
          `Stack: ${err.stack?.split("\n").slice(0, 3).join("\n")}`,
        ].join("\n");

        await options.bot.api.sendMessage(options.adminLogChatId, adminMessage);
      } catch (notifyError) {
        logger.error("Failed to notify admin", { notifyError });
      }
    }
  };
}

export function wrapAsync<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Re-throw AppError as is
      if (error instanceof AppError) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new AppError(
        error instanceof Error ? error.message : "Unknown error",
        "UNKNOWN_ERROR",
        500,
        false
      );
    }
  }) as T;
}