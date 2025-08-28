import { Context } from "grammy";
import { logger } from "../utils/logger";

interface RateLimitOptions {
  windowMs: number;  // Окно времени в миллисекундах
  maxRequests: number;  // Максимум запросов за окно
  message?: string;  // Сообщение при превышении
}

interface UserLimit {
  count: number;
  resetAt: number;
}

/**
 * Простой in-memory rate limiter
 */
export function rateLimit(options: RateLimitOptions) {
  const limits = new Map<number, UserLimit>();
  
  const {
    windowMs = 60000,  // 1 минута по умолчанию
    maxRequests = 30,
    message = "⏱️ Слишком много запросов. Подождите немного."
  } = options;

  // Очистка старых записей каждые 5 минут
  setInterval(() => {
    const now = Date.now();
    for (const [userId, limit] of limits.entries()) {
      if (limit.resetAt < now) {
        limits.delete(userId);
      }
    }
  }, 5 * 60 * 1000);

  return async (ctx: Context, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    if (!userId) {
      await next();
      return;
    }

    const now = Date.now();
    const userLimit = limits.get(userId);

    // Первый запрос пользователя
    if (!userLimit || userLimit.resetAt < now) {
      limits.set(userId, {
        count: 1,
        resetAt: now + windowMs
      });
      await next();
      return;
    }

    // Проверяем лимит
    if (userLimit.count >= maxRequests) {
      const remainingMs = userLimit.resetAt - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      
      logger.warn("Rate limit exceeded", { userId, count: userLimit.count });
      
      await ctx.reply(
        `${message}\n\nПопробуйте через ${remainingSec} сек.`,
        { reply_to_message_id: ctx.message?.message_id }
      );
      return;
    }

    // Увеличиваем счетчик
    userLimit.count++;
    await next();
  };
}

/**
 * Rate limiter для команд (более строгий)
 */
export const commandRateLimit = rateLimit({
  windowMs: 60000,  // 1 минута
  maxRequests: 10,  // 10 команд в минуту
  message: "⏱️ Слишком много команд. Подождите немного."
});

/**
 * Rate limiter для callback (менее строгий)
 */
export const callbackRateLimit = rateLimit({
  windowMs: 60000,  // 1 минута
  maxRequests: 30,  // 30 нажатий в минуту
  message: "⏱️ Слишком много нажатий. Помедленнее!"
});