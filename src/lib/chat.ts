import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 8_000;
export const MAX_CONTEXT_LENGTH = 40_000;
export const MAX_CONTEXT_MESSAGES = 30;

export const requestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CONTEXT_MESSAGES),
  })
  .strict()
  .superRefine(({ messages }, ctx) => {
    if (messages.at(-1)?.role !== "user")
      ctx.addIssue({
        code: "custom",
        message: "The last message must be from you.",
      });
    if (
      messages.reduce((sum, m) => sum + m.content.length, 0) >
      MAX_CONTEXT_LENGTH
    ) {
      ctx.addIssue({
        code: "custom",
        message: "This conversation is too long. Start a new chat.",
      });
    }
    if (
      messages.some((m, i) => m.role !== (i % 2 === 0 ? "user" : "assistant"))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Messages must alternate between user and assistant.",
      });
    }
  });

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "complete" | "stopped" | "error";
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

// Keep complete pairs. An interrupted answer should never become model context.
export function getContext(messages: Message[]) {
  const pairs: { role: "user" | "assistant"; content: string }[][] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const user = messages[i];
    const assistant = messages[i + 1];
    if (
      user.role === "user" &&
      assistant.role === "assistant" &&
      (!assistant.status || assistant.status === "complete") &&
      assistant.content
    ) {
      pairs.push([
        { role: "user", content: user.content },
        {
          role: "assistant",
          content: assistant.content.slice(0, MAX_MESSAGE_LENGTH),
        },
      ]);
      i++;
    }
  }
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") return [];
  const result: { role: "user" | "assistant"; content: string }[] = [
    { role: latest.role, content: latest.content },
  ];
  let length = latest.content.length;
  for (const pair of pairs.reverse()) {
    const size = pair.reduce((n, m) => n + m.content.length, 0);
    if (
      result.length + 2 > MAX_CONTEXT_MESSAGES ||
      length + size > MAX_CONTEXT_LENGTH
    )
      break;
    result.unshift(...pair);
    length += size;
  }
  return result;
}

export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  function parse(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "delta" && typeof event.text === "string")
      onDelta(event.text);
    else if (event.type === "error")
      throw new Error(event.message || "The response was interrupted.");
    else if (event.type === "done") done = true;
    else throw new Error("Unexpected response from the server.");
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done
        ? decoder.decode()
        : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 100_000)
        throw new Error("The response could not be read.");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) parse(line);
      if (chunk.done) break;
    }
    if (buffer.trim()) parse(buffer);
    if (!done)
      throw new Error("Connection interrupted. You can retry the response.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
