import { z } from "zod";
import type { Conversation } from "./chat";

export const STORAGE_KEY = "nova-conversations-v1";
export const THEME_KEY = "nova-theme-v1";
export const MAX_CONVERSATIONS = 80;
const schema = z.array(z.object({
  id: z.string().max(100), title: z.string().max(160), updatedAt: z.number().finite(),
  messages: z.array(z.object({
    id: z.string().max(100), role: z.enum(["user", "assistant"]), content: z.string().max(100_000),
    status: z.enum(["complete", "stopped", "error"]).optional(),
  })).max(500),
})).max(MAX_CONVERSATIONS);

export function parseConversations(raw: string | null): Conversation[] {
  if (!raw || raw.length > 4_000_000) return [];
  try { const parsed = schema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : []; }
  catch { return []; }
}
export function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "New conversation", updatedAt: Date.now(), messages: [] };
}
