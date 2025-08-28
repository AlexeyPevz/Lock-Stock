import { Context } from "grammy";
import { Session, RevealState, RoundBundle } from "../types";
import { logger } from "../utils/logger";
import { renderRoundText } from "../utils/render";
import { SqliteRoundRepository, SqliteFeedbackRepository } from "../db/repository";
import { safeCallbackData } from "../utils/telegram-limits";
import { NoContentError } from "../utils/errors";
import Database from "better-sqlite3";

export interface CallbackHandlerDeps {
  db: Database.Database;
  sessions: Map<number, Session>;
  bot: any;
}

function buildHostKeyboard(state: RevealState, canSkip: boolean) {
  return {
    inline_keyboard: [
      [{ text: state.showQuestion ? "Вопрос ✓" : "Показать вопрос", callback_data: "reveal:question" }],
      [{ text: state.showHint1 ? "Подсказка 1 ✓" : "Показать подсказку 1", callback_data: "reveal:hint1" }],
      [{ text: state.showHint2 ? "Подсказка 2 ✓" : "Показать подсказку 2", callback_data: "reveal:hint2" }],
      [{ text: state.showAnswer ? "Ответ ✓" : "Показать ответ", callback_data: "reveal:answer" }],
      [
        { text: "Таймер 30", callback_data: "timer:30" },
        { text: "Таймер 60", callback_data: "timer:60" },
        { text: "Таймер 90", callback_data: "timer:90" },
      ],
      [
        ...(canSkip ? [{ text: "Скип раунда", callback_data: "round:skip" }] : []),
        { text: "Правила", callback_data: "show:rules" },
      ],
    ],
  };
}

function buildFeedbackKeyboard(roundId: string, number: number) {
  return {
    inline_keyboard: [
      [
        { text: "★1", callback_data: safeCallbackData("fb:rate", roundId, number, 1) },
        { text: "★2", callback_data: safeCallbackData("fb:rate", roundId, number, 2) },
        { text: "★3", callback_data: safeCallbackData("fb:rate", roundId, number, 3) },
      ],
      [
        { text: "★4", callback_data: safeCallbackData("fb:rate", roundId, number, 4) },
        { text: "★5", callback_data: safeCallbackData("fb:rate", roundId, number, 5) },
      ],
      [
        { text: "Сложно", callback_data: safeCallbackData("fb:cat", roundId, number, "hard") },
        { text: "Легко", callback_data: safeCallbackData("fb:cat", roundId, number, "easy") },
      ],
      [
        { text: "Спорно", callback_data: safeCallbackData("fb:cat", roundId, number, "controversial") },
        { text: "Узкая тема", callback_data: safeCallbackData("fb:cat", roundId, number, "niche") },
      ],
      [
        { text: "Формулировка", callback_data: safeCallbackData("fb:cat", roundId, number, "wording") },
        { text: "Устарело", callback_data: safeCallbackData("fb:cat", roundId, number, "outdated") },
      ],
    ],
  };
}

export async function handleReveal(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.answerCallbackQuery();
    return;
  }

  const session = deps.sessions.get(chatId);
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Сессия не найдена. Начните новую игру /newgame" });
    return;
  }

  const index = session.currentIndex;
  if (index >= session.rounds.length) {
    await ctx.answerCallbackQuery();
    return;
  }

  const state = session.revealed[index] || {
    showQuestion: true,
    showHint1: false,
    showHint2: false,
    showAnswer: false,
  };
  session.revealed[index] = state;

  const data = ctx.callbackQuery?.data || "";
  const [, what] = data.split(":");
  if (what === "question") state.showQuestion = true;
  if (what === "hint1") state.showHint1 = true;
  if (what === "hint2") state.showHint2 = true;
  if (what === "answer") state.showAnswer = true;

  const round = session.rounds[index];
  const canSkip = session.skipsUsed < 2; // Allow 2 skips per session
  
  const replyMarkup = state.showAnswer && session.roundIds?.[index]
    ? buildFeedbackKeyboard(session.roundIds[index], round.number)
    : buildHostKeyboard(state, canSkip);

  try {
    await ctx.editMessageText(renderRoundText(round, state), {
      reply_markup: replyMarkup,
    });
      } catch (error: any) {
      logger.warn("Failed to edit message", { error, chatId });
  }

  await ctx.answerCallbackQuery();
}

export async function handleFeedback(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.answerCallbackQuery();
    return;
  }

  const match = (ctx.callbackQuery?.data || "").match(/fb:(rate|cat):([^:]+):(\d+):([^:]+)/);
  if (!match) {
    await ctx.answerCallbackQuery();
    return;
  }

  const [, kind, roundId, numberStr, value] = match;
  const number = Number(numberStr);

  const feedbackRepo = new SqliteFeedbackRepository(deps.db);

  try {
    if (kind === "rate") {
      const rating = Number(value);
      if (rating >= 1 && rating <= 5) {
        feedbackRepo.save(userId, roundId, number, rating, undefined);
      }
    } else if (kind === "cat") {
      feedbackRepo.save(userId, roundId, number, undefined, value);
    }

    await ctx.answerCallbackQuery({ text: "Спасибо за отзыв!" });
    try {
      const { getStatsCollector } = await import("../stats/collector");
      getStatsCollector().logEvent(
        kind === "rate" ? "feedback_rating" : "feedback_category",
        userId,
        ctx.chat?.id,
        kind === "rate" ? { roundId, number, rating: Number(value) } : { roundId, number, category: value }
      );
    } catch {}
  } catch (error: any) {
      logger.error("Failed to save feedback", { error, userId, roundId });
    await ctx.answerCallbackQuery({ text: "Не удалось сохранить отзыв" });
  }
}

