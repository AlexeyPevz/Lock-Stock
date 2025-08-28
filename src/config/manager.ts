import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import { logger } from "../utils/logger";

// Схема конфигурации бота
export const BotConfigSchema = z.object({
  openRouterModel: z.string().default("deepseek/deepseek-chat"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxAttempts: z.number().min(1).max(10).default(3),
  freeRounds: z.number().min(1).default(5),
  premiumRounds: z.number().min(1).default(50),
  verificationEnabled: z.boolean().default(true),
  adminNotifications: z.boolean().default(true),
  maintenanceMode: z.boolean().default(false),
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
}