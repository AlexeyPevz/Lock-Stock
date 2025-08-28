import { Context, InlineKeyboard } from "grammy";
import { ConfigManager } from "../config/manager";
import { logger } from "../utils/logger";
import { SessionFlavor } from "grammy";
import { Session } from "../types";

export interface AdminHandlerDeps {
  adminIds: Set<number>;
}

// Проверка прав администратора
export function isAdmin(ctx: Context, deps: AdminHandlerDeps): boolean {
  const userId = ctx.from?.id;
  return userId ? deps.adminIds.has(userId) : false;
}

// Главное админ-меню
export async function handleAdminMenu(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) {
    await ctx.reply("⛔ У вас нет прав администратора");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("⚙️ Настройки модели", "admin_model")
    .text("📝 Промпт системы", "admin_prompt")
    .row()
    .text("🎮 Игровые настройки", "admin_game")
    .text("🔔 Уведомления", "admin_notifications")
    .row()
    .text("📊 Статистика", "admin_stats")
    .text("🛠️ Обслуживание", "admin_maintenance")
    .row()
    .text("❌ Закрыть", "admin_close");

  await ctx.reply(
    "🔧 *Админ-панель*\n\nВыберите раздел для настройки:",
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Настройки модели
export async function handleAdminModel(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const modelConfig = config.getModelConfig();

  const keyboard = new InlineKeyboard()
    .text("🤖 Сменить модель", "admin_model_change")
    .text("🌡️ Температура", "admin_model_temp")
    .row()
    .text("🔄 Попытки генерации", "admin_model_attempts")
    .row()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*Настройки модели AI*\n\n` +
    `🤖 Текущая модель: \`${modelConfig.model}\`\n` +
    `🌡️ Температура: ${modelConfig.temperature}\n` +
    `🔄 Макс. попыток: ${modelConfig.maxAttempts}`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Изменение модели
export async function handleAdminModelChange(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const models = [
    { name: "DeepSeek Chat", id: "deepseek/deepseek-chat" },
    { name: "Claude 3 Haiku", id: "anthropic/claude-3-haiku" },
    { name: "GPT-4 Turbo", id: "openai/gpt-4-turbo-preview" },
    { name: "Mixtral 8x7B", id: "mistralai/mixtral-8x7b-instruct" },
    { name: "Llama 3.1 70B", id: "meta-llama/llama-3.1-70b-instruct" },
    { name: "Qwen 2.5 72B", id: "qwen/qwen-2.5-72b-instruct" },
  ];

  const keyboard = new InlineKeyboard();
  
  for (const model of models) {
    keyboard.text(model.name, `admin_set_model:${model.id}`).row();
  }
  
  keyboard.text("⬅️ Назад", "admin_model");

  await ctx.editMessageText(
    "*Выберите модель AI:*\n\n" +
    "_Убедитесь, что выбранная модель доступна в вашем OpenRouter аккаунте_",
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Установка модели
export async function handleAdminSetModel(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, modelId: string) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    config.set("openRouterModel", modelId);

    await ctx.answerCallbackQuery("✅ Модель успешно изменена");
    await handleAdminModel(ctx, deps);
  } catch (error) {
    logger.error("Failed to set model", { error });
    await ctx.answerCallbackQuery("❌ Ошибка при изменении модели");
  }
}

// Настройки промпта
export async function handleAdminPrompt(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const currentPrompt = config.get("systemPrompt");
  const isCustom = !!currentPrompt;

  const keyboard = new InlineKeyboard()
    .text("✏️ Изменить промпт", "admin_prompt_edit")
    .text("🔄 Сбросить на дефолтный", "admin_prompt_reset")
    .row()
    .text("👁️ Показать текущий", "admin_prompt_show")
    .row()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*Настройки системного промпта*\n\n` +
    `Статус: ${isCustom ? "✅ Кастомный" : "📄 Стандартный"}\n\n` +
    `_Системный промпт определяет поведение AI при генерации вопросов_`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Режим редактирования промпта
export async function handleAdminPromptEdit(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "editing_prompt";
  
  await ctx.editMessageText(
    "*Редактирование промпта*\n\n" +
    "Отправьте новый системный промпт в следующем сообщении.\n\n" +
    "_Для отмены отправьте /cancel_",
    { parse_mode: "Markdown" }
  );
}

// Игровые настройки
export async function handleAdminGame(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();

  const keyboard = new InlineKeyboard()
    .text("🎁 Бесплатные раунды", "admin_game_free")
    .text("💎 Премиум раунды", "admin_game_premium")
    .row()
    .text("✅ Верификация", "admin_game_verify")
    .row()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*Игровые настройки*\n\n` +
    `🎁 Бесплатных раундов: ${config.get("freeRounds")}\n` +
    `💎 Премиум раундов: ${config.get("premiumRounds")}\n` +
    `✅ Верификация: ${config.get("verificationEnabled") ? "Включена" : "Выключена"}`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Статистика
export async function handleAdminStats(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  // TODO: Добавить реальную статистику из БД
  const keyboard = new InlineKeyboard()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*📊 Статистика бота*\n\n` +
    `👥 Пользователей: -\n` +
    `🎮 Всего игр: -\n` +
    `❓ Сгенерировано вопросов: -\n` +
    `💎 Премиум пользователей: -\n\n` +
    `_Статистика будет доступна после интеграции с БД_`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Обработка текстовых сообщений в админ-режиме
export async function handleAdminTextInput(
  ctx: Context & SessionFlavor<Session>, 
  deps: AdminHandlerDeps
) {
  if (!isAdmin(ctx, deps) || !ctx.session.adminMode || !ctx.message?.text) return false;

  const text = ctx.message.text;
  const mode = ctx.session.adminMode;

  // Отмена
  if (text === "/cancel") {
    ctx.session.adminMode = undefined;
    await ctx.reply("❌ Действие отменено");
    return true;
  }

  switch (mode) {
    case "editing_prompt":
      try {
        const config = ConfigManager.getInstance();
        config.set("systemPrompt", text);
        ctx.session.adminMode = undefined;
        
        await ctx.reply(
          "✅ Системный промпт успешно обновлен!\n\n" +
          "Новый промпт будет использоваться при следующей генерации."
        );
        return true;
      } catch (error) {
        logger.error("Failed to update prompt", { error });
        await ctx.reply("❌ Ошибка при сохранении промпта");
        return true;
      }

    case "setting_temperature":
      try {
        const temp = parseFloat(text);
        if (isNaN(temp) || temp < 0 || temp > 2) {
          await ctx.reply("❌ Температура должна быть числом от 0 до 2");
          return true;
        }

        const config = ConfigManager.getInstance();
        config.set("temperature", temp);
        ctx.session.adminMode = undefined;
        
        await ctx.reply(`✅ Температура установлена: ${temp}`);
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при установке температуры");
        return true;
      }

    case "setting_free_rounds":
    case "setting_premium_rounds":
      try {
        const rounds = parseInt(text);
        if (isNaN(rounds) || rounds < 1) {
          await ctx.reply("❌ Количество раундов должно быть положительным числом");
          return true;
        }

        const config = ConfigManager.getInstance();
        const key = mode === "setting_free_rounds" ? "freeRounds" : "premiumRounds";
        config.set(key, rounds);
        ctx.session.adminMode = undefined;
        
        await ctx.reply(`✅ Установлено раундов: ${rounds}`);
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при установке количества раундов");
        return true;
      }
  }

  return false;
}

// Дополнительные обработчики для inline кнопок
export async function handleAdminClose(ctx: Context) {
  await ctx.deleteMessage();
}

export async function handleAdminPromptReset(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    config.set("systemPrompt", undefined);
    
    await ctx.answerCallbackQuery("✅ Промпт сброшен на стандартный");
    await handleAdminPrompt(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при сбросе промпта");
  }
}

export async function handleAdminPromptShow(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const prompt = config.getSystemPrompt();
  
  // Разбиваем длинный промпт на части
  const maxLength = 4000;
  if (prompt.length > maxLength) {
    const parts = Math.ceil(prompt.length / maxLength);
    for (let i = 0; i < parts; i++) {
      const start = i * maxLength;
      const end = Math.min(start + maxLength, prompt.length);
      const part = prompt.substring(start, end);
      
      await ctx.reply(
        `*Системный промпт (часть ${i + 1}/${parts}):*\n\n\`\`\`\n${part}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    }
  } else {
    await ctx.reply(
      `*Системный промпт:*\n\n\`\`\`\n${prompt}\n\`\`\``,
      { parse_mode: "Markdown" }
    );
  }
}

// Настройки температуры
export async function handleAdminModelTemp(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_temperature";
  
  await ctx.editMessageText(
    "*Настройка температуры*\n\n" +
    "Температура влияет на креативность AI:\n" +
    "• 0.0 - Максимально предсказуемые ответы\n" +
    "• 0.7 - Сбалансированная креативность (рекомендуется)\n" +
    "• 2.0 - Максимальная креативность\n\n" +
    "Отправьте число от 0 до 2:",
    { parse_mode: "Markdown" }
  );
}

// Настройки попыток
export async function handleAdminModelAttempts(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const keyboard = new InlineKeyboard();
  
  for (let i = 1; i <= 10; i++) {
    keyboard.text(i.toString(), `admin_set_attempts:${i}`);
    if (i % 5 === 0) keyboard.row();
  }
  
  keyboard.row().text("⬅️ Назад", "admin_model");

  await ctx.editMessageText(
    "*Максимальное количество попыток генерации*\n\n" +
    "Если генерация не проходит валидацию, система попробует еще раз.\n" +
    "Выберите максимальное количество попыток:",
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

export async function handleAdminSetAttempts(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, attempts: number) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    config.set("maxAttempts", attempts);
    
    await ctx.answerCallbackQuery(`✅ Установлено попыток: ${attempts}`);
    await handleAdminModel(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при установке попыток");
  }
}