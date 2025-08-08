import { Bot, InlineKeyboard, Context, session, SessionFlavor } from "grammy";
import dotenv from "dotenv";
import { z } from "zod";
import { RoundBundle, Session as GameSession, RevealState } from "./types";
// import { sampleRounds } from "./data/sampleRounds";
import { loadPack } from "./content/provider";
import { renderRoundText } from "./utils/render";
import { generateOneRound } from "./generation/generator";
import { openDb } from "./db/client";
import { selectNextRound, markRoundSeen } from "./db/selector";
import { getRoundBundleById } from "./db/rounds";
import { upsertFact as upsertFactDb, upsertRound as upsertRoundDb } from "./db/upsert";
import { saveRoundFeedback } from "./db/feedback";

dotenv.config();

const EnvSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ADMIN_USER_IDS: z.string().optional(),
  FREE_ROUNDS: z.string().optional(),
  PREMIUM_ROUNDS: z.string().optional(),
});

const parsedEnv = EnvSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error("Environment error:", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

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

// In-memory sessions by chat id
const sessions = new Map<number, GameSession>();
const db = openDb();

// Session middleware placeholder (using grammy session for per-user misc if needed)
interface BotSessionData { /* future */ }

type MyContext = Context & SessionFlavor<BotSessionData>;

const bot = new Bot<MyContext>(BOT_TOKEN);

bot.api.setMyCommands([
  { command: "start", description: "Начать" },
  { command: "newgame", description: "Новая игра (пачка раундов)" },
  { command: "rules", description: "Правила (кратко)" },
  { command: "premium", description: "Премиум и Stars" },
  { command: "gen", description: "[админ] Сгенерировать N раундов" },
  { command: "help", description: "Помощь" },
]);

bot.use(
  session({
    initial: (): BotSessionData => ({}),
  })
);

function createInitialReveal(): RevealState {
  return { showQuestion: true, showHint1: false, showHint2: false, showAnswer: false };
}

function buildHostKeyboard(state: RevealState, canSkip: boolean) {
  const k = new InlineKeyboard();
  k.text(state.showQuestion ? "Вопрос ✓" : "Показать вопрос", "reveal:question");
  k.row();
  k.text(state.showHint1 ? "Подсказка 1 ✓" : "Показать подсказку 1", "reveal:hint1");
  k.row();
  k.text(state.showHint2 ? "Подсказка 2 ✓" : "Показать подсказку 2", "reveal:hint2");
  k.row();
  k.text(state.showAnswer ? "Ответ ✓" : "Показать ответ", "reveal:answer");
  k.row();
  k.text("Таймер 30", "timer:30").text("Таймер 60", "timer:60").text("Таймер 90", "timer:90");
  k.row();
  if (canSkip) k.text("Скип раунда", "round:skip");
  k.text("Правила", "show:rules");
  return k;
}

function buildFeedbackKeyboard(roundId: string, number: number) {
  const k = new InlineKeyboard();
  k.text("★1", `fb:rate:${roundId}:${number}:1`).text("★2", `fb:rate:${roundId}:${number}:2`).text("★3", `fb:rate:${roundId}:${number}:3`).row();
  k.text("★4", `fb:rate:${roundId}:${number}:4`).text("★5", `fb:rate:${roundId}:${number}:5`).row();
  k.text("Сложно", `fb:cat:${roundId}:${number}:hard`).text("Легко", `fb:cat:${roundId}:${number}:easy`).row();
  k.text("Спорно", `fb:cat:${roundId}:${number}:controversial`).text("Узкая тема", `fb:cat:${roundId}:${number}:niche`).row();
  k.text("Формулировка", `fb:cat:${roundId}:${number}:wording`).text("Устарело", `fb:cat:${roundId}:${number}:outdated`);
  return k;
}

function getOrCreateSession(chatId: number): GameSession {
  const existing = sessions.get(chatId);
  if (existing) return existing;
  const gs: GameSession = {
    chatId,
    rounds: [],
    currentIndex: 0,
    revealed: {},
    freeLimit: DEFAULT_FREE,
    premiumTotal: DEFAULT_PREMIUM,
    isPremium: false,
  };
  sessions.set(chatId, gs);
  return gs;
}

let cachedPack: RoundBundle[] | null = null;
function reloadContentPack(): RoundBundle[] {
  cachedPack = loadPack(CONTENT_PACK_PATH);
  return cachedPack;
}

function selectRoundsForSession(isPremium: boolean): RoundBundle[] {
  const pack = cachedPack ?? reloadContentPack();
  const total = isPremium ? DEFAULT_PREMIUM : DEFAULT_FREE;
  return pack.slice(0, Math.min(total, pack.length));
}

function toBundleFromGenerated(gen: {question: string; hint1: string; hint2: string; answer: number;}): RoundBundle {
  const idBase = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Domain detection could be added; for now keep "other"
  return {
    number: gen.answer,
    question: { id: `${idBase}-q`, number: gen.answer, domain: "other", text: gen.question },
    hint1: { id: `${idBase}-h1`, number: gen.answer, domain: "other", text: gen.hint1 },
    hint2: { id: `${idBase}-h2`, number: gen.answer, domain: "other", text: gen.hint2 },
  };
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Lock Stock Question Bot — офлайн-помощник для домашней игры. Используйте /newgame, чтобы начать новую пачку раундов."
  );
});

