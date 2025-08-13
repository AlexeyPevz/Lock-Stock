import { DB } from "./client";
import { RoundBundle } from "../types";
import { sha256Hex } from "../utils/hash";

function getFactIdByHash(db: DB, hash: string): string | null {
  const row = db.prepare(`SELECT id FROM facts_by_number WHERE fact_hash = ?`).get(hash) as { id: string } | undefined;
  return row?.id || null;
}

function insertOrUpdateFact(db: DB, fact: { id: string; number: number; domain: string; text: string; sourceUrl?: string; }) {
  const hash = sha256Hex(`${fact.number}|${fact.domain}|${fact.text}|${fact.sourceUrl || ""}`);
  const existingId = getFactIdByHash(db, hash);
  const factId = existingId || fact.id;
  const stmt = db.prepare(
    `INSERT INTO facts_by_number (id, number, domain, fact_text, source_url, verified, usage_count, fact_hash)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)
     ON CONFLICT(id) DO UPDATE SET number=excluded.number, domain=excluded.domain, fact_text=excluded.fact_text, source_url=excluded.source_url, fact_hash=excluded.fact_hash`
  );
  stmt.run(factId, fact.number, fact.domain, fact.text, fact.sourceUrl || null, hash);
  return factId;
}

export function ensureFactsAndRound(db: DB, round: RoundBundle): string {
  const qId = insertOrUpdateFact(db, round.question);
  const h1Id = insertOrUpdateFact(db, round.hint1);
  const h2Id = insertOrUpdateFact(db, round.hint2);
  const roundId = `r-${qId}-${h1Id}-${h2Id}`;
  const sourcesArr = [round.question.sourceUrl, round.hint1.sourceUrl, round.hint2.sourceUrl].filter(Boolean);
  const sources = sourcesArr.length ? JSON.stringify(sourcesArr) : null;
  const stmt = db.prepare(
    `INSERT INTO rounds (id, number, question_fact_id, hint1_fact_id, hint2_fact_id, sources, verified)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO NOTHING`
  );
  stmt.run(roundId, round.number, qId, h1Id, h2Id, sources);
  return roundId;
}