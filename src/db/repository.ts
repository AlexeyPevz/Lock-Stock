import Database from "better-sqlite3";
import { RoundBundle, RoundFact } from "../types";
import { logger } from "../utils/logger";

export interface RoundRepository {
  findById(id: string): RoundBundle | null;
  findByNumber(number: number): RoundBundle[];
  findNextForUser(userId: number, excludeNumbers: number[]): RoundBundle | null;
  save(round: RoundBundle): string;
  markAsSeen(userId: number, roundId: string, number: number): void;
  markAsVerified(roundId: string): void;
  getSeenNumbers(userId: number, limit?: number): number[];
}

export interface FactRepository {
  findById(id: string): RoundFact | null;
  findByNumber(number: number): RoundFact[];
  save(fact: RoundFact): string;
  updateRating(factId: string, rating: number): void;
  quarantineLowQuality(threshold: number): number;
}

export interface FeedbackRepository {
  save(userId: number, roundId: string, number: number, rating?: number, category?: string): void;
  getAverageRating(roundId: string): number | null;
  getCategoryStats(roundId: string): Record<string, number>;
}

export class SqliteRoundRepository implements RoundRepository {
  constructor(private db: Database.Database) {}

  findById(id: string): RoundBundle | null {
    const row = this.db.prepare(`
      SELECT r.*, 
        q.id as q_id, q.number as q_number, q.domain as q_domain, q.fact_text as q_text, q.source_url as q_source,
        h1.id as h1_id, h1.number as h1_number, h1.domain as h1_domain, h1.fact_text as h1_text, h1.source_url as h1_source,
        h2.id as h2_id, h2.number as h2_number, h2.domain as h2_domain, h2.fact_text as h2_text, h2.source_url as h2_source
      FROM rounds r
      JOIN facts_by_number q ON r.question_fact_id = q.id
      JOIN facts_by_number h1 ON r.hint1_fact_id = h1.id
      JOIN facts_by_number h2 ON r.hint2_fact_id = h2.id
      WHERE r.id = ?
    `).get(id) as any;

    if (!row) return null;

    return {
      number: row.number,
      question: { id: row.q_id, number: row.q_number, domain: row.q_domain, text: row.q_text, sourceUrl: row.q_source },
      hint1: { id: row.h1_id, number: row.h1_number, domain: row.h1_domain, text: row.h1_text, sourceUrl: row.h1_source },
      hint2: { id: row.h2_id, number: row.h2_number, domain: row.h2_domain, text: row.h2_text, sourceUrl: row.h2_source },
    };
  }

  findByNumber(number: number): RoundBundle[] {
    const rows = this.db.prepare(`
      SELECT r.*, 
        q.id as q_id, q.number as q_number, q.domain as q_domain, q.fact_text as q_text, q.source_url as q_source,
        h1.id as h1_id, h1.number as h1_number, h1.domain as h1_domain, h1.fact_text as h1_text, h1.source_url as h1_source,
        h2.id as h2_id, h2.number as h2_number, h2.domain as h2_domain, h2.fact_text as h2_text, h2.source_url as h2_source
      FROM rounds r
      JOIN facts_by_number q ON r.question_fact_id = q.id
      JOIN facts_by_number h1 ON r.hint1_fact_id = h1.id
      JOIN facts_by_number h2 ON r.hint2_fact_id = h2.id
      WHERE r.number = ?
    `).all(number) as any[];

    return rows.map(row => ({
      number: row.number,
      question: { id: row.q_id, number: row.q_number, domain: row.q_domain, text: row.q_text, sourceUrl: row.q_source },
      hint1: { id: row.h1_id, number: row.h1_number, domain: row.h1_domain, text: row.h1_text, sourceUrl: row.h1_source },
      hint2: { id: row.h2_id, number: row.h2_number, domain: row.h2_domain, text: row.h2_text, sourceUrl: row.h2_source },
    }));
  }

