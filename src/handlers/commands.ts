import { Context } from "grammy";
import { Session } from "../types";
import { logger } from "../utils/logger";
import { loadPack, shuffleInPlace } from "../content/provider";
import { generateOneRound } from "../generation/generator";
import { ensureFactsAndRound } from "../db/upsert";
import { verifyWithWikipedia } from "../verification/wiki";
import { getQualityReport, recomputeFactRatings, quarantineLowQualityFacts } from "../db/quality";
import Database from "better-sqlite3";

export interface CommandHandlerDeps {
  db: Database.Database;
  sessions: Map<number, Session>;
  adminIds: Set<number>;
  contentPackPath: string;
  freeRounds: number;
  premiumRounds: number;
}

export async function handleStart(ctx: Context): Promise<void> {
  logger.info("Start command", logger.fromContext(ctx));
  await ctx.reply(
    [
      "🎲 Lock Stock Question Bot",
      "",
      "Помогаю проводить офлайн-игру по правилам Lock Stock:",
      "• Числовой вопрос и две независимые подсказки",
      "• Ведущий открывает их по кнопкам",
      "• Ответ — целое число от 1 до 1000",
      "",
      "Команды:",
      "/newgame — Начать новую игру",
      "/rules — Правила игры",
      "/premium — Информация о премиум-доступе",
      "/help — Помощь",
    ].join("\n")
  );
}

export async function handleRules(ctx: Context): Promise<void> {
  logger.info("Rules command", logger.fromContext(ctx));
  await ctx.reply(
    [
      "📋 Правила Lock Stock:",
      "",
      "1. Все делают обязательную ставку",
      "2. Записывают ответ на карточке (больше не меняют)",
      "3. Торги после каждой подсказки:",
      "   • Рейз — повысить ставку",
      "   • Чек — предложить всем бесплатную подсказку",
      "   • Пас — выйти из банка",
      "4. В конце ведущий открывает ответ",
      "5. Побеждает ближайший к правильному",
      "",
      "Бот не считает очки — только помогает вести игру!",
    ].join("\n")
  );
}

export async function handlePremium(ctx: Context): Promise<void> {
  logger.info("Premium command", logger.fromContext(ctx));
  await ctx.reply(
    [
      "⭐ Премиум-доступ:",
      "",
      "Бесплатно: 5 раундов на сессию",
      "Премиум: 15 раундов за 100 Stars",
      "",
      "Скоро:",
      "• Тематические паки (спорт, кино, история)",
      "• Персонализация сложности",
      "• Статистика игр",
      "",
      "Поддержите разработку через Telegram Stars!",
    ].join("\n")
  );
}

export async function handleHelp(ctx: Context): Promise<void> {
  logger.info("Help command", logger.fromContext(ctx));
  await ctx.reply(
    [
      "❓ Помощь по боту:",
      "",
      "Бот помогает проводить офлайн-игру Lock Stock.",
      "Вы собираетесь компанией, бот выдаёт вопросы.",
      "",
      "Как играть:",
      "1. Нажмите /newgame",
      "2. Покажите экран всем игрокам",
      "3. Используйте кнопки для открытия подсказок",
      "4. Включайте таймер для обсуждений",
      "5. Открывайте ответ в конце раунда",
      "",
      "Ведущий может играть — ответы скрыты до нажатия!",
    ].join("\n")
  );
}

