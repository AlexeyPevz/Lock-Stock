export type FactDomain =
  | "history"
  | "sports"
  | "movies"
  | "science"
  | "music"
  | "geography"
  | "pop_culture"
  | "other";

export interface RoundFact {
  id: string;
  number: number; // 1..1000
  domain: FactDomain;
  text: string;
  sourceUrl?: string;
}

export interface RoundBundle {
  number: number; // shared numeric answer
  question: RoundFact; // domain A
  hint1: RoundFact; // domain B
  hint2: RoundFact; // domain C
}

export interface RevealState {
  showQuestion: boolean;
  showHint1: boolean;
  showHint2: boolean;
  showAnswer: boolean;
}

export interface Session {
  chatId: number;
  rounds: RoundBundle[];
  currentIndex: number;
  revealed: Record<number, RevealState>; // index -> state
  roundIds?: Record<number, string>; // index -> roundId (for DB/feedback)
  freeLimit: number; // free rounds available
  premiumTotal: number; // total rounds when premium
  isPremium: boolean;
  skipsUsed: number; // number of skips used in this session
  adminMode?: "editing_prompt" | "setting_temperature" | "setting_free_rounds" | "setting_premium_rounds"; // Admin input mode
}