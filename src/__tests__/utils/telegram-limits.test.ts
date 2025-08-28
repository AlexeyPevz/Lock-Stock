import { TELEGRAM_LIMITS, validateCallbackData, truncateMessage, splitLongMessage, safeCallbackData } from "../../utils/telegram-limits";

describe("telegram-limits utils", () => {
  it("validateCallbackData respects 64 bytes limit", () => {
    const within = "a".repeat(64);
    expect(validateCallbackData(within)).toBe(true);
    const over = "a".repeat(65);
    expect(validateCallbackData(over)).toBe(false);
  });

  it("truncateMessage short strings unchanged", () => {
    const s = "hello";
    expect(truncateMessage(s)).toBe(s);
  });

  it("truncateMessage long strings truncated with suffix", () => {
    const long = "x".repeat(TELEGRAM_LIMITS.MAX_MESSAGE_LENGTH + 50);
    const out = truncateMessage(long);
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_LIMITS.MAX_MESSAGE_LENGTH);
    expect(out.endsWith("...")),
    expect(out).not.toBe(long);
  });

  it("splitLongMessage splits into chunks", () => {
    const long = ("line ".repeat(1000)).trim();
    const parts = splitLongMessage(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ")).toContain("line");
  });

  it("safeCallbackData returns hash when over limit", () => {
    const bigId = "x".repeat(200);
    const data = safeCallbackData("fb:rate", bigId, 42, 5);
    expect(validateCallbackData(data)).toBe(true);
    expect(data.includes(":h:")).toBe(true);
  });
});
