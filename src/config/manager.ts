import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import { logger } from "../utils/logger";

// Схема для игровых пакетов
export const GamePackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  rounds: z.number().min(1),
  priceStars: z.number().min(1),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Схема конфигурации бота
export const BotConfigSchema = z.object({
  // AI настройки
  openRouterModel: z.string().default("deepseek/deepseek-chat"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxAttempts: z.number().min(1).max(10).default(3),
  
  // Игровые настройки
  freeRounds: z.number().min(1).default(5),
  premiumRounds: z.number().min(1).default(50),
  verificationEnabled: z.boolean().default(true),
  skipLimit: z.number().min(0).default(3),
  
  // Пакеты и цены
  packages: z.array(GamePackageSchema).default([
    { id: "small", name: "Маленький пакет", rounds: 10, priceStars: 50, isActive: true },
    { id: "medium", name: "Средний пакет", rounds: 20, priceStars: 90, isActive: true },
    { id: "large", name: "Большой пакет", rounds: 50, priceStars: 200, isActive: true },
  ]),
  
  // Таймеры (в секундах)
  defaultTimerSeconds: z.number().min(10).max(300).default(60),
  maxTimerSeconds: z.number().min(60).max(600).default(180),
  
  // Лимиты
  maxSessionRounds: z.number().min(10).max(1000).default(100),
  maxDailyGenerations: z.number().min(10).max(10000).default(1000),
  
  // Уведомления и сообщения
  adminNotifications: z.boolean().default(true),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().default("⚙️ Бот на техобслуживании. Попробуйте позже."),
  welcomeMessage: z.string().optional(),
  
  // Дополнительные настройки
  backgroundGenerationEnabled: z.boolean().default(true),
  backgroundGenerationInterval: z.number().min(30).max(3600).default(300),
  debugMode: z.boolean().default(false),
  customSettings: z.record(z.string(), z.any()).default({}),
});

export type BotConfig = z.infer<typeof BotConfigSchema>;

export class ConfigManager {
  private static instance: ConfigManager;
  private config: BotConfig;
  private configPath: string;

  private constructor() {
    this.configPath = process.env.CONFIG_PATH || "./bot-config.json";
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): BotConfig {
    try {
      const data = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(data);
      return BotConfigSchema.parse(parsed);
    } catch (error) {
      logger.info("No config file found, using defaults");
      const defaultConfig = BotConfigSchema.parse({});
      this.saveConfig(defaultConfig);
      return defaultConfig;
    }
  }

  private saveConfig(config: BotConfig): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info("Config saved successfully");
    } catch (error) {
      logger.error("Failed to save config", { error });
    }
  }

  getConfig(): BotConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<BotConfig>): BotConfig {
    this.config = BotConfigSchema.parse({ ...this.config, ...updates });
    this.saveConfig(this.config);
    return this.getConfig();
  }

  get(key: keyof BotConfig): any {
    return this.config[key];
  }

  set(key: keyof BotConfig, value: any): void {
    this.updateConfig({ [key]: value });
  }

  // Методы для работы с промптом
  getSystemPrompt(): string {
    return this.config.systemPrompt || this.getDefaultSystemPrompt();
  }

  private getDefaultSystemPrompt(): string {
    // Импортируем дефолтный промпт
    return require("../generation/prompt").LOCK_STOCK_SYSTEM_PROMPT;
  }

  // Методы для работы с моделями
  getModelConfig() {
    return {
      model: this.config.openRouterModel,
      temperature: this.config.temperature,
      maxAttempts: this.config.maxAttempts,
    };
  }

  // Методы для работы с пакетами
  getPackages() {
    return this.config.packages.filter(p => p.isActive);
  }

  getPackage(id: string) {
    return this.config.packages.find(p => p.id === id);
  }

  updatePackage(id: string, updates: Partial<z.infer<typeof GamePackageSchema>>) {
    const packages = [...this.config.packages];
    const index = packages.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    packages[index] = { ...packages[index], ...updates };
    this.updateConfig({ packages });
    return packages[index];
  }

  addPackage(pkg: z.infer<typeof GamePackageSchema>) {
    const packages = [...this.config.packages, pkg];
    this.updateConfig({ packages });
    return pkg;
  }

  removePackage(id: string) {
    const packages = this.config.packages.filter(p => p.id !== id);
    this.updateConfig({ packages });
  }

  // Проверка режима обслуживания
  isMaintenanceMode() {
    return this.config.maintenanceMode;
  }

  // Получение сообщений
  getMessages() {
    return {
      welcome: this.config.welcomeMessage || this.getDefaultWelcomeMessage(),
      maintenance: this.config.maintenanceMessage,
    };
  }

  private getDefaultWelcomeMessage() {
    return "🎯 Добро пожаловать в игру *«Раз, два, три»*!\n\n" +
           "Я загадаю число от 1 до 1000, а вы должны его угадать.\n" +
           "Используйте /newgame чтобы начать!";
  }
}