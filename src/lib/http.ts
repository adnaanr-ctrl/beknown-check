import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { GeminiError } from "./gemini";
import { allow, clientKey } from "./ratelimit";

export function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function geminiErrorResponse(e: unknown) {
  if (e instanceof GeminiError) {
    console.error(`Gemini error [${e.code}]:`, e.message.slice(0, 400));
    const status =
      e.code === "quota" ? 429 : e.code === "missing_key" || e.code === "invalid_key" ? 500 : e.code === "timeout" ? 504 : 502;
    return errorResponse(e.code, e.publicMessage, status);
  }
  console.error("Unexpected error:", e instanceof Error ? e.message : "unknown");
  return errorResponse("unknown", "Something went wrong on the server. Please try again.", 500);
}

/** Rate-limit, parse and validate a JSON request body. */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  if (!allow(clientKey(req))) {
    return { ok: false, res: errorResponse("rate_limited", "Too many requests. Please wait a few minutes and try again.", 429) };
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: errorResponse("bad_request", "The request was not valid JSON.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, res: errorResponse("invalid_input", first ? first.message : "Invalid input.", 400) };
  }
  return { ok: true, data: parsed.data };
}
