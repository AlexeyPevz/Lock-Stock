import { z } from "zod";
import { FactDomain } from "../types";

export const factDomainSchema = z.enum([
  "history",
  "sports",
  "movies",
  "science",
  "music",
  "geography",
  "pop_culture",
  "other",
]);

export const roundFactSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().min(1).max(1000),
  domain: factDomainSchema,
  text: z.string().min(10),
  sourceUrl: z.string().url().optional(),
});

export const roundBundleSchema = z.object({
  number: z.number().int().min(1).max(1000),
  question: roundFactSchema,
  hint1: roundFactSchema,
  hint2: roundFactSchema,
});

export const packSchema = z.array(roundBundleSchema).min(1);

export function validateDomainsDistinct(round: z.infer<typeof roundBundleSchema>): boolean {
  const domains = [round.question.domain, round.hint1.domain, round.hint2.domain];
  return new Set(domains).size === 3;
}

const bannedPatterns = [
  /подсч(е|ё)т[а-я\s]*букв/i,
  /сколько[\s-]*букв/i,
  /сколько[\s-]*дат/i,
  /номер серии/i,
  /номер эпизода/i,
  /сколько[\s-]*серий/i,
  /сколько[\s-]*сезонов/i,
  /какой[\s-]*номер/i,
  /по\s+счёт[уе]/i,
];

export function validateNoBannedPatterns(text: string): boolean {
  return !bannedPatterns.some((re) => re.test(text));
}