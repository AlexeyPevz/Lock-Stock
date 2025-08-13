import OpenAI from "openai";
import { z } from "zod";
import { LOCK_STOCK_SYSTEM_PROMPT } from "./prompt";
import { factDomainSchema, validateDomainsDistinct, validateNoBannedPatterns } from "../content/validate";

const FactOut = z.object({
  text: z.string().min(10),
  domain: factDomainSchema,
  source_url: z.string().url().optional(),
});

const GeneratedSchema = z.object({
  answer: z.number().int().min(1).max(1000),
  question: FactOut,
  hint1: FactOut,
  hint2: FactOut,
});

export type GeneratedRound = z.infer<typeof GeneratedSchema>;

export interface GeneratorOptions {
  model?: string;
  temperature?: number;
  maxAttempts?: number;
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

function validateGenerated(gen: GeneratedRound): void {
  // domain distinct
  if (!validateDomainsDistinct({
    number: gen.answer,
    question: { id: "gq", number: gen.answer, domain: gen.question.domain, text: gen.question.text, sourceUrl: gen.question.source_url },
    hint1: { id: "gh1", number: gen.answer, domain: gen.hint1.domain, text: gen.hint1.text, sourceUrl: gen.hint1.source_url },
    hint2: { id: "gh2", number: gen.answer, domain: gen.hint2.domain, text: gen.hint2.text, sourceUrl: gen.hint2.source_url },
  } as any)) {
    throw new Error("Domains are not distinct");
  }
  // banned patterns
  if (!validateNoBannedPatterns(gen.question.text) || !validateNoBannedPatterns(gen.hint1.text) || !validateNoBannedPatterns(gen.hint2.text)) {
    throw new Error("Banned pattern detected");
  }
}

export async function generateOneRound(options: GeneratorOptions = {}): Promise<GeneratedRound> {
  const model = options.model || process.env.OPENAI_MODEL || "meta-llama/llama-3.1-8b-instruct:free";
  const temperature = options.temperature ?? 0.7;
  const maxAttempts = options.maxAttempts ?? 3;
  const client = getClient();

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: LOCK_STOCK_SYSTEM_PROMPT },
          { role: "user", content: "Сгенерируй один валидный раунд сейчас. Верни только JSON." },
        ],
      });

      const content = completion.choices[0]?.message?.content || "";
      const parsed = JSON.parse(content);
      const check = GeneratedSchema.safeParse(parsed);
      if (!check.success) throw new Error("Invalid JSON: " + check.error.message);

      validateGenerated(check.data);
      return check.data;
    } catch (e: any) {
      lastError = e;
      if (attempt === maxAttempts) break;
    }
  }
  throw new Error("Generation failed: " + (lastError?.message || "unknown error"));
}