bot.command("rules", async (ctx) => {
  await ctx.reply(
    [
      "Краткие правила:",
      "- В начале раунда все делают обязательную ставку и пишут ответ (менять нельзя)",
      "- Можно: рейз, чек (бесплатная подсказка), пас",
      "- Ведущий по кнопкам открывает Подсказку 1, Подсказку 2 и Ответ",
      "- После каждой подсказки — новые решения",
      "- Побеждает ответ ближе к правильному",
    ].join("\n")
  );
});

bot.command("premium", async (ctx) => {
  await ctx.reply(
    "Премиум: +10 раундов в сессии за Telegram Stars (MVP: заглушка). Доступно 5 бесплатных раундов."
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply("Команды: /start, /newgame, /rules, /premium, /help");
});

bot.command("newgame", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const session = getOrCreateSession(chatId);
  session.isPremium = false; // start as free
  session.rounds = selectRoundsForSession(session.isPremium);
  session.currentIndex = 0;
  session.revealed = {};

  await sendOrUpdateRound(ctx, session);
});

async function sendOrUpdateRound(ctx: MyContext, session: GameSession) {
  const chatId = session.chatId;
  const userId = ctx.from?.id || chatId; // group host treated as user

  const index = session.currentIndex;
  if (index >= session.rounds.length) {
    // Try to fetch a new round from DB (unique by user)
    const picked = selectNextRound(db, userId);
    if (!picked) {
      await ctx.reply("Раунды закончились! Спасибо за игру.");
      return;
    }
    const bundle = getRoundBundleById(db, picked.round_id);
    if (!bundle) {
      await ctx.reply("Ошибка загрузки раунда из базы");
      return;
    }
    markRoundSeen(db, userId, picked.round_id, picked.number);

    // Render full round
    const state = createInitialReveal();
    const text = renderRoundText(bundle, state);
    session.roundIds = session.roundIds || {};
    session.roundIds[session.currentIndex] = picked.round_id;
    const keyboard = buildHostKeyboard(state, allowSkipForSession(session));
    await ctx.reply(text, { reply_markup: keyboard });
    return;
  }
  const round = session.rounds[index];
  const state = session.revealed[index] || createInitialReveal();
  session.revealed[index] = state;

  const text = renderRoundText(round, state);
  const canSkip = allowSkipForSession(session);
  const keyboard = buildHostKeyboard(state, canSkip);
  await ctx.reply(text, { reply_markup: keyboard });
}

function allowSkipForSession(session: GameSession): boolean {
  // MVP: разрешаем 2 скипа за сессию
  const usedSkips = Object.values(session.revealed).filter((s) => s.showAnswer && s.showQuestion && s.showHint1 && s.showHint2).length;
  return usedSkips < 2;
}

