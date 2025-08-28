import OpenAI from "openai";
import { z } from "zod";
import { 
  LockStockGenerationSchema, 
  SGR_SYSTEM_PROMPT,
  SGR_EXAMPLES,
  validateLockStockGeneration,
  getModelConfig
} from "./sgr-schema";
import { ConfigManager } from "../config/manager";
import { logger } from "../utils/logger";

export type SGRGeneratedRound = z.infer<typeof LockStockGenerationSchema>;

interface SGRGeneratorOptions {
  model?: string;
  temperature?: number;
  maxAttempts?: number;
  useExamples?: boolean;
}

// Статистика генерации
interface GenerationStats {
  model: string;
  attempts: number;
  success: boolean;
  duration: number;
  error?: string;
}

class GenerationStatsCollector {
  private stats: GenerationStats[] = [];
  
  record(stat: GenerationStats) {
    this.stats.push(stat);
    
    // Сохраняем только последние 1000 записей
    if (this.stats.length > 1000) {
      this.stats = this.stats.slice(-1000);
    }
  }
  
  getStats() {
    const total = this.stats.length;
    const successful = this.stats.filter(s => s.success).length;
    const byModel = this.stats.reduce((acc, s) => {
      if (!acc[s.model]) {
        acc[s.model] = { total: 0, success: 0, avgDuration: 0, avgAttempts: 0 };
      }
      acc[s.model].total++;
      if (s.success) acc[s.model].success++;
      return acc;
    }, {} as Record<string, any>);
    
    // Вычисляем средние значения
    Object.keys(byModel).forEach(model => {
      const modelStats = this.stats.filter(s => s.model === model);
      byModel[model].avgDuration = modelStats.reduce((sum, s) => sum + s.duration, 0) / modelStats.length;
      byModel[model].avgAttempts = modelStats.reduce((sum, s) => sum + s.attempts, 0) / modelStats.length;
      byModel[model].successRate = (byModel[model].success / byModel[model].total * 100).toFixed(1) + '%';
    });
    
    return {
      total,
      successful,
      successRate: total > 0 ? (successful / total * 100).toFixed(1) + '%' : '0%',
      byModel,
      recentErrors: this.stats
        .filter(s => !s.success && s.error)
        .slice(-10)
        .map(s => ({ model: s.model, error: s.error, time: new Date() }))
    };
  }
}

export const generationStats = new GenerationStatsCollector();

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  
  if (!apiKey) throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY is required");
  
  const defaultHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_REFERER) defaultHeaders["HTTP-Referer"] = process.env.OPENROUTER_REFERER;
  if (process.env.OPENROUTER_TITLE) defaultHeaders["X-Title"] = process.env.OPENROUTER_TITLE;
  
  return new OpenAI({ apiKey, baseURL, defaultHeaders });
}

function buildMessages(useExamples: boolean): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { 
      role: "system", 
      content: SGR_SYSTEM_PROMPT + "\n\nSchema:\n" + JSON.stringify(LockStockGenerationSchema.shape, null, 2)
    }
  ];
  
  if (useExamples) {
    messages.push(...SGR_EXAMPLES as OpenAI.ChatCompletionMessageParam[]);
  }
  
  messages.push({
    role: "user",
    content: "Generate a new Lock Stock round with a random number between 1 and 1000. Return only valid JSON."
  });
  
  return messages;
}

export async function generateWithSGR(options: SGRGeneratorOptions = {}): Promise<SGRGeneratedRound> {
  const config = ConfigManager.getInstance();
  const modelConfig = config.getModelConfig();
  
  const model = options.model || modelConfig.model || "mistralai/mistral-7b-instruct:free";
  const maxAttempts = options.maxAttempts || modelConfig.maxAttempts || 3;
  const useExamples = options.useExamples ?? true;
  
  const client = getClient();
  const startTime = Date.now();
  
  let lastError: any = null;
  let attempts = 0;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    
    try {
      logger.debug(`SGR generation attempt ${attempt}/${maxAttempts} with model: ${model}`);
      
      const modelSettings = getModelConfig(model);
      if (options.temperature !== undefined) {
        modelSettings.temperature = options.temperature;
      }
      
      const completion = await client.chat.completions.create({
        model,
        messages: buildMessages(useExamples),
        ...modelSettings
      });
      
      const content = completion.choices[0]?.message?.content || "";
      
      // Пытаемся извлечь JSON из ответа
      let jsonStr = content;
      
      // Если ответ обернут в markdown блок кода
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      
      const parsed = JSON.parse(jsonStr);
      const validated = validateLockStockGeneration(parsed);
      
      // Записываем успешную статистику
      generationStats.record({
        model,
        attempts: attempt,
        success: true,
        duration: Date.now() - startTime
      });
      
      logger.info(`SGR generation successful`, {
        model,
        attempts: attempt,
        duration: Date.now() - startTime,
        answer: validated.answer
      });
      
      return validated;
      
    } catch (error: any) {
      lastError = error;
      logger.warn(`SGR generation attempt ${attempt} failed`, {
        model,
        error: error.message
      });
      
      // Если это последняя попытка, пробуем резервную модель
      if (attempt === maxAttempts && model !== "mistralai/mistral-7b-instruct:free") {
        logger.info("Falling back to free Mistral model");
        
        try {
          const fallbackResult = await generateWithSGR({
            ...options,
            model: "mistralai/mistral-7b-instruct:free",
            maxAttempts: 2
          });
          
          return fallbackResult;
        } catch (fallbackError) {
          // Продолжаем с оригинальной ошибкой
        }
      }
    }
  }
  
  // Записываем неудачную статистику
  generationStats.record({
    model,
    attempts,
    success: false,
    duration: Date.now() - startTime,
    error: lastError?.message || "Unknown error"
  });
  
  throw new Error(`SGR generation failed after ${attempts} attempts: ${lastError?.message || "Unknown error"}`);
}

// Функция для конвертации SGR результата в формат старого генератора
export function sgrToLegacyFormat(sgr: SGRGeneratedRound) {
  return {
    answer: sgr.answer,
    question: {
      text: sgr.question.text,
      domain: sgr.question.domain,
      source_url: sgr.question.source_url
    },
    hint1: {
      text: sgr.hint1.text,
      domain: sgr.hint1.domain,
      source_url: sgr.hint1.source_url
    },
    hint2: {
      text: sgr.hint2.text,
      domain: sgr.hint2.domain,
      source_url: sgr.hint2.source_url
    }
  };
}

// Экспортируем для обратной совместимости
export async function generateOneRoundSGR(options: SGRGeneratorOptions = {}) {
  const sgrResult = await generateWithSGR(options);
  return sgrToLegacyFormat(sgrResult);
}