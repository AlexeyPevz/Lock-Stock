import OpenAI from "openai";
import { z } from "zod";
import { LOCK_STOCK_SYSTEM_PROMPT } from "./prompt";

const GeneratedSchema = z.object({
  question: z.string().min(10),
  hint1: z.string().min(10),
  hint2: z.string().min(10),
  answer: z.number().int().min(1).max(1000),
});

export type GeneratedRound = z.infer<typeof GeneratedSchema>;

export interface GeneratorOptions {
  model?: string;
  temperature?: number;
}

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY is required for generation");
  const defaultHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_REFERER) defaultHeaders["HTTP-Referer"] = process.env.OPENROUTER_REFERER;
  if (process.env.OPENROUTER_TITLE) defaultHeaders["X-Title"] = process.env.OPENROUTER_TITLE;
  return new OpenAI({ apiKey, baseURL, defaultHeaders });
}

export async function generateOneRound(options: GeneratorOptions = {}): Promise<GeneratedRound> {
  const model = options.model || process.env.OPENAI_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
  const temperature = options.temperature ?? 0.7;
  const client = getClient();

  const completion = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: LOCK_STOCK_SYSTEM_PROMPT },
      { role: "user", content: "Сгенерируй один валидный раунд сейчас. Возврати только JSON." },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error("LLM did not return valid JSON");
  }
  const check = GeneratedSchema.safeParse(parsed);
  if (!check.success) {
    throw new Error("Generated JSON invalid: " + check.error.message);
  }
  return check.data;
}