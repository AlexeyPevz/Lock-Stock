import { Bot, Context, session, SessionFlavor } from "grammy";
import dotenv from "dotenv";
import { z } from "zod";
import { Session as GameSession } from "./types";
import { openDb } from "./db/client";
import { logger } from "./utils/logger";
import { createErrorHandler } from "./utils/errors";
import { HealthChecker } from "./utils/health";
import {
  handleStart,
  handleRules,
  handlePremium,
  handleHelp,
  handleNewGame,
  handleGenerate,
  handleQuality,
  handleRecalc,
  CommandHandlerDeps,
} from "./handlers/commands";
import {
  handleReveal,
  handleFeedback,
  handleRoundNext,
  handleRoundSkip,
  handleTimer,
  handleShowRules,
  CallbackHandlerDeps,
} from "./handlers/callbacks";
import { verifyWithWikipedia } from "./verification/wiki";
import { generateOneRound } from "./generation/generator";
import { ensureFactsAndRound } from "./db/upsert";
import { SqliteRoundRepository } from "./db/repository";

dotenv.config();

// Environment validation
const EnvSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ADMIN_USER_IDS: z.string().optional(),
  FREE_ROUNDS: z.string().optional(),
  PREMIUM_ROUNDS: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
});

const parsedEnv = EnvSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error("Environment error:", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

// Configuration
const BOT_TOKEN = parsedEnv.data.BOT_TOKEN;
const ADMIN_IDS = new Set(
  (parsedEnv.data.ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
);
const DEFAULT_FREE = Number(parsedEnv.data.FREE_ROUNDS || 5);
const DEFAULT_PREMIUM = Number(parsedEnv.data.PREMIUM_ROUNDS || 15);
const CONTENT_PACK_PATH = process.env.CONTENT_PACK_PATH || "./content/pack.default.json";
const ADMIN_LOG_CHAT_ID = Number(process.env.ADMIN_LOG_CHAT_ID || 0);
const ENABLE_BG_GEN = process.env.ENABLE_BG_GEN === "1";
const BG_GEN_INTERVAL_SEC = Number(process.env.BG_GEN_INTERVAL_SEC || 600);
const HEALTH_CHECK_INTERVAL = Number(process.env.HEALTH_CHECK_INTERVAL || 300);

// Initialize dependencies
const sessions = new Map<number, GameSession>();
const db = openDb();

// Session middleware
interface BotSessionData {}
type MyContext = Context & SessionFlavor<BotSessionData>;

// Initialize bot
const bot = new Bot<MyContext>(BOT_TOKEN);

// Set commands
bot.api.setMyCommands([
  { command: "start", description: "Начать" },
  { command: "newgame", description: "Новая игра (пачка раундов)" },
  { command: "rules", description: "Правила (кратко)" },
  { command: "premium", description: "Премиум и Stars" },
  { command: "help", description: "Помощь" },
]);

// Session middleware
bot.use(
  session({
    initial: (): BotSessionData => ({}),
  })
);

// Dependencies for handlers
const commandDeps: CommandHandlerDeps = {
  db,
  sessions,
  adminIds: ADMIN_IDS,
  contentPackPath: CONTENT_PACK_PATH,
  freeRounds: DEFAULT_FREE,
  premiumRounds: DEFAULT_PREMIUM,
};

const callbackDeps: CallbackHandlerDeps = {
  db,
  sessions,
  bot,
};

// Command handlers
bot.command("start", (ctx) => handleStart(ctx));
bot.command("rules", (ctx) => handleRules(ctx));
bot.command("premium", (ctx) => handlePremium(ctx));
bot.command("help", (ctx) => handleHelp(ctx));
bot.command("newgame", (ctx) => handleNewGame(ctx, commandDeps));
bot.command("gen", (ctx) => handleGenerate(ctx, commandDeps));
bot.command("quality", (ctx) => handleQuality(ctx, commandDeps));
bot.command("recalc", (ctx) => handleRecalc(ctx, commandDeps));

// Admin-only verify command
bot.command("verify", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ADMIN_IDS.has(userId)) return;

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = sessions.get(chatId);
  if (!session || !session.rounds[session.currentIndex]) {
    await ctx.reply("Нет раунда для проверки");
    return;
  }

  const round = session.rounds[session.currentIndex];
  const roundId = session.roundIds?.[session.currentIndex];
  if (!roundId) {
    await ctx.reply("ID раунда не найден");
    return;
  }

  await ctx.reply("Проверяю через Wikipedia...");

  const q = await verifyWithWikipedia(round.question.text, round.question.sourceUrl);
  const h1 = await verifyWithWikipedia(round.hint1.text, round.hint1.sourceUrl);
  const h2 = await verifyWithWikipedia(round.hint2.text, round.hint2.sourceUrl);

  const ok = q.ok && h1.ok && h2.ok;
  if (ok) {
    const roundRepo = new SqliteRoundRepository(db);
    roundRepo.markAsVerified(roundId);
    await ctx.reply("✅ Раунд верифицирован");
    await adminLog(`Verified round ${roundId} (#${round.number}) by @${ctx.from?.username || ctx.from?.id}`);
  } else {
    await ctx.reply(`❌ Проверка не пройдена: Q=${q.ok} H1=${h1.ok} H2=${h2.ok}`);
    await adminLog(`Verify FAILED for ${roundId}: Q=${q.ok} H1=${h1.ok} H2=${h2.ok}`);
  }
});

