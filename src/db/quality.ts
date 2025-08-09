import { DB } from "./client";

export function recomputeFactRatings(db: DB) {
  // Average rating per fact via rounds linkage
  db.exec(`
    UPDATE facts_by_number SET rating = (
      SELECT AVG(us.rating)
      FROM user_seen us
      JOIN rounds r ON r.id = us.round_id
      WHERE (r.question_fact_id = facts_by_number.id OR r.hint1_fact_id = facts_by_number.id OR r.hint2_fact_id = facts_by_number.id)
        AND us.rating IS NOT NULL
    )
  `);
}

export function quarantineLowQualityFacts(db: DB, minRatings: number = 3, maxAllowed: number = 2.5) {
  // Quarantine facts with enough ratings but low average or many controversial flags
  db.exec(`
    UPDATE facts_by_number SET quarantined = 1
    WHERE id IN (
      SELECT f.id FROM facts_by_number f
      LEFT JOIN rounds r ON r.question_fact_id = f.id OR r.hint1_fact_id = f.id OR r.hint2_fact_id = f.id
      LEFT JOIN user_seen us ON us.round_id = r.id
      GROUP BY f.id
      HAVING COUNT(us.rating) >= ${minRatings} AND (AVG(us.rating) <= ${maxAllowed}
        OR SUM(CASE WHEN us.feedback_category = 'controversial' THEN 1 ELSE 0 END) >= 2)
    )
  `);
}

export function getQualityReport(db: DB) {
  const totals = db.prepare(`
    SELECT COUNT(*) as facts,
           SUM(CASE WHEN quarantined=1 THEN 1 ELSE 0 END) as quarantined,
           ROUND(AVG(rating), 2) as avg_rating
    FROM facts_by_number
  `).get() as { facts: number; quarantined: number; avg_rating: number };

  const worst = db.prepare(`
    SELECT id, number, domain, rating
    FROM facts_by_number
    WHERE rating IS NOT NULL
    ORDER BY rating ASC
    LIMIT 5
  `).all() as Array<{ id: string; number: number; domain: string; rating: number }>;

  return { totals, worst };
}