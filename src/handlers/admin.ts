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
    .text("🧬 SGR режим", "admin_model_sgr")
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
    { name: "🆓 Mistral 7B (Free)", id: "mistralai/mistral-7b-instruct:free" },
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
    .text("📦 Пакеты и цены", "admin_packages")
    .text("⏱️ Таймеры", "admin_timers")
    .row()
    .text("🚫 Лимиты", "admin_limits")
    .text("✅ Верификация", "admin_game_verify")
    .row()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*Игровые настройки*\n\n` +
    `🎁 Бесплатных раундов: ${config.get("freeRounds")}\n` +
    `💎 Премиум раундов: ${config.get("premiumRounds")}\n` +
    `⏱️ Таймер по умолчанию: ${config.get("defaultTimerSeconds")}с\n` +
    `🚫 Лимит пропусков: ${config.get("skipLimit")}\n` +
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

  try {
    const { getStatsCollector } = await import("../stats/collector");
    const { generationStats } = await import("../generation/sgr-generator");
    
    const collector = getStatsCollector();
    const stats = await collector.getStats();
    const genStats = generationStats.getStats();

    const keyboard = new InlineKeyboard()
      .text("📈 Графики", "admin_stats_charts")
      .text("🤖 AI метрики", "admin_stats_ai")
      .row()
      .text("💰 Финансы", "admin_stats_finance")
      .text("🎮 Игровая активность", "admin_stats_games")
      .row()
      .text("🔄 Обновить", "admin_stats")
      .text("⬅️ Назад", "admin_menu");

    const statsText = [
      `*📊 Общая статистика*`,
      ``,
      `*👥 Пользователи*`,
      `├ Всего: ${stats.totalUsers}`,
      `├ Активных сегодня: ${stats.activeUsersToday}`,
      `├ Активных за неделю: ${stats.activeUsersWeek}`,
      `├ Новых сегодня: ${stats.newUsersToday}`,
      `└ Премиум: ${stats.premiumUsers}`,
      ``,
      `*🎮 Игры и раунды*`,
      `├ Всего игр: ${stats.totalGames}`,
      `├ Всего раундов: ${stats.totalRounds}`,
      `├ Раундов сегодня: ${stats.roundsToday}`,
      `├ Раундов за неделю: ${stats.roundsWeek}`,
      `└ Среднее раундов/игру: ${stats.avgRoundsPerGame}`,
      ``,
      `*🤖 Генерация (БД)*`,
      `├ Всего генераций: ${stats.totalGenerations}`,
      `├ Сегодня: ${stats.generationsToday}`,
      `├ Успешность: ${stats.generationSuccessRate}`,
      `└ Среднее время: ${stats.avgGenerationTime}мс`,
      ``,
      `*🤖 Генерация (Сессия)*`,
      `├ Всего: ${genStats.total}`,
      `├ Успешных: ${genStats.successful}`,
      `└ Успешность: ${genStats.successRate}`,
      ``,
      `*⏱️ Система*`,
      `└ Аптайм: ${stats.uptimeHours}ч`
    ].join('\n');

    await ctx.editMessageText(statsText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  } catch (error) {
    logger.error("Failed to get stats", { error });
    
    const keyboard = new InlineKeyboard()
      .text("⬅️ Назад", "admin_menu");
      
    await ctx.editMessageText(
      `*📊 Статистика бота*\n\n` +
      `❌ Ошибка при получении статистики\n\n` +
      `_Убедитесь, что коллектор статистики инициализирован_`,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard 
      }
    );
  }
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
    ctx.session.adminData = undefined;
    await ctx.reply("❌ Действие отменено");
    return true;
  }

  const config = ConfigManager.getInstance();

  switch (mode) {
    case "editing_prompt":
      try {
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

        const key = mode === "setting_free_rounds" ? "freeRounds" : "premiumRounds";
        config.set(key, rounds);
        ctx.session.adminMode = undefined;
        
        await ctx.reply(`✅ Установлено раундов: ${rounds}`);
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при установке количества раундов");
        return true;
      }

    case "setting_package_name":
    case "setting_package_rounds":
    case "setting_package_price":
      try {
        const packageId = ctx.session.adminData as string;
        if (!packageId) {
          await ctx.reply("❌ Ошибка: ID пакета не найден");
          return true;
        }

        let updates: any = {};
        
        if (mode === "setting_package_name") {
          updates.name = text;
        } else if (mode === "setting_package_rounds") {
          const rounds = parseInt(text);
          if (isNaN(rounds) || rounds < 1) {
            await ctx.reply("❌ Количество должно быть положительным числом");
            return true;
          }
          updates.rounds = rounds;
        } else {
          const price = parseInt(text);
          if (isNaN(price) || price < 1) {
            await ctx.reply("❌ Цена должна быть положительным числом");
            return true;
          }
          updates.priceStars = price;
        }

        config.updatePackage(packageId, updates);
        ctx.session.adminMode = undefined;
        ctx.session.adminData = undefined;
        
        await ctx.reply("✅ Пакет успешно обновлен!");
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при обновлении пакета");
        return true;
      }

    case "setting_timer":
      try {
        const seconds = parseInt(text);
        const key = ctx.session.adminData as string;
        
        if (isNaN(seconds) || seconds < 10) {
          await ctx.reply("❌ Время должно быть не менее 10 секунд");
          return true;
        }

        config.set(key as any, seconds);
        ctx.session.adminMode = undefined;
        ctx.session.adminData = undefined;
        
        await ctx.reply(`✅ Таймер установлен: ${seconds} сек`);
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при установке таймера");
        return true;
      }

    case "setting_limit":
      try {
        const limit = parseInt(text);
        const key = ctx.session.adminData as string;
        
        if (isNaN(limit) || limit < 0) {
          await ctx.reply("❌ Лимит должен быть неотрицательным числом");
          return true;
        }

        config.set(key as any, limit);
        ctx.session.adminMode = undefined;
        ctx.session.adminData = undefined;
        
        await ctx.reply(`✅ Лимит установлен: ${limit}`);
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при установке лимита");
        return true;
      }

    case "editing_welcome":
      try {
        config.set("welcomeMessage", text);
        ctx.session.adminMode = undefined;
        
        await ctx.reply("✅ Приветственное сообщение обновлено!");
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при сохранении сообщения");
        return true;
      }

    case "editing_maintenance":
      try {
        config.set("maintenanceMessage", text);
        ctx.session.adminMode = undefined;
        
        await ctx.reply("✅ Сообщение об обслуживании обновлено!");
        return true;
      } catch (error) {
        await ctx.reply("❌ Ошибка при сохранении сообщения");
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

// Обработчики для настройки бесплатных/премиум раундов
export async function handleAdminGameFree(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_free_rounds";
  
  await ctx.editMessageText(
    "*Настройка бесплатных раундов*\n\n" +
    "Введите количество бесплатных раундов для новых пользователей.\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("freeRounds") + "_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminGamePremium(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_premium_rounds";
  
  await ctx.editMessageText(
    "*Настройка премиум раундов*\n\n" +
    "Введите количество раундов для премиум пользователей.\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("premiumRounds") + "_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

// Переключатель верификации
export async function handleAdminGameVerify(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    const newValue = !config.get("verificationEnabled");
    config.set("verificationEnabled", newValue);
    
    await ctx.answerCallbackQuery(
      newValue ? "✅ Верификация включена" : "❌ Верификация выключена"
    );
    await handleAdminGame(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при изменении настройки");
  }
}

// Управление пакетами
export async function handleAdminPackages(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const packages = config.getPackages();

  const keyboard = new InlineKeyboard();
  
  for (const pkg of packages) {
    keyboard.text(
      `${pkg.name} (${pkg.rounds} вопросов - ${pkg.priceStars}⭐)`,
      `admin_package:${pkg.id}`
    ).row();
  }
  
  keyboard
    .text("➕ Добавить пакет", "admin_package_add")
    .row()
    .text("⬅️ Назад", "admin_game");

  await ctx.editMessageText(
    "*📦 Игровые пакеты*\n\n" +
    "Выберите пакет для редактирования:",
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Редактирование пакета
export async function handleAdminPackageEdit(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, packageId: string) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const pkg = config.getPackage(packageId);
  
  if (!pkg) {
    await ctx.answerCallbackQuery("❌ Пакет не найден");
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("📝 Изменить название", `admin_pkg_name:${packageId}`)
    .text("🔢 Изменить количество", `admin_pkg_rounds:${packageId}`)
    .row()
    .text("💰 Изменить цену", `admin_pkg_price:${packageId}`)
    .text(pkg.isActive ? "🔴 Деактивировать" : "🟢 Активировать", `admin_pkg_toggle:${packageId}`)
    .row()
    .text("🗑️ Удалить пакет", `admin_pkg_delete:${packageId}`)
    .row()
    .text("⬅️ Назад", "admin_packages");

  await ctx.editMessageText(
    `*Редактирование пакета*\n\n` +
    `📦 Название: ${pkg.name}\n` +
    `🔢 Вопросов: ${pkg.rounds}\n` +
    `💰 Цена: ${pkg.priceStars} ⭐\n` +
    `📊 Статус: ${pkg.isActive ? "✅ Активен" : "❌ Неактивен"}\n` +
    (pkg.description ? `📝 Описание: ${pkg.description}` : ""),
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Управление таймерами
export async function handleAdminTimers(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();

  const keyboard = new InlineKeyboard()
    .text("⏱️ Таймер по умолчанию", "admin_timer_default")
    .text("⏰ Макс. таймер", "admin_timer_max")
    .row()
    .text("⬅️ Назад", "admin_game");

  await ctx.editMessageText(
    `*⏱️ Настройки таймеров*\n\n` +
    `Таймер по умолчанию: ${config.get("defaultTimerSeconds")} сек\n` +
    `Максимальный таймер: ${config.get("maxTimerSeconds")} сек`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Управление лимитами
export async function handleAdminLimits(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();

  const keyboard = new InlineKeyboard()
    .text("🎮 Макс. раундов в сессии", "admin_limit_session")
    .text("🚫 Лимит пропусков", "admin_limit_skip")
    .row()
    .text("📊 Дневной лимит генераций", "admin_limit_daily")
    .row()
    .text("⬅️ Назад", "admin_game");

  await ctx.editMessageText(
    `*🚫 Настройки лимитов*\n\n` +
    `🎮 Макс. раундов в сессии: ${config.get("maxSessionRounds")}\n` +
    `🚫 Лимит пропусков: ${config.get("skipLimit")}\n` +
    `📊 Дневной лимит генераций: ${config.get("maxDailyGenerations")}`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Настройки уведомлений и обслуживания
export async function handleAdminNotifications(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();

  const keyboard = new InlineKeyboard()
    .text(
      config.get("adminNotifications") ? "🔔 Выкл. уведомления" : "🔕 Вкл. уведомления",
      "admin_toggle_notifications"
    )
    .row()
    .text("💬 Изменить приветствие", "admin_edit_welcome")
    .row()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*🔔 Настройки уведомлений*\n\n` +
    `Админ-уведомления: ${config.get("adminNotifications") ? "✅ Включены" : "❌ Выключены"}\n\n` +
    `_Приветственное сообщение можно настроить_`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Режим обслуживания