// Callback query handlers
bot.callbackQuery(/reveal:(question|hint1|hint2|answer)/, (ctx) => handleReveal(ctx, callbackDeps));
bot.callbackQuery(/fb:(rate|cat):(.+?):(\d+):(\w+)/, (ctx) => handleFeedback(ctx, callbackDeps));
bot.callbackQuery("round:next", (ctx) => handleRoundNext(ctx, callbackDeps));
bot.callbackQuery("round:skip", (ctx) => handleRoundSkip(ctx, callbackDeps));
bot.callbackQuery(/timer:(30|60|90)/, (ctx) => handleTimer(ctx, callbackDeps));
bot.callbackQuery("show:rules", (ctx) => handleShowRules(ctx));

// Admin logging helper
async function adminLog(text: string) {
  try {
    if (ADMIN_LOG_CHAT_ID) {
      await bot.api.sendMessage(ADMIN_LOG_CHAT_ID, text);
    }
      } catch (error: any) {
      logger.error("Failed to send admin log", { error, text });
  }
}

// Background generation
async function backgroundGenerationTick() {
  try {
    const gen = await generateOneRound();
    const bundle = {
      number: gen.answer,
      question: {
        id: `gen-q-${Date.now()}`,
        number: gen.answer,
        domain: "other" as const,
        text: gen.question,
      },
      hint1: {
        id: `gen-h1-${Date.now()}`,
        number: gen.answer,
        domain: "other" as const,
        text: gen.hint1,
      },
      hint2: {
        id: `gen-h2-${Date.now()}`,
        number: gen.answer,
        domain: "other" as const,
        text: gen.hint2,
      },
    };

    const roundId = ensureFactsAndRound(db, bundle);

    const q = await verifyWithWikipedia(bundle.question.text);
    const h1 = await verifyWithWikipedia(bundle.hint1.text);
    const h2 = await verifyWithWikipedia(bundle.hint2.text);

    if (q.ok && h1.ok && h2.ok) {
      const roundRepo = new SqliteRoundRepository(db);
      roundRepo.markAsVerified(roundId);
      await adminLog(`✅ BG verified round ${roundId} (#${bundle.number})`);
    } else {
      await adminLog(`❌ BG verify failed ${roundId}: Q=${q.ok} H1=${h1.ok} H2=${h2.ok}`);
    }
  } catch (error: any) {
    logger.error("Background generation error", { error });
    await adminLog(`🚨 BG generation error: ${error?.message || error}`);
  }
}

// Health monitoring
const healthChecker = new HealthChecker(db, sessions);

// Error handling
const errorHandler = createErrorHandler({
  adminIds: ADMIN_IDS,
  adminLogChatId: ADMIN_LOG_CHAT_ID,
  bot,
});

bot.catch((err) => errorHandler(err, null as any));

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop accepting new updates
    await bot.stop();

    // Close database
    db.close();

    logger.info("Shutdown complete");
    process.exit(0);
      } catch (error: any) {
      logger.error("Error during shutdown", { error });
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start bot
if (process.env.NODE_ENV !== "test") {
  // Background tasks
  if (ENABLE_BG_GEN) {
    setInterval(backgroundGenerationTick, BG_GEN_INTERVAL_SEC * 1000);
    logger.info("Background generation enabled", { intervalSec: BG_GEN_INTERVAL_SEC });
  }

  // Health monitoring
  setInterval(() => healthChecker.logHealth(), HEALTH_CHECK_INTERVAL * 1000);

  // Start bot
  bot.start({
    onStart: () => {
      logger.info("Bot started", {
        adminIds: Array.from(ADMIN_IDS),
        freeRounds: DEFAULT_FREE,
        premiumRounds: DEFAULT_PREMIUM,
        bgGeneration: ENABLE_BG_GEN,
      });
    },
  });
}