import { Bot, Context, session, SessionFlavor } from "grammy";
import dotenv from "dotenv";
import { z } from "zod";
import { Session } from "./types";
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
import { handlePremiumInfo, handlePremiumBuy, handlePreCheckout, handleSuccessfulPayment, PaymentsDeps } from "./handlers/payments";
import {
  handleAdminMenu,
  handleAdminModel,
  handleAdminModelChange,
  handleAdminSetModel,
  handleAdminPrompt,
  handleAdminPromptEdit,
  handleAdminGame,
  handleAdminStats,
  handleAdminTextInput,
  handleAdminClose,
  handleAdminPromptReset,
  handleAdminPromptShow,
  handleAdminModelTemp,
  handleAdminModelAttempts,
  handleAdminSetAttempts,
  handleAdminGameFree,
  handleAdminGamePremium,
  handleAdminGameVerify,
  handleAdminPackages,
  handleAdminPackageEdit,
  handleAdminTimers,
  handleAdminLimits,
  handleAdminNotifications,
  handleAdminMaintenance,
  handleAdminToggleMaintenance,
  handleAdminToggleNotifications,
  handleAdminEditWelcome,
  handleAdminEditMaintenance,
  handleAdminPackageName,
  handleAdminPackageRounds,
  handleAdminPackagePrice,
  handleAdminPackageToggle,
  handleAdminPackageDelete,
  handleAdminTimerDefault,
  handleAdminTimerMax,
  handleAdminLimitSession,
  handleAdminLimitSkip,
  handleAdminLimitDaily,
  handleAdminStatsAI,
  handleAdminStatsFinance,
  handleAdminStatsGames,
  handleAdminStatsCharts,
  handleAdminChart,
  handleAdminModelSGR,
  handleAdminToggleSGR,
  handleAdminToggleExamples,
  AdminHandlerDeps,
} from "./handlers/admin";
import { ConfigManager } from "./config/manager";

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
// Initialize config manager
const config = ConfigManager.getInstance();

const DEFAULT_FREE = Number(parsedEnv.data.FREE_ROUNDS || config.get("freeRounds"));
const DEFAULT_PREMIUM = Number(parsedEnv.data.PREMIUM_ROUNDS || config.get("premiumRounds"));
const CONTENT_PACK_PATH = process.env.CONTENT_PACK_PATH || "./content/pack.default.json";
const ADMIN_LOG_CHAT_ID = Number(process.env.ADMIN_LOG_CHAT_ID || 0);
const ENABLE_BG_GEN = process.env.ENABLE_BG_GEN === "1";
const BG_GEN_INTERVAL_SEC = Number(process.env.BG_GEN_INTERVAL_SEC || 600);
const HEALTH_CHECK_INTERVAL = Number(process.env.HEALTH_CHECK_INTERVAL || 300);
const PREMIUM_PRICE_STARS = Number(process.env.PREMIUM_PRICE_STARS || 100);

// Initialize dependencies
const sessions = new Map<number, Session>();
const db = openDb();

// Initialize stats collector
import { initStatsCollector } from "./stats/collector";
const statsCollector = initStatsCollector(db);

// Session middleware
type MyContext = Context & SessionFlavor<Session>;

// Initialize bot
const bot = new Bot<MyContext>(BOT_TOKEN);

// Session middleware
bot.use(session({
  initial: (): Session => ({
    chatId: 0,
    rounds: [],
    currentIndex: 0,
    revealed: {},
    freeLimit: DEFAULT_FREE,
    premiumTotal: DEFAULT_PREMIUM,
    isPremium: false,
    skipsUsed: 0,
  })
}));

// Maintenance mode middleware
bot.use(async (ctx, next) => {
  const config = ConfigManager.getInstance();
  
  // Allow admins to use bot even in maintenance mode
  const userId = ctx.from?.id;
  if (userId && ADMIN_IDS.has(userId)) {
    await next();
    return;
  }
  
  // Check maintenance mode
  if (config.isMaintenanceMode()) {
    await ctx.reply(config.get("maintenanceMessage"), { parse_mode: "Markdown" });
    return;
  }
  
  await next();
});

// Set commands
bot.api.setMyCommands([
  { command: "start", description: "Начать" },
  { command: "newgame", description: "Новая игра (пачка раундов)" },
  { command: "rules", description: "Правила (кратко)" },
  { command: "premium", description: "Премиум и Stars" },
  { command: "help", description: "Помощь" },
]);



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

const paymentsDeps: PaymentsDeps = {
  sessions,
  bot,
  premiumPriceStars: PREMIUM_PRICE_STARS,
  premiumTotalRounds: DEFAULT_PREMIUM,
};

