import { DB } from "./client";

export function saveRoundFeedback(db: DB, userId: number, roundId: string, number: number, rating: number | null, category: string | null) {
  const stmt = db.prepare(
    `INSERT INTO user_seen(user_id, number, round_id, rating, feedback_category, seen_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, number, round_id, fact_id) DO UPDATE SET rating=excluded.rating, feedback_category=excluded.feedback_category`
  );
  stmt.run(userId, number, roundId, rating ?? null, category ?? null);
}