export class BodyTooLargeError extends Error {
  constructor() {
    super("BodyTooLarge");
    this.name = "BodyTooLargeError";
  }
}

function merge(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) {
    throw new BodyTooLargeError();
  }
  const body = request.body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > maxBytes) {
          throw new BodyTooLargeError();
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }
  if (chunks.length === 0) return null;
  const text = new TextDecoder().decode(merge(chunks));
  return JSON.parse(text);
}
