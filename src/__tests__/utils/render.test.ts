import { renderRoundText } from "../../utils/render";
import { RoundBundle, RevealState } from "../../types";

describe("renderRoundText", () => {
  const mockRound: RoundBundle = {
    number: 42,
    question: {
      id: "q1",
      number: 42,
      domain: "history",
      text: "Сколько было президентов США до 2020 года?",
      sourceUrl: "https://example.com",
    },
    hint1: {
      id: "h1",
      number: 42,
      domain: "sports",
      text: "Сколько километров в марафоне (округленно)?",
      sourceUrl: "https://example.com",
    },
    hint2: {
      id: "h2",
      number: 42,
      domain: "science",
      text: "Сколько хромосом у человека минус 4?",
      sourceUrl: "https://example.com",
    },
  };

  it("should render all hidden when nothing is revealed", () => {
    const state: RevealState = {
      showQuestion: false,
      showHint1: false,
      showHint2: false,
      showAnswer: false,
    };

    const result = renderRoundText(mockRound, state);

    expect(result).toContain("Lock Stock — Раунд");
    expect(result).toContain("Вопрос: [скрыт]");
    expect(result).toContain("Подсказка 1: [скрыта]");
    expect(result).toContain("Подсказка 2: [скрыта]");
    expect(result).toContain("Ответ: [скрыт]");
  });

  it("should render question when revealed", () => {
    const state: RevealState = {
      showQuestion: true,
      showHint1: false,
      showHint2: false,
      showAnswer: false,
    };

    const result = renderRoundText(mockRound, state);

    expect(result).toContain("Вопрос: Сколько было президентов США до 2020 года?");
    expect(result).toContain("Подсказка 1: [скрыта]");
  });

  it("should render all when fully revealed", () => {
    const state: RevealState = {
      showQuestion: true,
      showHint1: true,
      showHint2: true,
      showAnswer: true,
    };

    const result = renderRoundText(mockRound, state);

    expect(result).toContain("Вопрос: Сколько было президентов США до 2020 года?");
    expect(result).toContain("Подсказка 1: Сколько километров в марафоне (округленно)?");
    expect(result).toContain("Подсказка 2: Сколько хромосом у человека минус 4?");
    expect(result).toContain("Ответ: 42");
  });
});