export async function handleNewGame(ctx: Context, deps: CommandHandlerDeps): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  logger.info("New game command", { ...logger.fromContext(ctx), chatId });

  try {
    const pack = loadPack(deps.contentPackPath);
    const limitedPack = pack.slice(0, deps.premiumRounds);
    
    const session: Session = {
      chatId,
      rounds: shuffleInPlace(limitedPack),
      currentIndex: 0,
      revealed: {},
      freeLimit: deps.freeRounds,
      premiumTotal: deps.premiumRounds,
      isPremium: false,
      skipsUsed: 0,
    };

    // Ensure DB ids for feedback/seen tracking
    session.roundIds = {};
    for (let i = 0; i < session.rounds.length; i++) {
      const roundId = ensureFactsAndRound(deps.db, session.rounds[i]);
      session.roundIds[i] = roundId;
    }

    deps.sessions.set(chatId, session);

    await ctx.reply(
      [
        "🎯 Новая игра начата!",
        `Доступно раундов: ${session.freeLimit} (бесплатно)`,
        "",
        "Нажмите кнопку ниже, чтобы начать первый раунд.",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Начать раунд 1", callback_data: "round:next" }]],
        },
      }
    );
  } catch (error: any) {
    logger.error("Error creating new game", { ...logger.fromContext(ctx), error });
    await ctx.reply("Произошла ошибка при создании игры. Попробуйте позже.");
  }
}

export async function handleGenerate(ctx: Context, deps: CommandHandlerDeps): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !deps.adminIds.has(userId)) return;

  const args = ctx.message?.text?.split(" ") || [];
  const count = Math.min(Number(args[1]) || 1, 10);

  logger.info("Generate command", { ...logger.fromContext(ctx), count });

  await ctx.reply(`Генерирую ${count} раундов...`);

  let generated = 0;
  let verified = 0;

  for (let i = 0; i < count; i++) {
    try {
      const gen = await generateOneRound();
      const bundle = {
        number: gen.answer,
        question: { id: `gen-q-${Date.now()}-${i}`, number: gen.answer, domain: gen.question.domain, text: gen.question.text, sourceUrl: gen.question.source_url },
        hint1: { id: `gen-h1-${Date.now()}-${i}`, number: gen.answer, domain: gen.hint1.domain, text: gen.hint1.text, sourceUrl: gen.hint1.source_url },
        hint2: { id: `gen-h2-${Date.now()}-${i}`, number: gen.answer, domain: gen.hint2.domain, text: gen.hint2.text, sourceUrl: gen.hint2.source_url },
      } as const;

      const roundId = ensureFactsAndRound(deps.db, bundle);
      generated++;

      // Verify using provided sources when available
      const q = await verifyWithWikipedia(bundle.question.text, bundle.question.sourceUrl);
      const h1 = await verifyWithWikipedia(bundle.hint1.text, bundle.hint1.sourceUrl);
      const h2 = await verifyWithWikipedia(bundle.hint2.text, bundle.hint2.sourceUrl);

      if (q.ok && h1.ok && h2.ok) {
        deps.db.prepare("UPDATE rounds SET verified = 1 WHERE id = ?").run(roundId);
        verified++;
      }
    } catch (error: any) {
      logger.error("Error generating round", { ...logger.fromContext(ctx), error, iteration: i });
    }
  }

  await ctx.reply(`Готово! Сгенерировано: ${generated}, верифицировано: ${verified}`);
}

export async function handleQuality(ctx: Context, deps: CommandHandlerDeps): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !deps.adminIds.has(userId)) return;

  logger.info("Quality command", logger.fromContext(ctx));

  const report = getQualityReport(deps.db);

  await ctx.reply(
    [
      "📊 Отчёт по качеству:",
      `Всего фактов: ${report.totals.facts}`,
      `В карантине: ${report.totals.quarantined}`,
      `Средний рейтинг: ${report.totals.avg_rating?.toFixed(2) || "-"}`,
      "",
      "Худшие по рейтингу:",
      ...report.worst.map((w) => `- ${w.id} (#${w.number}, ${w.domain}) = ${w.rating ?? "-"}`),
    ].join("\n")
  );
}

export async function handleRecalc(ctx: Context, deps: CommandHandlerDeps): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !deps.adminIds.has(userId)) return;

  logger.info("Recalc command", logger.fromContext(ctx));

  recomputeFactRatings(deps.db);
  quarantineLowQualityFacts(deps.db);

  await ctx.reply("Рейтинг пересчитан, карантин обновлён");
}