import { Context, SessionFlavor } from "grammy";
import { Session } from "../types";

/**
 * Унифицированный middleware для работы с сессиями
 * Синхронизирует Grammy сессии с Map сессиями для обратной совместимости
 */
export function unifiedSession(sessions: Map<number, Session>) {
  return async (ctx: Context & SessionFlavor<Session>, next: () => Promise<void>) => {
    const chatId = ctx.chat?.id;
    
    if (!chatId) {
      await next();
      return;
    }

    // Синхронизация: если есть в Map, но нет в Grammy session
    if (sessions.has(chatId) && ctx.session) {
      const mapSession = sessions.get(chatId)!;
      
      // Сохраняем игровые данные из Map в Grammy session
      ctx.session.chatId = mapSession.chatId;
      ctx.session.rounds = mapSession.rounds;
      ctx.session.currentIndex = mapSession.currentIndex;
      ctx.session.revealed = mapSession.revealed;
      ctx.session.roundIds = mapSession.roundIds;
      ctx.session.freeLimit = mapSession.freeLimit;
      ctx.session.premiumTotal = mapSession.premiumTotal;
      ctx.session.isPremium = mapSession.isPremium;
      ctx.session.skipsUsed = mapSession.skipsUsed;
      
      // Удаляем из Map, теперь используем только Grammy
      sessions.delete(chatId);
    }

    // Обновляем chatId в сессии если его нет
    if (ctx.session && !ctx.session.chatId) {
      ctx.session.chatId = chatId;
    }

    await next();

    // После обработки обновляем Map для обратной совместимости
    // (пока не переписаны все обработчики)
    if (ctx.session && ctx.session.rounds.length > 0) {
      sessions.set(chatId, {
        chatId: ctx.session.chatId,
        rounds: ctx.session.rounds,
        currentIndex: ctx.session.currentIndex,
        revealed: ctx.session.revealed,
        roundIds: ctx.session.roundIds,
        freeLimit: ctx.session.freeLimit,
        premiumTotal: ctx.session.premiumTotal,
        isPremium: ctx.session.isPremium,
        skipsUsed: ctx.session.skipsUsed,
      });
    }
  };
}