  findNextForUser(userId: number, excludeNumbers: number[]): RoundBundle | null {
    const seenNumbers = this.getSeenNumbers(userId, 100);
    const allExcluded = [...new Set([...seenNumbers, ...excludeNumbers])];
    
    const placeholders = allExcluded.map(() => "?").join(",") || "NULL";
    const query = `
      SELECT r.id, r.number,
        q.id as q_id, q.number as q_number, q.domain as q_domain, q.fact_text as q_text, q.source_url as q_source,
        h1.id as h1_id, h1.number as h1_number, h1.domain as h1_domain, h1.fact_text as h1_text, h1.source_url as h1_source,
        h2.id as h2_id, h2.number as h2_number, h2.domain as h2_domain, h2.fact_text as h2_text, h2.source_url as h2_source
      FROM rounds r
      JOIN facts_by_number q ON r.question_fact_id = q.id AND q.rating >= 0
      JOIN facts_by_number h1 ON r.hint1_fact_id = h1.id AND h1.rating >= 0
      JOIN facts_by_number h2 ON r.hint2_fact_id = h2.id AND h2.rating >= 0
      WHERE r.verified = 1
        AND r.number NOT IN (${placeholders})
        AND q.id NOT IN (SELECT fact_id FROM user_seen WHERE user_id = ?)
        AND h1.id NOT IN (SELECT fact_id FROM user_seen WHERE user_id = ?)
        AND h2.id NOT IN (SELECT fact_id FROM user_seen WHERE user_id = ?)
      ORDER BY RANDOM()
      LIMIT 1
    `;

    const row = this.db.prepare(query).get(...allExcluded, userId, userId, userId) as any;
    
    if (!row) {
      logger.warn("No available rounds for user", { userId, excludedCount: allExcluded.length });
      return null;
    }

    return {
      number: row.number,
      question: { id: row.q_id, number: row.q_number, domain: row.q_domain, text: row.q_text, sourceUrl: row.q_source },
      hint1: { id: row.h1_id, number: row.h1_number, domain: row.h1_domain, text: row.h1_text, sourceUrl: row.h1_source },
      hint2: { id: row.h2_id, number: row.h2_number, domain: row.h2_domain, text: row.h2_text, sourceUrl: row.h2_source },
    };
  }

  save(round: RoundBundle): string {
    // Implementation would be in upsert.ts
    throw new Error("Use ensureFactsAndRound instead");
  }

  markAsSeen(userId: number, roundId: string, number: number): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO user_seen (user_id, number, round_id, fact_id)
      VALUES (?, ?, ?, ?)
    `);
    
    const round = this.findById(roundId);
    if (!round) return;

    const transaction = this.db.transaction(() => {
      stmt.run(userId, number, roundId, round.question.id);
      stmt.run(userId, number, roundId, round.hint1.id);
      stmt.run(userId, number, roundId, round.hint2.id);
    });
    
    transaction();
  }

  markAsVerified(roundId: string): void {
    this.db.prepare("UPDATE rounds SET verified = 1 WHERE id = ?").run(roundId);
  }

  getSeenNumbers(userId: number, limit: number = 50): number[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT number 
      FROM user_seen 
      WHERE user_id = ? 
      ORDER BY seen_at DESC 
      LIMIT ?
    `).all(userId, limit) as { number: number }[];
    
    return rows.map(r => r.number);
  }
}

export class SqliteFeedbackRepository implements FeedbackRepository {
  constructor(private db: Database.Database) {}

  save(userId: number, roundId: string, number: number, rating?: number, category?: string): void {
    if (rating !== null && rating !== undefined) {
      this.db.prepare(`
        UPDATE user_seen 
        SET rating = ? 
        WHERE user_id = ? AND round_id = ?
      `).run(rating, userId, roundId);
    }
    
    if (category) {
      this.db.prepare(`
        UPDATE user_seen 
        SET feedback_category = ? 
        WHERE user_id = ? AND round_id = ?
      `).run(category, userId, roundId);
    }

    logger.info("Feedback saved", { userId, roundId, number, rating, category });
  }

  getAverageRating(roundId: string): number | null {
    const result = this.db.prepare(`
      SELECT AVG(rating) as avg_rating 
      FROM user_seen 
      WHERE round_id = ? AND rating IS NOT NULL
    `).get(roundId) as { avg_rating: number | null };
    
    return result.avg_rating;
  }

  getCategoryStats(roundId: string): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT feedback_category, COUNT(*) as count 
      FROM user_seen 
      WHERE round_id = ? AND feedback_category IS NOT NULL 
      GROUP BY feedback_category
    `).all(roundId) as { feedback_category: string; count: number }[];
    
    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.feedback_category] = row.count;
    }
    
    return stats;
  }
}