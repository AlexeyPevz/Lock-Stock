import { RoundBundle, RevealState } from "../types";

export function renderRoundText(round: RoundBundle, state: RevealState): string {
  const parts: string[] = [];
  parts.push("Lock Stock — Раунд");
  parts.push("");
  parts.push(state.showQuestion ? `Вопрос: ${round.question.text}` : "Вопрос: [скрыт]");
  parts.push(state.showHint1 ? `Подсказка 1: ${round.hint1.text}` : "Подсказка 1: [скрыта]");
  parts.push(state.showHint2 ? `Подсказка 2: ${round.hint2.text}` : "Подсказка 2: [скрыта]");
  parts.push(state.showAnswer ? `Ответ: ${round.number}` : "Ответ: [скрыт]");
  return parts.join("\n");
}