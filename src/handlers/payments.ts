import { Context } from "grammy";
import { Session } from "../types";

export interface PaymentsDeps {
	sessions: Map<number, Session>;
	bot: any;
	premiumPriceStars: number;
	premiumTotalRounds: number;
}

export async function handlePremiumInfo(ctx: Context, deps: PaymentsDeps): Promise<void> {
	const chatId = ctx.chat?.id;
	if (!chatId) return;

	const session = deps.sessions.get(chatId);
	const isPremium = session?.isPremium === true;
	const freeRounds = session?.freeLimit ?? 20;
	const totalRounds = isPremium ? session?.premiumTotal ?? deps.premiumTotalRounds : freeRounds;

	await ctx.reply(
		[
			"⭐ Премиум-доступ:",
			"",
			`Сейчас доступно: ${totalRounds} раундов${isPremium ? " (премиум)" : " (бесплатно)"}`,
			`Премиум открывает до ${deps.premiumTotalRounds} раундов в сессии`,
			"",
			process.env.ENABLE_STARS === "1"
				? `Цена: ${deps.premiumPriceStars}⭐ (Telegram Stars)`
				: "Оплата Stars временно отключена — можно активировать премиум бесплатно для теста",
		].join("\n"),
		{
			reply_markup: {
				inline_keyboard: [
					[
						{ text: isPremium ? "Премиум активен" : (process.env.ENABLE_STARS === "1" ? "Купить премиум" : "Активировать премиум"), callback_data: "premium:buy" },
					],
				],
			},
		}
	);
}

export async function handlePremiumBuy(ctx: Context, deps: PaymentsDeps): Promise<void> {
	const chatId = ctx.chat?.id;
	if (!chatId) {
		await ctx.answerCallbackQuery();
		return;
	}

	const session = deps.sessions.get(chatId);
	if (!session) {
		await ctx.answerCallbackQuery({ text: "Сессия не найдена. Нажмите /newgame" });
		return;
	}

	if (session.isPremium) {
		await ctx.answerCallbackQuery({ text: "Премиум уже активирован" });
		return;
	}

	// Fallback: if Stars are disabled, activate immediately
	if (process.env.ENABLE_STARS !== "1") {
		session.isPremium = true;
		session.premiumTotal = deps.premiumTotalRounds;
		await ctx.answerCallbackQuery({ text: "Премиум активирован" });
		await ctx.reply("🎉 Премиум активирован. Доступно больше раундов!");
		return;
	}

	// Stars flow: send invoice (currency XTR)
	try {
		await deps.bot.api.sendInvoice(
			chatId,
			"Премиум-доступ",
			`Откроет до ${deps.premiumTotalRounds} раундов в сессии`,
			`premium-${chatId}-${Date.now()}`,
			"",
			"XTR",
			[
				{ label: "Премиум", amount: deps.premiumPriceStars },
			],
			{
				need_name: false,
				need_phone_number: false,
				need_shipping_address: false,
				is_flexible: false,
			}
		);
		await ctx.answerCallbackQuery();
	} catch (e: any) {
		await ctx.answerCallbackQuery({ text: "Не удалось создать счёт" });
		await ctx.reply("Не удалось создать счёт. Попробуйте позже.");
	}
}

export async function handlePreCheckout(ctx: any): Promise<void> {
	try {
		await ctx.answerPreCheckoutQuery(true);
	} catch {
		// ignore
	}
}

export async function handleSuccessfulPayment(ctx: any, deps: PaymentsDeps): Promise<void> {
	const chatId = ctx.chat?.id;
	if (!chatId) return;

	const session = deps.sessions.get(chatId);
	if (session) {
		session.isPremium = true;
		session.premiumTotal = deps.premiumTotalRounds;
	}
	await ctx.reply("🎉 Оплата получена. Премиум активирован!");
	try {
		const { getStatsCollector } = await import("../stats/collector");
		getStatsCollector().logEvent("payment_successful", ctx.from?.id, chatId, {
			package_id: "premium_session",
			price_stars: deps.premiumPriceStars,
		});
	} catch {}
}