import { z } from "zod";

// Базовая схема для факта
const FactSchema = z.object({
  text: z.string()
    .min(20, "Факт слишком короткий")
    .max(300, "Факт слишком длинный")
    .describe("Интересный факт, связанный с числом"),
  
  domain: z.enum([
    "history", "sports", "movies", "science", 
    "music", "geography", "pop_culture", "other"
  ]).describe("Категория факта"),
  
  source_url: z.string().url().optional()
    .describe("Ссылка на источник (например, Wikipedia)")
});

// Схема для генерации вопросов Lock Stock
export const LockStockGenerationSchema = z.object({
  answer: z.number()
    .int()
    .min(1)
    .max(1000)
    .describe("Числовой ответ от 1 до 1000"),
  
  question: FactSchema.describe("Основной вопрос, ответом на который является число"),
  
  hint1: FactSchema.describe("Первая подсказка из другой области знаний"),
  
  hint2: FactSchema.describe("Вторая подсказка из третьей области знаний"),
  
  reasoning: z.string().optional()
    .describe("Объяснение связи между фактами и числом (для отладки)")
});

// Промпт для структурированной генерации
export const SGR_SYSTEM_PROMPT = `You are an expert quiz master creating questions for the Lock Stock game.

RULES:
1. Generate a number between 1 and 1000
2. Create 3 INDEPENDENT facts from DIFFERENT domains that all relate to this number
3. Facts must be from COMPLETELY DIFFERENT areas of knowledge
4. Each fact should be interesting and verifiable
5. Facts should be challenging but fair

IMPORTANT CONSTRAINTS:
- Question and both hints must be from DIFFERENT domains
- Facts must be historically accurate and verifiable
- Avoid obscure or overly specific information
- Make connections interesting but logical

RESPONSE FORMAT:
Generate a valid JSON object matching the provided schema.

EXAMPLE PATTERNS:
- Year of historical event / Sports record / Movie release year
- Population count / Scientific measurement / Cultural reference
- Distance in km / Album chart position / Historical date

Remember: The goal is to create an engaging trivia experience where players can approach the answer from multiple angles.`;

// Примеры для few-shot обучения
export const SGR_EXAMPLES = [
  {
    role: "user",
    content: "Generate a Lock Stock round"
  },
  {
    role: "assistant", 
    content: JSON.stringify({
      answer: 1969,
      question: {
        text: "В каком году человек впервые ступил на поверхность Луны?",
        domain: "history"
      },
      hint1: {
        text: "Столько очков набрал Карим Абдул-Джаббар в своем последнем сезоне в NCAA",
        domain: "sports"
      },
      hint2: {
        text: "Год выхода фильма 'Полуночный ковбой' с Дастином Хоффманом",
        domain: "movies"
      },
      reasoning: "1969 - знаковый год: высадка на Луну, рекорд в баскетболе, премьера оскароносного фильма"
    })
  }
];

// Функция валидации результата
export function validateLockStockGeneration(data: unknown): z.infer<typeof LockStockGenerationSchema> {
  const result = LockStockGenerationSchema.parse(data);
  
  // Дополнительная валидация: проверка уникальности доменов
  const domains = [result.question.domain, result.hint1.domain, result.hint2.domain];
  const uniqueDomains = new Set(domains);
  
  if (uniqueDomains.size !== 3) {
    throw new Error("All three facts must be from different domains");
  }
  
  // Проверка на запрещенные паттерны
  const bannedPatterns = [
    /\d{4} год/i,  // Избегаем повторений "XXXX год"
    /ровно \d+/i,  // Избегаем "ровно N"
    /составляет \d+/i,  // Избегаем "составляет N"
  ];
  
  const allTexts = [result.question.text, result.hint1.text, result.hint2.text];
  
  for (const text of allTexts) {
    for (const pattern of bannedPatterns) {
      if (pattern.test(text)) {
        throw new Error(`Banned pattern found in: ${text}`);
      }
    }
  }
  
  return result;
}

// Конфигурация для разных моделей
export const MODEL_CONFIGS = {
  "mistral-7b-instruct": {
    temperature: 0.8,
    max_tokens: 800,
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.3,
  },
  "mistral-7b-instruct:free": {
    temperature: 0.8,
    max_tokens: 800,
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.3,
  },
  "deepseek-chat": {
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 0.95,
  },
  default: {
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 0.95,
  }
};

// Функция для получения конфигурации модели
export function getModelConfig(modelName: string) {
  const baseConfig = MODEL_CONFIGS[modelName] || MODEL_CONFIGS.default;
  
  return {
    ...baseConfig,
    response_format: { type: "json_object" },
    seed: Math.floor(Math.random() * 1000000), // Для вариативности
  };
}