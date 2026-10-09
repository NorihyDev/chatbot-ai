import { cookies } from "next/headers";
import {
  authRequired,
  makeSession,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_SECONDS,
  validSession,
} from "@/lib/server/auth";
import {
  HttpError,
  isSameOrigin,
  jsonError,
  readJson,
} from "@/lib/server/http";
import { loginLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  return Response.json(
    {
      authenticated:
        !authRequired() || validSession(jar.get(SESSION_COOKIE)?.value),
      passwordConfigured: Boolean(process.env.APP_PASSWORD),
      ready: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return jsonError("Request origin is not allowed.", 403);
  // Global login budget avoids relying on spoofable forwarding headers.
  if (!loginLimiter.take("login"))
    return jsonError("Too many attempts. Try again in one minute.", 429);
  try {
    const body = await readJson(request, 2_048);
    if (
      !body ||
      typeof body !== "object" ||
      !("password" in body) ||
      typeof body.password !== "string" ||
      !passwordMatches(body.password)
    ) {
      return jsonError("That password isn't correct.", 401);
    }
    const jar = await cookies();
    jar.set(SESSION_COOKIE, makeSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof HttpError ? error.message : "Could not sign in.",
      error instanceof HttpError ? error.status : 500,
    );
  }
}
export async function DELETE(request: Request) {
  if (!isSameOrigin(request))
    return jsonError("Request origin is not allowed.", 403);
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
