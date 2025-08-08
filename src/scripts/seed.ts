import path from "path";
import { openDb } from "../db/client";
import { loadPack } from "../content/provider";
import { RoundBundle } from "../types";

function upsertFact(db: any, fact: { id: string; number: number; domain: string; text: string; sourceUrl?: string; }) {
  const stmt = db.prepare(
    `INSERT INTO facts_by_number (id, number, domain, fact_text, source_url, verified, usage_count)
     VALUES (?, ?, ?, ?, ?, 1, 0)
     ON CONFLICT(id) DO UPDATE SET number=excluded.number, domain=excluded.domain, fact_text=excluded.fact_text, source_url=excluded.source_url`
  );
  stmt.run(fact.id, fact.number, fact.domain, fact.text, fact.sourceUrl || null);
}

function upsertRound(db: any, round: RoundBundle) {
  const roundId = `r-${round.question.id}-${round.hint1.id}-${round.hint2.id}`;
  const stmt = db.prepare(
    `INSERT INTO rounds (id, number, question_fact_id, hint1_fact_id, hint2_fact_id, verified)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO NOTHING`
  );
  stmt.run(roundId, round.number, round.question.id, round.hint1.id, round.hint2.id);
}

async function main() {
  const packPath = process.env.CONTENT_PACK_PATH || "./content/pack.default.json";
  const db = openDb();
  const rounds = loadPack(packPath);
  db.transaction(() => {
    for (const r of rounds) {
      upsertFact(db, r.question);
      upsertFact(db, r.hint1);
      upsertFact(db, r.hint2);
      upsertRound(db, r);
    }
  })();
  console.log(`Imported rounds: ${rounds.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});