bot.callbackQuery(/reveal:(question|hint1|hint2|answer)/, async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return ctx.answerCallbackQuery();
  const session = getOrCreateSession(chatId);
  const index = session.currentIndex;
  if (index >= session.rounds.length) return ctx.answerCallbackQuery();

  const state = session.revealed[index] || createInitialReveal();
  session.revealed[index] = state;
  const [, what] = ctx.callbackQuery.data.split(":");
  if (what === "question") state.showQuestion = true;
  if (what === "hint1") state.showHint1 = true;
  if (what === "hint2") state.showHint2 = true;
  if (what === "answer") state.showAnswer = true;

  const round = session.rounds[index];
  const replyMarkup = state.showAnswer && session.roundIds?.[index]
    ? buildFeedbackKeyboard(session.roundIds[index], round.number)
    : buildHostKeyboard(state, allowSkipForSession(session));
  await ctx.editMessageText(renderRoundText(round, state), {
    reply_markup: replyMarkup,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/fb:(rate|cat):(.+?):(\d+):(\w+)/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.answerCallbackQuery();
  const [, kind, roundId, numberStr, value] = ctx.match as unknown as [string, string, string, string, string];
  const number = Number(numberStr);
  if (kind === "rate") {
    const rating = Number(value);
    if (rating >= 1 && rating <= 5) saveRoundFeedback(db, userId, roundId, number, rating, null);
  } else if (kind === "cat") {
    saveRoundFeedback(db, userId, roundId, number, null, value);
  }
  await ctx.answerCallbackQuery({ text: "Спасибо за отзыв!" });
});

bot.callbackQuery("round:skip", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return ctx.answerCallbackQuery();
  const session = getOrCreateSession(chatId);

  if (!allowSkipForSession(session)) {
    await ctx.answerCallbackQuery({ text: "Лимит скипов исчерпан", show_alert: true });
    return;
  }
  session.currentIndex += 1;
  // reset message by sending a new one
  await ctx.answerCallbackQuery();
  await sendOrUpdateRound(ctx, session);
});

bot.callbackQuery("show:rules", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      "Краткие правила:",
      "- Обязательная ставка, ответ пишется один раз",
      "- Чек = получить подсказку без ставок",
      "- После каждой подсказки — новые решения",
      "- Побеждает ближайший к правильному ответ",
    ].join("\n")
  );
});

bot.callbackQuery(/timer:(30|60|90)/, async (ctx) => {
  const seconds = Number(ctx.match![1]);
  await ctx.answerCallbackQuery();
  const message = await ctx.reply(`Таймер: ${seconds}с`);

  const checkpoints = [Math.floor(seconds / 2), 10, 5, 0]
    .filter((s, i, arr) => s > 0 || i === arr.length - 1)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .sort((a, b) => b - a);

  for (const cp of checkpoints) {
    const delay = (seconds - cp) * 1000;
    setTimeout(async () => {
      try {
        if (cp > 0) {
          await ctx.api.editMessageText(message.chat.id, message.message_id, `Таймер: ${cp}с`);
        } else {
          await ctx.api.editMessageText(message.chat.id, message.message_id, "Таймер: стоп");
        }
      } catch {
        // ignore edit errors
      }
    }, delay);
  }
});

bot.command("gen", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ADMIN_IDS.has(userId)) {
    await ctx.reply("Недостаточно прав");
    return;
  }
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const session = getOrCreateSession(chatId);

  const text = ctx.message?.text || "";
  const parts = text.split(/\s+/);
  const count = Math.min(Math.max(Number(parts[1] || 1) || 1, 1), 15);
  await ctx.reply(`Генерация ${count} раунд(ов)…`);

  const generated: RoundBundle[] = [];
  const seenAnswers = new Set<number>();
  // include answers already used in current pack/session to avoid reuse
  for (const r of session.rounds) seenAnswers.add(r.number);
  if (cachedPack) for (const r of cachedPack) seenAnswers.add(r.number);

  for (let i = 0; i < count; i++) {
    try {
      let attempt = 0;
      while (attempt < 3) {
        attempt += 1;
        const gen = await generateOneRound();
        if (seenAnswers.has(gen.answer)) {
          continue; // regenerate silently per rule 8
        }
        seenAnswers.add(gen.answer);
        generated.push(toBundleFromGenerated(gen));
        break;
      }
    } catch (e: any) {
      await ctx.reply(`Ошибка генерации: ${e?.message ?? e}`);
      break;
    }
  }

  if (generated.length === 0) {
    await ctx.reply("Не удалось сгенерировать раунды");
    return;
  }

  // Save into DB for future reuse
  for (const r of generated) {
    upsertFactDb(db, r.question);
    upsertFactDb(db, r.hint1);
    upsertFactDb(db, r.hint2);
    upsertRoundDb(db, r);
  }

  session.isPremium = false;
  session.rounds = generated.concat(selectRoundsForSession(session.isPremium));
  session.currentIndex = 0;
  session.revealed = {};

  await sendOrUpdateRound(ctx, session);
});

bot.command("reload", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ADMIN_IDS.has(userId)) {
    await ctx.reply("Недостаточно прав");
    return;
  }
  try {
    const rounds = reloadContentPack();
    await ctx.reply(`Пак перезагружен: ${rounds.length} раундов`);
  } catch (e: any) {
    await ctx.reply(`Ошибка перезагрузки: ${e?.message ?? e}`);
  }
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

if (process.env.NODE_ENV !== "test") {
  bot.start().then(() => console.log("Bot started"));
}