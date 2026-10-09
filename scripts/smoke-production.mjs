import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";

const port = "3107";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_PASSWORD: "smoke-test-password-only",
      OPENAI_API_KEY: "",
    },
    stdio: "ignore",
  },
);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error("Production server exited before startup.");
    try {
      const response = await fetch(origin + "/api/session");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert(ready, "Production server must start");
  const config = await (await fetch(origin + "/api/session")).json();
  assert.equal(config.authenticated, false);
  const headers = { "Content-Type": "application/json", Origin: origin };
  const body = JSON.stringify({
    messages: [{ role: "user", content: "Hello" }],
  });
  assert.equal(
    (await fetch(origin + "/api/chat", { method: "POST", headers, body }))
      .status,
    401,
  );
  const login = await fetch(origin + "/api/session", {
    method: "POST",
    headers,
    body: JSON.stringify({ password: "smoke-test-password-only" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert(cookie?.includes("HttpOnly"));
  assert(cookie?.includes("Secure"));
  const authenticatedHeaders = { ...headers, Cookie: cookie.split(";")[0] };
  assert.equal(
    (
      await (
        await fetch(origin + "/api/session", { headers: authenticatedHeaders })
      ).json()
    ).authenticated,
    true,
  );
  assert.equal(
    (
      await fetch(origin + "/api/chat", {
        method: "POST",
        headers: authenticatedHeaders,
        body,
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await fetch(origin + "/api/session", {
        method: "DELETE",
        headers: authenticatedHeaders,
      })
    ).status,
    200,
  );
  console.log(
    "Production smoke passed: password gate, secure session, missing-key handling, and logout.",
  );
} finally {
  const exited = once(server, "exit");
  server.kill();
  await exited;
}
