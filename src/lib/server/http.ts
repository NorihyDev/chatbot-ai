export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Read incrementally: Content-Length cannot be trusted for chunked requests.
export async function readJson(
  request: Request,
  maxBytes = 180_000,
): Promise<unknown> {
  if (!request.body) throw new HttpError(400, "A request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Your message is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new HttpError(400, "Send a valid JSON request.");
    }
  } finally {
    reader.releaseLock();
  }
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return true;
  try {
    const browserOrigin = new URL(origin);
    // Next.js may use an internal localhost URL. Browsers cannot override Host;
    // the reverse proxy must preserve the original host for this comparison.
    const host = request.headers.get("host") || new URL(request.url).host;
    return (
      ["http:", "https:"].includes(browserOrigin.protocol) &&
      origin === browserOrigin.origin &&
      browserOrigin.host === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
