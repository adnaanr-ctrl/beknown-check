import { NextResponse } from "next/server";
import { GeminiError, isConfigured, modelList, ping } from "@/lib/gemini";
import { errorResponse, geminiErrorResponse } from "@/lib/http";
import { allow, clientKey } from "@/lib/ratelimit";

export const maxDuration = 60;

/**
 * GET /api/health            -> is a key configured? (never returns the key)
 * GET /api/health?live=1     -> makes one tiny Gemini call to prove the key and model work
 */
export async function GET(req: Request) {
  const configured = isConfigured();
  const live = new URL(req.url).searchParams.get("live") === "1";
  if (!live) return NextResponse.json({ ok: configured, configured, modelsTried: modelList() });
  if (!allow(clientKey(req))) return errorResponse("rate_limited", "Too many requests. Wait a few minutes.", 429);
  if (!configured) return geminiErrorResponse(new GeminiError("missing_key", "GEMINI_API_KEY is not set."));
  try {
    const result = await ping();
    return NextResponse.json({ ok: true, configured: true, ...result });
  } catch (e) {
    return geminiErrorResponse(e);
  }
}