export async function handleRoundNext(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.answerCallbackQuery();
    return;
  }

  const session = deps.sessions.get(chatId);
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Сессия не найдена. Начните новую игру /newgame" });
    return;
  }

  const userId = ctx.from!.id;
  const roundRepo = new SqliteRoundRepository(deps.db);

  // Check limits
  if (!session.isPremium && session.currentIndex >= session.freeLimit) {
    await ctx.answerCallbackQuery({
      text: "Бесплатные раунды закончились. Используйте /premium для продолжения",
      show_alert: true,
    });
    return;
  }

  try {
    // If no pre-loaded rounds, try to get from DB
    if (session.currentIndex >= session.rounds.length) {
      const usedNumbers = session.rounds.map(r => r.number);
      const nextRound = roundRepo.findNextForUser(userId, usedNumbers);
      
      if (!nextRound) {
        throw new NoContentError();
      }

      session.rounds.push(nextRound);
      
      // Mark as seen (use actual round id from DB)
      const roundId = nextRound.id;
      session.roundIds = session.roundIds || {};
      session.roundIds[session.currentIndex] = roundId;
      roundRepo.markAsSeen(userId, roundId, nextRound.number);
    }

    const round = session.rounds[session.currentIndex];
    const state: RevealState = {
      showQuestion: true,
      showHint1: false,
      showHint2: false,
      showAnswer: false,
    };
    session.revealed[session.currentIndex] = state;

    const text = renderRoundText(round, state);
    const keyboard = buildHostKeyboard(state, session.skipsUsed < 2);

    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();

    logger.info("Round started", {
      userId,
      chatId,
      roundIndex: session.currentIndex,
      roundNumber: round.number,
    });
    try {
      const { getStatsCollector } = await import("../stats/collector");
      getStatsCollector().logEvent("round_revealed", userId, chatId, { number: round.number });
    } catch {}
  } catch (error) {
    if (error instanceof NoContentError) {
      await ctx.answerCallbackQuery({
        text: "Нет доступных раундов. Попробуйте позже.",
        show_alert: true,
      });
          } else {
        logger.error("Failed to start round", { error: error as any, userId, chatId });
      await ctx.answerCallbackQuery({
        text: "Произошла ошибка. Попробуйте еще раз.",
        show_alert: true,
      });
    }
  }
}

export async function handleRoundSkip(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.answerCallbackQuery();
    return;
  }

  const session = deps.sessions.get(chatId);
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Сессия не найдена" });
    return;
  }

  const skipsUsed = Object.values(session.revealed).filter(
    s => s.showAnswer && s.showQuestion && s.showHint1 && s.showHint2
  ).length;

  if (skipsUsed >= 2) {
    await ctx.answerCallbackQuery({ text: "Лимит скипов исчерпан", show_alert: true });
    return;
  }

  session.currentIndex++;
  await ctx.answerCallbackQuery();

  // Send new message instead of editing
  const nextButton = {
    inline_keyboard: [[
      { text: `Начать раунд ${session.currentIndex + 1}`, callback_data: "round:next" }
    ]],
  };

  session.skipsUsed += 1;
  await ctx.reply("Раунд пропущен.", { reply_markup: nextButton });
  try {
    const { getStatsCollector } = await import("../stats/collector");
    getStatsCollector().logEvent("round_skipped", ctx.from?.id, chatId, {});
  } catch {}
}

export async function handleTimer(ctx: Context, deps: CallbackHandlerDeps): Promise<void> {
  const seconds = Number(ctx.match![1]);
  await ctx.answerCallbackQuery();

  const message = await ctx.reply(`⏱ Таймер: ${seconds}с`);
  try {
    const { getStatsCollector } = await import("../stats/collector");
    getStatsCollector().logEvent("timer_started", ctx.from?.id, ctx.chat?.id, { seconds });
  } catch {}

  const checkpoints = [Math.floor(seconds / 2), 10, 5, 0]
    .filter((s, i, arr) => s > 0 || i === arr.length - 1)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => b - a);

  let elapsed = 0;
  for (const checkpoint of checkpoints) {
    const delay = (checkpoint === 0 ? seconds : checkpoint) - elapsed;
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
    elapsed += delay;

    try {
      const remaining = seconds - elapsed;
      const text = remaining > 0 ? `⏱ Осталось: ${remaining}с` : "⏰ Время вышло!";
      await deps.bot.api.editMessageText(ctx.chat!.id, message.message_id, text);
          } catch (error: any) {
        logger.warn("Failed to update timer", { error });
      break;
    }
  }
}

export async function handleShowRules(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "📋 Краткие правила:",
      "• Обязательная ставка, ответ пишется один раз",
      "• Чек = получить подсказку без ставок",
      "• После каждой подсказки — новые решения",
      "• Побеждает ближайший к правильному ответу",
    ].join("\n")
  );
}