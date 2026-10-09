import OpenAI from "openai";
import { cookies } from "next/headers";
import { requestSchema, type StreamEvent } from "@/lib/chat";
import { authRequired, SESSION_COOKIE, validSession } from "@/lib/server/auth";
import { HttpError, isSameOrigin, jsonError, readJson } from "@/lib/server/http";
import { chatLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Request origin is not allowed.", 403);
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (authRequired() && !validSession(session)) return jsonError("Please sign in to continue.", 401);
  if (!process.env.OPENAI_API_KEY) return jsonError("Add OPENAI_API_KEY to .env.local and restart the server to enable AI replies.", 503);
  if (!chatLimiter.take("owner")) return jsonError("You're sending messages too quickly. Try again in one minute.", 429);

  const upstream = new AbortController();
  const abort = () => upstream.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 110_000);
  function cleanup() { clearTimeout(timer); request.signal.removeEventListener("abort", abort); }

  try {
    const parsed = requestSchema.safeParse(await readJson(request));
    if (!parsed.success) { cleanup(); return jsonError(parsed.error.issues[0]?.message || "Invalid chat messages.", 400); }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 105_000 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: "You are Nova, a thoughtful and capable assistant. Answer clearly and accurately in the user's language. Use Markdown when helpful and language labels on code blocks. Be honest about uncertainty. Do not claim to browse the web, run code, or access files; you do not have tools. Never fabricate sources.",
      input: parsed.data.messages,
      stream: true,
      store: false,
      max_output_tokens: 4096,
    }, { signal: upstream.signal });

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        let completed = false;
        try {
          for await (const event of response) {
            if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") send({ type: "delta", text: event.delta });
            if (event.type === "response.completed") { completed = true; send({ type: "done" }); }
            if (event.type === "response.failed" || event.type === "error") throw new Error("Provider failed");
            if (event.type === "response.incomplete") throw new Error("Response incomplete");
          }
          if (!completed && !upstream.signal.aborted) send({ type: "error", message: "The response was interrupted. Please retry." });
        } catch {
          if (!upstream.signal.aborted) send({ type: "error", message: "The AI response was interrupted. Please retry." });
          else { try { send({ type: "error", message: "The response timed out or was stopped. Please retry." }); } catch {} }
        } finally { cleanup(); try { controller.close(); } catch {} }
      },
      cancel() { upstream.abort(); cleanup(); },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    cleanup();
    if (error instanceof HttpError) return jsonError(error.message, error.status);
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) return jsonError("The AI provider's quota or rate limit was reached. Check your OpenAI billing or try later.", 429);
      if (error.status === 401 || error.status === 403) return jsonError("The server's AI credentials need attention. Check your OpenAI API key and model access.", 502);
    }
    return jsonError(upstream.signal.aborted ? "The request timed out or was stopped. Try again." : "Couldn't reach the AI provider. Please try again.", 502);
  }
}
