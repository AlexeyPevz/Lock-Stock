import fs from "fs";
import path from "path";
import { z } from "zod";
import { RoundBundle } from "../types";
import { packSchema, validateDomainsDistinct, validateNoBannedPatterns } from "./validate";

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function loadPack(packPath: string): RoundBundle[] {
  const resolved = path.resolve(packPath);
  const raw = fs.readFileSync(resolved, "utf-8");
  const json = JSON.parse(raw);
  const parsed = packSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Invalid content pack: " + parsed.error.message);
  }
  const rounds = parsed.data.filter((r) => {
    if (!validateDomainsDistinct(r)) return false;
    if (!validateNoBannedPatterns(r.question.text)) return false;
    if (!validateNoBannedPatterns(r.hint1.text)) return false;
    if (!validateNoBannedPatterns(r.hint2.text)) return false;
    return (
      r.number === r.question.number &&
      r.number === r.hint1.number &&
      r.number === r.hint2.number
    );
  });
  return shuffleInPlace(rounds.slice());
}