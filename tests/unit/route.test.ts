import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { create, cookieGet, limiterTake } = vi.hoisted(() => ({
  create: vi.fn(),
  cookieGet: vi.fn(),
  limiterTake: vi.fn(),
}));
vi.mock("openai", () => {
  class APIError extends Error {
    status = 429;
  }
  class Client {
    static APIError = APIError;
    responses = { create };
  }
  return { default: Client };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("@/lib/server/rate-limit", () => ({
  chatLimiter: { take: limiterTake },
}));
import { POST } from "@/app/api/chat/route";

function request(
  body: unknown = { messages: [{ role: "user", content: "Hello" }] },
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("APP_PASSWORD", "");
  vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
  create.mockReset();
  cookieGet.mockReset();
  limiterTake.mockReset().mockReturnValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe("AI route", () => {
  it("streams provider text and explicitly disables response storage", async () => {
    create.mockResolvedValue(
      (async function* () {
        yield { type: "response.output_text.delta", delta: "Hello" };
        yield { type: "response.completed" };
      })(),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      '{"type":"delta","text":"Hello"}\n{"type":"done"}\n',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        stream: true,
        max_output_tokens: 4096,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("rejects unauthenticated production calls", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
  it("returns a setup error for a missing key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before calling the provider", async () => {
    expect(
      (await POST(request(undefined, { origin: "https://evil.test" }))).status,
    ).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects invalid history", async () => {
    expect(
      (await POST(request({ messages: [{ role: "system", content: "Oops" }] })))
        .status,
    ).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("limits chat requests", async () => {
    limiterTake.mockReturnValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });
  it("marks partial provider output as an error", async () => {
    create.mockResolvedValue(
      (async function* () {
        yield { type: "response.output_text.delta", delta: "Partial" };
        yield { type: "response.incomplete" };
      })(),
    );
    const body = await (await POST(request())).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"done"');
  });
  it("does not expose provider secrets when a request fails", async () => {
    create.mockRejectedValue(new Error("private-provider-detail"));
    const res = await POST(request());
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("private-provider-detail");
  });
});
