import { DB } from "./client";
import { RoundBundle } from "../types";

export function getRoundBundleById(db: DB, roundId: string): RoundBundle | null {
  const row = db.prepare(
    `SELECT r.id as round_id, r.number,
            fq.id as q_id, fq.domain as q_domain, fq.fact_text as q_text, fq.source_url as q_src,
            f1.id as h1_id, f1.domain as h1_domain, f1.fact_text as h1_text, f1.source_url as h1_src,
            f2.id as h2_id, f2.domain as h2_domain, f2.fact_text as h2_text, f2.source_url as h2_src
       FROM rounds r
       JOIN facts_by_number fq ON fq.id = r.question_fact_id
       JOIN facts_by_number f1 ON f1.id = r.hint1_fact_id
       JOIN facts_by_number f2 ON f2.id = r.hint2_fact_id
      WHERE r.id = ?`
  ).get(roundId) as any;
  if (!row) return null;
  const bundle: RoundBundle = {
    number: row.number,
    question: {
      id: row.q_id,
      number: row.number,
      domain: row.q_domain,
      text: row.q_text,
      sourceUrl: row.q_src || undefined,
    },
    hint1: {
      id: row.h1_id,
      number: row.number,
      domain: row.h1_domain,
      text: row.h1_text,
      sourceUrl: row.h1_src || undefined,
    },
    hint2: {
      id: row.h2_id,
      number: row.number,
      domain: row.h2_domain,
      text: row.h2_text,
      sourceUrl: row.h2_src || undefined,
    },
  };
  return bundle;
}