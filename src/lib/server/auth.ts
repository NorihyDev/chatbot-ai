import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "nova-session";
export const SESSION_SECONDS = 60 * 60 * 24;
export function authRequired() { return Boolean(process.env.APP_PASSWORD) || process.env.NODE_ENV === "production"; }
export function passwordMatches(value: string) {
  const password = process.env.APP_PASSWORD;
  return Boolean(password) && timingSafeEqual(createHash("sha256").update(value).digest(), createHash("sha256").update(password || "").digest());
}
export function makeSession(now = Date.now()) {
  const expiry = String(Math.floor(now / 1000) + SESSION_SECONDS);
  const signature = createHmac("sha256", process.env.APP_PASSWORD || "").update(expiry).digest("hex");
  return `${expiry}.${signature}`;
}
export function validSession(token: string | undefined, now = Date.now()) {
  if (!process.env.APP_PASSWORD || !token) return false;
  const [expiry, signature, extra] = token.split(".");
  if (extra || !/^\d+$/.test(expiry) || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  const expiresAt = Number(expiry);
  if (expiresAt <= Math.floor(now / 1000) || expiresAt > Math.floor(now / 1000) + SESSION_SECONDS) return false;
  const expected = createHmac("sha256", process.env.APP_PASSWORD).update(expiry).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
