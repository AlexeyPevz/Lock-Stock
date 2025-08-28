import { Context } from "grammy";

/**
 * Выполняет функцию с индикацией "typing" в чате
 */
export async function withTyping<T>(
  ctx: Context,
  action: () => Promise<T>
): Promise<T> {
  // Отправляем индикацию typing
  await ctx.replyWithChatAction("typing");
  
  // Обновляем typing каждые 4 секунды
  const interval = setInterval(async () => {
    try {
      await ctx.replyWithChatAction("typing");
    } catch (error) {
      // Игнорируем ошибки, чат мог быть удален
    }
  }, 4000);

  try {
    // Выполняем действие
    const result = await action();
    return result;
  } finally {
    // Останавливаем обновление typing
    clearInterval(interval);
  }
}

/**
 * Декоратор для методов с автоматической индикацией typing
 */
export function Typing() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (ctx: Context, ...args: any[]) {
      return withTyping(ctx, () => originalMethod.call(this, ctx, ...args));
    };

    return descriptor;
  };
}