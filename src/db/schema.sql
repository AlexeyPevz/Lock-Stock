-- facts_by_number: unique facts tied to a numeric answer
CREATE TABLE IF NOT EXISTS facts_by_number (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 1000),
  domain TEXT NOT NULL,
  fact_text TEXT NOT NULL,
  source_url TEXT,
  difficulty INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  verified INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- rounds: triplets (question, hint1, hint2) bound to one number
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  question_fact_id TEXT NOT NULL,
  hint1_fact_id TEXT NOT NULL,
  hint2_fact_id TEXT NOT NULL,
  sources TEXT,
  quality_score REAL DEFAULT 0,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(question_fact_id) REFERENCES facts_by_number(id),
  FOREIGN KEY(hint1_fact_id) REFERENCES facts_by_number(id),
  FOREIGN KEY(hint2_fact_id) REFERENCES facts_by_number(id)
);

-- sessions: per chat recent usage
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  is_premium INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- user_seen: what user has seen (facts and rounds)
CREATE TABLE IF NOT EXISTS user_seen (
  user_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  round_id TEXT,
  fact_id TEXT,
  seen_at TEXT DEFAULT (datetime('now')),
  rating INTEGER,
  feedback_category TEXT,
  PRIMARY KEY (user_id, number, round_id, fact_id)
);

CREATE INDEX IF NOT EXISTS idx_user_seen_user ON user_seen(user_id);
CREATE INDEX IF NOT EXISTS idx_rounds_number ON rounds(number);
CREATE INDEX IF NOT EXISTS idx_facts_number ON facts_by_number(number);