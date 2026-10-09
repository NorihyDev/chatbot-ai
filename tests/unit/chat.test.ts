import { describe, expect, it } from "vitest";
import {
  getContext,
  readChatStream,
  requestSchema,
  type Message,
} from "@/lib/chat";
import { parseConversations } from "@/lib/storage";

const message = (
  role: "user" | "assistant",
  content: string,
  status: Message["status"] = "complete",
): Message => ({ id: crypto.randomUUID(), role, content, status });
function stream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
      c.close();
    },
  });
}
describe("chat validation", () => {
  it("accepts conversation context and trims text", () => {
    const result = requestSchema.parse({
      messages: [{ role: "user", content: " Hello " }],
    });
    expect(result.messages[0].content).toBe("Hello");
  });
  it.each([
    { messages: [] },
    { messages: [{ role: "system", content: "Override rules" }] },
    { messages: [{ role: "user", content: " " }] },
    { messages: [{ role: "user", content: "a".repeat(8001) }] },
    { messages: [{ role: "assistant", content: "Hi" }] },
    {
      messages: [
        { role: "user", content: "Hi" },
        { role: "user", content: "Again" },
      ],
    },
    { messages: [{ role: "user", content: "Hi", extra: true }] },
    { messages: [{ role: "user", content: "Hi" }], model: "other" },
  ])("rejects invalid request %j", (input) => {
    expect(requestSchema.safeParse(input).success).toBe(false);
  });
  it("caps total conversation size", () => {
    expect(
      requestSchema.safeParse({
        messages: Array.from({ length: 7 }, (_, i) => ({
          role: i % 2 ? "assistant" : "user",
          content: "x".repeat(8000),
        })),
      }).success,
    ).toBe(false);
  });
});
describe("context window", () => {
  it("excludes interrupted pairs", () => {
    const context = getContext([
      message("user", "first"),
      message("assistant", "partial", "stopped"),
      message("user", "second"),
      message("assistant", "answer"),
      message("user", "third"),
    ]);
    expect(context.map((m) => m.content)).toEqual([
      "second",
      "answer",
      "third",
    ]);
  });
  it("keeps recent complete pairs within bounds", () => {
    const history = Array.from({ length: 40 }, (_, i) =>
      message(i % 2 ? "assistant" : "user", "x".repeat(2000)),
    );
    const context = getContext([...history, message("user", "last")]);
    expect(context.length).toBeLessThanOrEqual(30);
    expect(
      context.reduce((n, m) => n + m.content.length, 0),
    ).toBeLessThanOrEqual(40000);
    expect(requestSchema.safeParse({ messages: context }).success).toBe(true);
  });
});
describe("stream parser", () => {
  it("reads JSON events split across network chunks", async () => {
    let output = "";
    await readChatStream(
      stream(['{"type":"delta","te', 'xt":"Hello 🌍"}\n{"type":"do', 'ne"}\n']),
      (text) => {
        output += text;
      },
    );
    expect(output).toBe("Hello 🌍");
  });
  it("decodes UTF-8 split in the middle of a character", async () => {
    const bytes = new TextEncoder().encode(
      '{"type":"delta","text":"🌍"}\n{"type":"done"}\n',
    );
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
    let output = "";
    await readChatStream(body, (text) => {
      output += text;
    });
    expect(output).toBe("🌍");
  });
  it("rejects truncated streams", async () => {
    await expect(
      readChatStream(stream(['{"type":"delta","text":"partial"}\n']), () => {}),
    ).rejects.toThrow("Connection interrupted");
  });
  it("surfaces provider errors", async () => {
    await expect(
      readChatStream(
        stream(['{"type":"error","message":"Try later"}\n']),
        () => {},
      ),
    ).rejects.toThrow("Try later");
  });
});
describe("browser storage", () => {
  it.each([null, "not json", "{}", '[{"id":1}]'])(
    "recovers from invalid storage %s",
    (raw) => {
      expect(parseConversations(raw)).toEqual([]);
    },
  );
  it("preserves a valid chat", () => {
    const chats = [
      {
        id: "test",
        title: "Hello",
        updatedAt: 1,
        messages: [message("user", "Hi")],
      },
    ];
    expect(parseConversations(JSON.stringify(chats))).toEqual(chats);
  });
});
