import { validateDomainsDistinct, validateNoBannedPatterns, roundBundleSchema } from "../../content/validate";

describe("Content Validation", () => {
  describe("validateDomainsDistinct", () => {
    it("should return true when all domains are different", () => {
      const round = {
        number: 42,
        question: { id: "q1", number: 42, domain: "history" as const, text: "Question", sourceUrl: "" },
        hint1: { id: "h1", number: 42, domain: "sports" as const, text: "Hint 1", sourceUrl: "" },
        hint2: { id: "h2", number: 42, domain: "science" as const, text: "Hint 2", sourceUrl: "" },
      };

      expect(validateDomainsDistinct(round)).toBe(true);
    });

    it("should return false when domains repeat", () => {
      const round = {
        number: 42,
        question: { id: "q1", number: 42, domain: "history" as const, text: "Question", sourceUrl: "" },
        hint1: { id: "h1", number: 42, domain: "history" as const, text: "Hint 1", sourceUrl: "" },
        hint2: { id: "h2", number: 42, domain: "science" as const, text: "Hint 2", sourceUrl: "" },
      };

      expect(validateDomainsDistinct(round)).toBe(false);
    });
  });

  describe("validateNoBannedPatterns", () => {
    it("should allow valid questions", () => {
      expect(validateNoBannedPatterns("Сколько континентов на Земле?")).toBe(true);
      expect(validateNoBannedPatterns("Какое расстояние до Луны в километрах?")).toBe(true);
    });

    it("should reject questions with letter counting", () => {
      expect(validateNoBannedPatterns("Сколько букв в слове 'привет'?")).toBe(false);
      expect(validateNoBannedPatterns("Подсчет букв в названии")).toBe(false);
      expect(validateNoBannedPatterns("Подсчёт букв")).toBe(false);
    });

    it("should reject questions about dates counting", () => {
      expect(validateNoBannedPatterns("Сколько дат в календаре")).toBe(false);
    });

    it("should reject questions about episode numbers", () => {
      expect(validateNoBannedPatterns("Номер серии в сезоне")).toBe(false);
      expect(validateNoBannedPatterns("Номер эпизода")).toBe(false);
    });
  });

  describe("roundBundleSchema", () => {
    it("should validate correct round structure", () => {
      const validRound = {
        number: 42,
        question: {
          id: "q-42-test",
          number: 42,
          domain: "history",
          text: "Сколько было президентов США до 2020 года?",
          sourceUrl: "https://example.com",
        },
        hint1: {
          id: "h1-42-test",
          number: 42,
          domain: "sports",
          text: "Сколько километров в марафоне?",
        },
        hint2: {
          id: "h2-42-test",
          number: 42,
          domain: "science",
          text: "Сколько хромосом у человека минус 4?",
        },
      };

      const result = roundBundleSchema.safeParse(validRound);
      expect(result.success).toBe(true);
    });

    it("should reject invalid number range", () => {
      const invalidRound = {
        number: 1001,
        question: { id: "q1", number: 1001, domain: "history", text: "Question" },
        hint1: { id: "h1", number: 1001, domain: "sports", text: "Hint 1" },
        hint2: { id: "h2", number: 1001, domain: "science", text: "Hint 2" },
      };

      const result = roundBundleSchema.safeParse(invalidRound);
      expect(result.success).toBe(false);
    });

    it("should reject invalid domain", () => {
      const invalidRound = {
        number: 42,
        question: { id: "q1", number: 42, domain: "invalid_domain", text: "Question" },
        hint1: { id: "h1", number: 42, domain: "sports", text: "Hint 1" },
        hint2: { id: "h2", number: 42, domain: "science", text: "Hint 2" },
      };

      const result = roundBundleSchema.safeParse(invalidRound);
      expect(result.success).toBe(false);
    });

    it("should reject short text", () => {
      const invalidRound = {
        number: 42,
        question: { id: "q1", number: 42, domain: "history", text: "Short" },
        hint1: { id: "h1", number: 42, domain: "sports", text: "Valid hint text here" },
        hint2: { id: "h2", number: 42, domain: "science", text: "Valid hint text here" },
      };

      const result = roundBundleSchema.safeParse(invalidRound);
      expect(result.success).toBe(false);
    });
  });
});