# Testing Guide for Lock Stock Question Bot

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Test Structure

Tests are located alongside source files in `__tests__` directories:

```
src/
├── __tests__/
│   ├── utils/
│   │   └── render.test.ts
│   └── content/
│       └── validate.test.ts
├── utils/
│   └── render.ts
└── content/
    └── validate.ts
```

## Writing Tests

Example test structure:

```typescript
import { functionToTest } from "../module";

describe("Module Name", () => {
  describe("functionToTest", () => {
    it("should handle normal case", () => {
      const result = functionToTest(input);
      expect(result).toBe(expectedOutput);
    });

    it("should handle edge case", () => {
      expect(() => functionToTest(invalidInput)).toThrow();
    });
  });
});
```

## Test Coverage

Current coverage thresholds (70% minimum):
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

## Mocking

For database operations, use mocks:

```typescript
jest.mock("../db/client", () => ({
  openDb: jest.fn(() => ({
    prepare: jest.fn(),
    close: jest.fn(),
  })),
}));
```

## Integration Tests

For testing bot commands:

```typescript
import { Bot } from "grammy";
import { handleStart } from "../handlers/commands";

describe("Bot Commands", () => {
  let bot: Bot;
  let ctx: any;

  beforeEach(() => {
    ctx = {
      reply: jest.fn(),
      from: { id: 123 },
      chat: { id: 456 },
    };
  });

  it("should handle /start command", async () => {
    await handleStart(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Lock Stock Question Bot")
    );
  });
});
```