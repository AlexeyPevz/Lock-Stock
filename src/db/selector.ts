import { DB } from "./client";

export interface SelectOptions {
  userId: number;
  recentSessionsLimit?: number; // future use
}

export function selectNextRound(db: DB, userId: number): { round_id: string; number: number } | null {
  // Avoid numbers that user has seen recently
  const seenNumbers = new Set<number>();
  const seenStmt = db.prepare(`SELECT number FROM user_seen WHERE user_id = ?`);
  for (const row of seenStmt.iterate(userId) as IterableIterator<{ number: number }>) seenNumbers.add(row.number);

  // Pick a round whose number user did not see
  const pickStmt = db.prepare(`
    SELECT r.id as round_id, r.number
    FROM rounds r
    JOIN facts_by_number fq ON fq.id = r.question_fact_id
    JOIN facts_by_number f1 ON f1.id = r.hint1_fact_id
    JOIN facts_by_number f2 ON f2.id = r.hint2_fact_id
    WHERE r.number NOT IN (
      SELECT number FROM user_seen WHERE user_id = ?
    )
      AND fq.quarantined = 0 AND f1.quarantined = 0 AND f2.quarantined = 0
    ORDER BY RANDOM()
    LIMIT 1
  `);
  const found = pickStmt.get(userId) as { round_id: string; number: number } | undefined;
  if (!found) return null;
  return found;
}

export function markRoundSeen(db: DB, userId: number, roundId: string, number: number) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO user_seen(user_id, number, round_id, seen_at) VALUES(?, ?, ?, datetime('now'))`
  );
  stmt.run(userId, number, roundId);
}