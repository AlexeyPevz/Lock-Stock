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
  const defaultPackPath = "./content/pack.default.json";
  const extendedPackPath = "./content/pack.extended.json";
  
  const db = openDb();
  
  // Load default pack
  console.log("Loading default pack...");
  const defaultRounds = loadPack(defaultPackPath);
  
  // Load extended pack
  console.log("Loading extended pack...");
  const extendedRounds = loadPack(extendedPackPath);
  
  // Combine all rounds
  const allRounds = [...defaultRounds, ...extendedRounds];
  
  db.transaction(() => {
    for (const r of allRounds) {
      upsertFact(db, r.question);
      upsertFact(db, r.hint1);
      upsertFact(db, r.hint2);
      upsertRound(db, r);
    }
  })();
  
  console.log(`Total rounds imported: ${allRounds.length}`);
  console.log(`- Default pack: ${defaultRounds.length}`);
  console.log(`- Extended pack: ${extendedRounds.length}`);
  
  // Show statistics
  const roundCount = db.prepare("SELECT COUNT(*) as count FROM rounds").get();
  const factCount = db.prepare("SELECT COUNT(*) as count FROM facts_by_number").get();
  console.log(`\nDatabase statistics:`);
  console.log(`- Total rounds in DB: ${roundCount.count}`);
  console.log(`- Total facts in DB: ${factCount.count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});