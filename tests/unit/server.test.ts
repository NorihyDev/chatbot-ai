import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authRequired,
  makeSession,
  passwordMatches,
  validSession,
  SESSION_SECONDS,
} from "@/lib/server/auth";
import { isSameOrigin, readJson } from "@/lib/server/http";
import { RateLimiter } from "@/lib/server/rate-limit";
afterEach(() => vi.unstubAllEnvs());
describe("workspace authentication", () => {
  it("requires authentication in production even without a password", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", "");
    expect(authRequired()).toBe(true);
    expect(validSession(undefined)).toBe(false);
  });
  it("checks the password without accepting an empty secret", () => {
    vi.stubEnv("APP_PASSWORD", "test-secret");
    expect(passwordMatches("test-secret")).toBe(true);
    expect(passwordMatches("wrong")).toBe(false);
    vi.stubEnv("APP_PASSWORD", "");
    expect(passwordMatches("")).toBe(false);
  });
  it("rejects expired, forged, and malformed sessions", () => {
    vi.stubEnv("APP_PASSWORD", "test-secret");
    const now = 1_700_000_000_000;
    const token = makeSession(now);
    expect(validSession(token, now)).toBe(true);
    expect(validSession(token, now + SESSION_SECONDS * 1000)).toBe(false);
    expect(
      validSession(token.replace(/.$/, token.endsWith("0") ? "1" : "0"), now),
    ).toBe(false);
    expect(validSession("bad", now)).toBe(false);
    expect(validSession(token + ".extra", now)).toBe(false);
    vi.stubEnv("APP_PASSWORD", "rotated");
    expect(validSession(token, now)).toBe(false);
  });
});
describe("HTTP boundaries", () => {
  it("compares the browser host when Next uses an internal URL", () => {
    expect(
      isSameOrigin(
        new Request("http://localhost:3107/api/chat", {
          headers: { origin: "https://nova.example", host: "nova.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("http://localhost:3107/api/chat", {
          headers: { origin: "https://evil.example", host: "nova.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(
        new Request("http://localhost:3107/api/chat", {
          headers: { origin: "null", host: "nova.example" },
        }),
      ),
    ).toBe(false);
  });
  it("rejects oversized bodies without trusting Content-Length", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(100) }),
    });
    await expect(readJson(req, 20)).rejects.toMatchObject({ status: 413 });
  });
  it("reports malformed JSON", async () => {
    await expect(
      readJson(new Request("http://localhost", { method: "POST", body: "{" })),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects cross-origin requests", () => {
    expect(
      isSameOrigin(
        new Request("http://localhost/api/chat", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(
        new Request("http://localhost/api/chat", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(
        new Request("http://localhost/api/chat", {
          headers: { origin: "http://localhost" },
        }),
      ),
    ).toBe(true);
  });
});
describe("rate limiting", () => {
  it("enforces a budget and resets after the window", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.take("one", 0)).toBe(true);
    expect(limiter.take("one", 1)).toBe(true);
    expect(limiter.take("one", 2)).toBe(false);
    expect(limiter.take("other", 2)).toBe(true);
    expect(limiter.take("one", 1000)).toBe(true);
  });
});
