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
  const packs = [
    { name: "Default", path: "./content/pack.default.json" },
    { name: "Extended", path: "./content/pack.extended.json" },
    { name: "Extra", path: "./content/pack.extra.json" }
  ];
  
  const db = openDb();
  let totalRounds: RoundBundle[] = [];
  
  // Load all packs
  for (const pack of packs) {
    try {
      console.log(`Loading ${pack.name} pack from ${pack.path}...`);
      const rounds = loadPack(pack.path);
      console.log(`  Found ${rounds.length} rounds`);
      totalRounds = totalRounds.concat(rounds);
    } catch (error) {
      console.log(`  Warning: Could not load ${pack.name} pack: ${error}`);
    }
  }
  
  // Import all rounds in a transaction
  db.transaction(() => {
    for (const r of totalRounds) {
      upsertFact(db, r.question);
      upsertFact(db, r.hint1);
      upsertFact(db, r.hint2);
      upsertRound(db, r);
    }
  })();
  
  console.log(`\nTotal rounds imported: ${totalRounds.length}`);
  
  // Show final statistics
  const roundCount = db.prepare("SELECT COUNT(*) as count FROM rounds").get();
  const factCount = db.prepare("SELECT COUNT(*) as count FROM facts_by_number").get();
  const uniqueNumbers = db.prepare("SELECT COUNT(DISTINCT number) as count FROM rounds").get();
  
  console.log(`\nDatabase statistics:`);
  console.log(`- Total rounds in DB: ${roundCount.count}`);
  console.log(`- Total facts in DB: ${factCount.count}`);
  console.log(`- Unique numbers covered: ${uniqueNumbers.count}`);
  
  // Show sample rounds
  const sampleRounds = db.prepare("SELECT number FROM rounds ORDER BY RANDOM() LIMIT 5").all();
  console.log(`\nSample numbers available: ${sampleRounds.map((r: any) => r.number).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});