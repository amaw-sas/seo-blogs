import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: "test response" } }],
  });
  return {
    default: class {
      chat = { completions: { create } };
    },
  };
});

describe("chatCompletion", () => {
  let chatCompletion: typeof import("./openai-client").chatCompletion;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";

    const mod = await import("./openai-client");
    chatCompletion = mod.chatCompletion;

    const OpenAI = (await import("openai")).default;
    const instance = new OpenAI();
    mockCreate = vi.mocked(instance.chat.completions.create);
  });

  it("passes temperature to OpenAI when provided", async () => {
    await chatCompletion("prompt", 8000, 0.7);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });

  it("passes undefined temperature when not provided", async () => {
    await chatCompletion("prompt", 8000);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: undefined }),
    );
  });

  it("passes max_tokens correctly", async () => {
    await chatCompletion("prompt", 16000);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 16000 }),
    );
  });
});