// Command handlers
bot.command("start", (ctx) => handleStart(ctx));
bot.command("rules", (ctx) => handleRules(ctx));
// Replace /premium to show dynamic info and purchase
bot.command("premium", (ctx) => handlePremiumInfo(ctx, paymentsDeps));
bot.command("help", (ctx) => handleHelp(ctx));
bot.command("newgame", (ctx) => handleNewGame(ctx, commandDeps));
bot.command("gen", (ctx) => handleGenerate(ctx, commandDeps));
bot.command("quality", (ctx) => handleQuality(ctx, commandDeps));
bot.command("recalc", (ctx) => handleRecalc(ctx, commandDeps));

// Admin command
const adminDeps: AdminHandlerDeps = { adminIds: ADMIN_IDS };
bot.command("admin", (ctx) => handleAdminMenu(ctx, adminDeps));

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

// Admin text input handler (must be before other handlers)
bot.on("message:text", async (ctx, next) => {
  const handled = await handleAdminTextInput(ctx, adminDeps);
  if (!handled) await next();
});

// Callback query handlers
bot.callbackQuery(/reveal:(question|hint1|hint2|answer)/, (ctx) => handleReveal(ctx, callbackDeps));
bot.callbackQuery(/fb:(rate|cat):(.+?):(\d+):(\w+)/, (ctx) => handleFeedback(ctx, callbackDeps));
bot.callbackQuery("round:next", (ctx) => handleRoundNext(ctx, callbackDeps));
bot.callbackQuery("round:skip", (ctx) => handleRoundSkip(ctx, callbackDeps));
bot.callbackQuery(/timer:(30|60|90)/, (ctx) => handleTimer(ctx, callbackDeps));
bot.callbackQuery("show:rules", (ctx) => handleShowRules(ctx));
// Premium callbacks
bot.callbackQuery("premium:buy", (ctx) => handlePremiumBuy(ctx, paymentsDeps));

// Admin callbacks
bot.callbackQuery("admin_menu", (ctx) => handleAdminMenu(ctx, adminDeps));
bot.callbackQuery("admin_model", (ctx) => handleAdminModel(ctx, adminDeps));
bot.callbackQuery("admin_model_change", (ctx) => handleAdminModelChange(ctx, adminDeps));
bot.callbackQuery("admin_prompt", (ctx) => handleAdminPrompt(ctx, adminDeps));
bot.callbackQuery("admin_prompt_edit", (ctx) => handleAdminPromptEdit(ctx, adminDeps));
bot.callbackQuery("admin_prompt_reset", (ctx) => handleAdminPromptReset(ctx, adminDeps));
bot.callbackQuery("admin_prompt_show", (ctx) => handleAdminPromptShow(ctx, adminDeps));
bot.callbackQuery("admin_game", (ctx) => handleAdminGame(ctx, adminDeps));
bot.callbackQuery("admin_stats", (ctx) => handleAdminStats(ctx, adminDeps));
bot.callbackQuery("admin_close", (ctx) => handleAdminClose(ctx));
bot.callbackQuery("admin_model_temp", (ctx) => handleAdminModelTemp(ctx, adminDeps));
bot.callbackQuery("admin_model_attempts", (ctx) => handleAdminModelAttempts(ctx, adminDeps));
bot.callbackQuery("admin_model_sgr", (ctx) => handleAdminModelSGR(ctx, adminDeps));
bot.callbackQuery("admin_toggle_sgr", (ctx) => handleAdminToggleSGR(ctx, adminDeps));
bot.callbackQuery("admin_toggle_examples", (ctx) => handleAdminToggleExamples(ctx, adminDeps));

// Admin callbacks with data
bot.callbackQuery(/^admin_set_model:(.+)$/, (ctx) => {
  const modelId = ctx.match[1];
  return handleAdminSetModel(ctx, adminDeps, modelId);
});

bot.callbackQuery(/^admin_set_attempts:(\d+)$/, (ctx) => {
  const attempts = parseInt(ctx.match[1]);
  return handleAdminSetAttempts(ctx, adminDeps, attempts);
});