export async function handleAdminMaintenance(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const isEnabled = config.get("maintenanceMode");

  const keyboard = new InlineKeyboard()
    .text(
      isEnabled ? "🟢 Выключить режим" : "🔴 Включить режим",
      "admin_toggle_maintenance"
    )
    .row()
    .text("✏️ Изменить сообщение", "admin_edit_maintenance")
    .row()
    .text("⬅️ Назад", "admin_menu");

  await ctx.editMessageText(
    `*🛠️ Режим обслуживания*\n\n` +
    `Статус: ${isEnabled ? "🔴 Включен" : "🟢 Выключен"}\n\n` +
    `Сообщение пользователям:\n_${config.get("maintenanceMessage")}_`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Обработчики для переключателей
export async function handleAdminToggleMaintenance(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    const newValue = !config.get("maintenanceMode");
    config.set("maintenanceMode", newValue);
    
    await ctx.answerCallbackQuery(
      newValue ? "🔴 Режим обслуживания включен" : "🟢 Режим обслуживания выключен"
    );
    await handleAdminMaintenance(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при изменении настройки");
  }
}

export async function handleAdminToggleNotifications(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    const newValue = !config.get("adminNotifications");
    config.set("adminNotifications", newValue);
    
    await ctx.answerCallbackQuery(
      newValue ? "🔔 Уведомления включены" : "🔕 Уведомления выключены"
    );
    await handleAdminNotifications(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при изменении настройки");
  }
}

// Редактирование сообщений
export async function handleAdminEditWelcome(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "editing_welcome";
  
  const current = ConfigManager.getInstance().get("welcomeMessage");
  
  await ctx.editMessageText(
    "*Редактирование приветственного сообщения*\n\n" +
    "Текущее сообщение:\n" +
    `_${current || "Используется стандартное"}_\n\n` +
    "Отправьте новое сообщение или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminEditMaintenance(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "editing_maintenance";
  
  await ctx.editMessageText(
    "*Редактирование сообщения об обслуживании*\n\n" +
    "Текущее сообщение:\n" +
    `_${ConfigManager.getInstance().get("maintenanceMessage")}_\n\n` +
    "Отправьте новое сообщение или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

// Обработчики для редактирования пакетов
export async function handleAdminPackageName(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, packageId: string) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_package_name";
  ctx.session.adminData = packageId;
  
  await ctx.editMessageText(
    "*Изменение названия пакета*\n\n" +
    "Введите новое название пакета.\n\n" +
    "Отправьте текст или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminPackageRounds(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, packageId: string) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_package_rounds";
  ctx.session.adminData = packageId;
  
  await ctx.editMessageText(
    "*Изменение количества вопросов*\n\n" +
    "Введите количество вопросов в пакете.\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminPackagePrice(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, packageId: string) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_package_price";
  ctx.session.adminData = packageId;
  
  await ctx.editMessageText(
    "*Изменение цены пакета*\n\n" +
    "Введите цену в звездах Telegram (Stars).\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminPackageToggle(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, packageId: string) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    const pkg = config.getPackage(packageId);
    if (!pkg) {
      await ctx.answerCallbackQuery("❌ Пакет не найден");
      return;
    }

    config.updatePackage(packageId, { isActive: !pkg.isActive });
    
    await ctx.answerCallbackQuery(
      pkg.isActive ? "❌ Пакет деактивирован" : "✅ Пакет активирован"
    );
    await handleAdminPackageEdit(ctx, deps, packageId);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при изменении пакета");
  }
}

export async function handleAdminPackageDelete(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, packageId: string) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    config.removePackage(packageId);
    
    await ctx.answerCallbackQuery("🗑️ Пакет удален");
    await handleAdminPackages(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при удалении пакета");
  }
}

// Обработчики для таймеров
export async function handleAdminTimerDefault(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_timer";
  ctx.session.adminData = "defaultTimerSeconds";
  
  await ctx.editMessageText(
    "*Настройка таймера по умолчанию*\n\n" +
    "Введите время в секундах (от 10 до 300).\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("defaultTimerSeconds") + " сек_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminTimerMax(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_timer";
  ctx.session.adminData = "maxTimerSeconds";
  
  await ctx.editMessageText(
    "*Настройка максимального таймера*\n\n" +
    "Введите максимальное время в секундах (от 60 до 600).\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("maxTimerSeconds") + " сек_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

// Обработчики для лимитов
export async function handleAdminLimitSession(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_limit";
  ctx.session.adminData = "maxSessionRounds";
  
  await ctx.editMessageText(
    "*Настройка лимита раундов в сессии*\n\n" +
    "Введите максимальное количество раундов в одной игровой сессии.\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("maxSessionRounds") + "_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminLimitSkip(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_limit";
  ctx.session.adminData = "skipLimit";
  
  await ctx.editMessageText(
    "*Настройка лимита пропусков*\n\n" +
    "Введите максимальное количество пропусков за сессию.\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("skipLimit") + "_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

export async function handleAdminLimitDaily(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  ctx.session.adminMode = "setting_limit";
  ctx.session.adminData = "maxDailyGenerations";
  
  await ctx.editMessageText(
    "*Настройка дневного лимита генераций*\n\n" +
    "Введите максимальное количество генераций в день.\n\n" +
    "_Текущее значение: " + ConfigManager.getInstance().get("maxDailyGenerations") + "_\n\n" +
    "Отправьте число или /cancel для отмены",
    { parse_mode: "Markdown" }
  );
}

// Детальная статистика AI
export async function handleAdminStatsAI(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const { generationStats } = await import("../generation/sgr-generator");
    const genStats = generationStats.getStats();
    
    const keyboard = new InlineKeyboard()
      .text("⬅️ Назад", "admin_stats");

    let statsText = `*🤖 Детальная статистика AI*\n\n`;
    
    // Статистика по моделям
    statsText += `*Статистика по моделям:*\n`;
    for (const [model, data] of Object.entries(genStats.byModel)) {
      const modelData = data as any;
      statsText += `\n*${model}*\n`;
      statsText += `├ Всего запросов: ${modelData.total}\n`;
      statsText += `├ Успешных: ${modelData.success}\n`;
      statsText += `├ Успешность: ${modelData.successRate}\n`;
      statsText += `├ Среднее время: ${Math.round(modelData.avgDuration)}мс\n`;
      statsText += `└ Средние попытки: ${modelData.avgAttempts.toFixed(1)}\n`;
    }
    
    // Последние ошибки
    if (genStats.recentErrors.length > 0) {
      statsText += `\n*Последние ошибки:*\n`;
      genStats.recentErrors.slice(0, 5).forEach((err: any) => {
        statsText += `• ${err.model}: ${err.error}\n`;
      });
    }

    await ctx.editMessageText(statsText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при загрузке статистики");
  }
}

// Финансовая статистика
export async function handleAdminStatsFinance(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const { getStatsCollector } = await import("../stats/collector");
    const collector = getStatsCollector();
    const stats = await collector.getStats();
    
    const keyboard = new InlineKeyboard()
      .text("⬅️ Назад", "admin_stats");

    let statsText = `*💰 Финансовая статистика*\n\n`;
    
    statsText += `*Общие показатели:*\n`;
    statsText += `├ Общий доход: ${stats.totalRevenue} ⭐\n`;
    statsText += `├ Доход сегодня: ${stats.revenueToday} ⭐\n`;
    statsText += `└ Премиум пользователей: ${stats.premiumUsers}\n\n`;
    
    statsText += `*Продажи по пакетам:*\n`;
    const config = ConfigManager.getInstance();
    const packages = config.getPackages();
    
    for (const pkg of packages) {
      const sold = stats.packagesSold[pkg.id] || 0;
      const revenue = sold * pkg.priceStars;
      statsText += `\n*${pkg.name}*\n`;
      statsText += `├ Продано: ${sold}\n`;
      statsText += `├ Цена: ${pkg.priceStars} ⭐\n`;
      statsText += `└ Доход: ${revenue} ⭐\n`;
    }

    await ctx.editMessageText(statsText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при загрузке статистики");
  }
}

// Игровая активность
export async function handleAdminStatsGames(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const { getStatsCollector } = await import("../stats/collector");
    const collector = getStatsCollector();
    const stats = await collector.getStats();
    
    const keyboard = new InlineKeyboard()
      .text("⬅️ Назад", "admin_stats");

    let statsText = `*🎮 Игровая активность*\n\n`;
    
    statsText += `*Общие показатели:*\n`;
    statsText += `├ Всего игр: ${stats.totalGames}\n`;
    statsText += `├ Всего раундов: ${stats.totalRounds}\n`;
    statsText += `├ Среднее раундов/игру: ${stats.avgRoundsPerGame}\n`;
    statsText += `├ Пропусков использовано: ${stats.skipUsage}\n`;
    statsText += `└ Средний рейтинг: ${stats.avgRating.toFixed(1)} (${stats.totalRatings} оценок)\n\n`;
    
    statsText += `*Активность:*\n`;
    statsText += `├ Раундов сегодня: ${stats.roundsToday}\n`;
    statsText += `├ Раундов за неделю: ${stats.roundsWeek}\n`;
    statsText += `└ Активных пользователей: ${stats.activeUsersWeek}\n\n`;
    
    statsText += `*Популярные команды:*\n`;
    const sortedCommands = Object.entries(stats.commandUsage)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5);
    
    for (const [cmd, count] of sortedCommands) {
      statsText += `├ /${cmd}: ${count}\n`;
    }

    await ctx.editMessageText(statsText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при загрузке статистики");
  }
}

// Графики статистики
export async function handleAdminStatsCharts(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const keyboard = new InlineKeyboard()
    .text("📊 Пользователи (7д)", "admin_chart:users:7")
    .text("📊 Пользователи (30д)", "admin_chart:users:30")
    .row()
    .text("🎮 Раунды (7д)", "admin_chart:rounds:7")
    .text("🎮 Раунды (30д)", "admin_chart:rounds:30")
    .row()
    .text("🤖 Генерации (7д)", "admin_chart:generations:7")
    .text("💰 Доход (7д)", "admin_chart:revenue:7")
    .row()
    .text("⬅️ Назад", "admin_stats");

  await ctx.editMessageText(
    `*📈 Графики и аналитика*\n\n` +
    `Выберите метрику и период для отображения:\n\n` +
    `_Данные будут показаны в текстовом формате_`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

// Отображение графика
export async function handleAdminChart(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps, metric: string, days: string) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const { getStatsCollector } = await import("../stats/collector");
    const collector = getStatsCollector();
    const chartData = await collector.getChartData(metric, parseInt(days));
    
    const keyboard = new InlineKeyboard()
      .text("⬅️ Назад", "admin_stats_charts");

    let chartText = `*📊 График: ${getMetricName(metric)} (${days} дней)*\n\n`;
    
    if (chartData.length === 0) {
      chartText += "_Нет данных за выбранный период_";
    } else {
      // Находим максимальное значение для масштабирования
      const maxValue = Math.max(...chartData.map((d: any) => d.value || 0));
      const scale = maxValue > 0 ? 20 / maxValue : 1;
      
      // Отображаем данные
      for (const row of chartData) {
        const data = row as any;
        const date = new Date(data.date).toLocaleDateString('ru-RU', { 
          month: 'short', 
          day: 'numeric' 
        });
        const value = data.value || 0;
        const barLength = Math.round(value * scale);
        const bar = '█'.repeat(Math.max(1, barLength));
        
        chartText += `${date}: ${bar} ${value}\n`;
      }
      
      // Добавляем итоги
      const total = chartData.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
      const avg = chartData.length > 0 ? (total / chartData.length).toFixed(1) : 0;
      
      chartText += `\n*Итого:* ${total}\n`;
      chartText += `*Среднее:* ${avg}`;
    }

    await ctx.editMessageText(chartText, { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    });
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при загрузке данных");
  }
}

function getMetricName(metric: string): string {
  const names: Record<string, string> = {
    users: "Активные пользователи",
    rounds: "Раунды",
    generations: "Генерации",
    revenue: "Доход (⭐)"
  };
  return names[metric] || metric;
}

// Настройки SGR
export async function handleAdminModelSGR(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  const config = ConfigManager.getInstance();
  const useSGR = config.get("useSGR");
  const useExamples = config.get("useExamples");

  const keyboard = new InlineKeyboard()
    .text(useSGR ? "🔴 Выключить SGR" : "🟢 Включить SGR", "admin_toggle_sgr")
    .row()
    .text(useExamples ? "📚 Примеры: ВКЛ" : "📚 Примеры: ВЫКЛ", "admin_toggle_examples")
    .row()
    .text("⬅️ Назад", "admin_model");

  await ctx.editMessageText(
    `*🧬 Настройки SGR (Structured Generation)*\n\n` +
    `SGR - это продвинутая схема генерации с:\n` +
    `• Структурированными промптами\n` +
    `• Строгой валидацией\n` +
    `• Few-shot примерами\n` +
    `• Оптимизацией для Mistral\n\n` +
    `Статус SGR: ${useSGR ? "✅ Включен" : "❌ Выключен"}\n` +
    `Использовать примеры: ${useExamples ? "✅ Да" : "❌ Нет"}\n\n` +
    `_Рекомендуется для бесплатной модели Mistral 7B_`,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard 
    }
  );
}

export async function handleAdminToggleSGR(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    const newValue = !config.get("useSGR");
    config.set("useSGR", newValue);
    
    await ctx.answerCallbackQuery(
      newValue ? "✅ SGR режим включен" : "❌ SGR режим выключен"
    );
    await handleAdminModelSGR(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при изменении настройки");
  }
}

export async function handleAdminToggleExamples(ctx: Context & SessionFlavor<Session>, deps: AdminHandlerDeps) {
  if (!isAdmin(ctx, deps)) return;

  try {
    const config = ConfigManager.getInstance();
    const newValue = !config.get("useExamples");
    config.set("useExamples", newValue);
    
    await ctx.answerCallbackQuery(
      newValue ? "✅ Примеры включены" : "❌ Примеры выключены"
    );
    await handleAdminModelSGR(ctx, deps);
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка при изменении настройки");
  }
}