import { DB } from "./client";
import { RoundBundle } from "../types";

export function upsertFact(db: DB, fact: { id: string; number: number; domain: string; text: string; sourceUrl?: string; }) {
  const stmt = db.prepare(
    `INSERT INTO facts_by_number (id, number, domain, fact_text, source_url, verified, usage_count)
     VALUES (?, ?, ?, ?, ?, 0, 0)
     ON CONFLICT(id) DO UPDATE SET number=excluded.number, domain=excluded.domain, fact_text=excluded.fact_text, source_url=excluded.source_url`
  );
  stmt.run(fact.id, fact.number, fact.domain, fact.text, fact.sourceUrl || null);
}

export function upsertRound(db: DB, round: RoundBundle): string {
  const roundId = `r-${round.question.id}-${round.hint1.id}-${round.hint2.id}`;
  const stmt = db.prepare(
    `INSERT INTO rounds (id, number, question_fact_id, hint1_fact_id, hint2_fact_id, verified)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO NOTHING`
  );
  stmt.run(roundId, round.number, round.question.id, round.hint1.id, round.hint2.id);
  return roundId;
}