// Additional admin callbacks
bot.callbackQuery("admin_game_free", (ctx) => handleAdminGameFree(ctx, adminDeps));
bot.callbackQuery("admin_game_premium", (ctx) => handleAdminGamePremium(ctx, adminDeps));
bot.callbackQuery("admin_game_verify", (ctx) => handleAdminGameVerify(ctx, adminDeps));
bot.callbackQuery("admin_packages", (ctx) => handleAdminPackages(ctx, adminDeps));
bot.callbackQuery("admin_timers", (ctx) => handleAdminTimers(ctx, adminDeps));
bot.callbackQuery("admin_limits", (ctx) => handleAdminLimits(ctx, adminDeps));
bot.callbackQuery("admin_notifications", (ctx) => handleAdminNotifications(ctx, adminDeps));
bot.callbackQuery("admin_maintenance", (ctx) => handleAdminMaintenance(ctx, adminDeps));
bot.callbackQuery("admin_toggle_maintenance", (ctx) => handleAdminToggleMaintenance(ctx, adminDeps));
bot.callbackQuery("admin_toggle_notifications", (ctx) => handleAdminToggleNotifications(ctx, adminDeps));
bot.callbackQuery("admin_edit_welcome", (ctx) => handleAdminEditWelcome(ctx, adminDeps));
bot.callbackQuery("admin_edit_maintenance", (ctx) => handleAdminEditMaintenance(ctx, adminDeps));
bot.callbackQuery("admin_timer_default", (ctx) => handleAdminTimerDefault(ctx, adminDeps));
bot.callbackQuery("admin_timer_max", (ctx) => handleAdminTimerMax(ctx, adminDeps));
bot.callbackQuery("admin_limit_session", (ctx) => handleAdminLimitSession(ctx, adminDeps));
bot.callbackQuery("admin_limit_skip", (ctx) => handleAdminLimitSkip(ctx, adminDeps));
bot.callbackQuery("admin_limit_daily", (ctx) => handleAdminLimitDaily(ctx, adminDeps));

// Package management callbacks
bot.callbackQuery(/^admin_package:(.+)$/, (ctx) => {
  const packageId = ctx.match[1];
  return handleAdminPackageEdit(ctx, adminDeps, packageId);
});

bot.callbackQuery(/^admin_pkg_name:(.+)$/, (ctx) => {
  const packageId = ctx.match[1];
  return handleAdminPackageName(ctx, adminDeps, packageId);
});

bot.callbackQuery(/^admin_pkg_rounds:(.+)$/, (ctx) => {
  const packageId = ctx.match[1];
  return handleAdminPackageRounds(ctx, adminDeps, packageId);
});

bot.callbackQuery(/^admin_pkg_price:(.+)$/, (ctx) => {
  const packageId = ctx.match[1];
  return handleAdminPackagePrice(ctx, adminDeps, packageId);
});

bot.callbackQuery(/^admin_pkg_toggle:(.+)$/, (ctx) => {
  const packageId = ctx.match[1];
  return handleAdminPackageToggle(ctx, adminDeps, packageId);
});

bot.callbackQuery(/^admin_pkg_delete:(.+)$/, (ctx) => {
  const packageId = ctx.match[1];
  return handleAdminPackageDelete(ctx, adminDeps, packageId);
});

// Statistics callbacks
bot.callbackQuery("admin_stats_ai", (ctx) => handleAdminStatsAI(ctx, adminDeps));
bot.callbackQuery("admin_stats_finance", (ctx) => handleAdminStatsFinance(ctx, adminDeps));
bot.callbackQuery("admin_stats_games", (ctx) => handleAdminStatsGames(ctx, adminDeps));
bot.callbackQuery("admin_stats_charts", (ctx) => handleAdminStatsCharts(ctx, adminDeps));

bot.callbackQuery(/^admin_chart:(.+):(\d+)$/, (ctx) => {
  const metric = ctx.match[1];
  const days = ctx.match[2];
  return handleAdminChart(ctx, adminDeps, metric, days);
});

// Payments events (Stars)
bot.on("pre_checkout_query", (ctx) => handlePreCheckout(ctx));
bot.on("message:successful_payment", (ctx) => handleSuccessfulPayment(ctx, paymentsDeps));

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
        domain: gen.question.domain,
        text: gen.question.text,
        sourceUrl: gen.question.source_url,
      },
      hint1: {
        id: `gen-h1-${Date.now()}`,
        number: gen.answer,
        domain: gen.hint1.domain,
        text: gen.hint1.text,
        sourceUrl: gen.hint1.source_url,
      },
      hint2: {
        id: `gen-h2-${Date.now()}`,
        number: gen.answer,
        domain: gen.hint2.domain,
        text: gen.hint2.text,
        sourceUrl: gen.hint2.source_url,
      },
    };

    const roundId = ensureFactsAndRound(db, bundle);

    const q = await verifyWithWikipedia(bundle.question.text, bundle.question.sourceUrl);
    const h1 = await verifyWithWikipedia(bundle.hint1.text, bundle.hint1.sourceUrl);
    const h2 = await verifyWithWikipedia(bundle.hint2.text, bundle.hint2.sourceUrl);

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