import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { GenerateContentConfig, GenerateContentResponse } from "@google/genai";
import type { ZodType } from "zod";
import { parseJsonLoose } from "./analysis";
import type { Source } from "./types";

// This file reads GEMINI_API_KEY and must only be imported from server code (API routes).

export type GeminiErrorCode =
  | "missing_key"
  | "invalid_key"
  | "quota"
  | "model_unavailable"
  | "blocked"
  | "timeout"
  | "bad_output"
  | "upstream";

export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    public publicMessage: string,
    detail?: string,
  ) {
    super(detail ?? publicMessage);
    this.name = "GeminiError";
  }
}

/** Newest first. If GEMINI_MODEL is set, only that model is used. */
const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
// Vercel stops a route after 60 s (maxDuration in each route file). Every Gemini step gets a total
// time budget below that, so a slow step ends with our own plain "timeout" message, not a raw 504.
const BUDGET_MS = 55_000;
const GROUNDED_CALL_MS = 40_000;
const JSON_CALL_MS = 35_000;
const MIN_USEFUL_MS = 4_000;

/** Time at which the current step must be finished. */
export function newDeadline(budgetMs = BUDGET_MS): number {
  return Date.now() + budgetMs;
}

export function msLeft(deadline: number): number {
  return deadline - Date.now();
}

let preferredModel: string | undefined;

export function modelList(): string[] {
  const forced = process.env.GEMINI_MODEL?.trim();
  if (forced) return [forced];
  if (preferredModel) return [preferredModel, ...DEFAULT_MODELS.filter((m) => m !== preferredModel)];
  return DEFAULT_MODELS;
}

export function isConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key) && !key!.startsWith("your_");
}

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key.startsWith("your_")) {
    throw new GeminiError(
      "missing_key",
      "The server has no Gemini API key. Add GEMINI_API_KEY to .env.local (local) or to the Vercel environment variables (live).",
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

function classify(e: unknown): GeminiError {
  if (e instanceof GeminiError) return e;
  const status = e instanceof ApiError ? e.status : (e as { status?: number } | null)?.status;
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("quota")) {
    return new GeminiError("quota", "Gemini's rate or quota limit was reached. Wait a minute and try again.", msg);
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid") ||
    lower.includes("permission_denied")
  ) {
    return new GeminiError("invalid_key", "Gemini rejected the API key. Check GEMINI_API_KEY and that the key is active.", msg);
  }
  if (status === 404 || lower.includes("is not found") || lower.includes("not supported for generatecontent")) {
    return new GeminiError("model_unavailable", "That Gemini model is not available to this key.", msg);
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort") || lower.includes("deadline")) {
    return new GeminiError("timeout", "Gemini took too long to answer. Try again.", msg);
  }
  return new GeminiError("upstream", "Gemini returned an error. Try again in a moment.", msg);
}

async function generate(
  ai: GoogleGenAI,
  model: string,
  contents: string,
  config: GenerateContentConfig,
  deadline: number,
  callMs: number,
): Promise<GenerateContentResponse> {
  const left = msLeft(deadline);
  if (left < MIN_USEFUL_MS) {
    throw new GeminiError("timeout", "Gemini took too long to answer. Try again.", "time budget used up");
  }
  const base: GenerateContentConfig = { ...config, httpOptions: { timeout: Math.min(callMs, left) } };
  // Gemini 3 models accept a thinking level; a lower level is faster and cheaper for this task.
  if (model.startsWith("gemini-3")) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: { ...base, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!/thinking/i.test(msg)) throw e;
    }
  }
  return ai.models.generateContent({ model, contents, config: base });
}

async function withModelFallback<T>(fn: (ai: GoogleGenAI, model: string) => Promise<T>): Promise<{ value: T; model: string }> {
  const ai = getClient();
  let last: GeminiError | undefined;
  for (const model of modelList()) {
    try {
      const value = await fn(ai, model);
      preferredModel = model;
      return { value, model };
    } catch (e) {
      const err = classify(e);
      last = err;
      // Quota is per model and demand spikes hit one model at a time, so try the next model.
      if (!["model_unavailable", "quota", "upstream", "timeout"].includes(err.code)) throw err;
    }
  }
  throw last ?? new GeminiError("model_unavailable", "No Gemini model was available to this key.");
}

function assertUsable(res: GenerateContentResponse): string {
  const blockReason = res.promptFeedback?.blockReason;
  if (blockReason) {
    throw new GeminiError("blocked", "Gemini declined to answer this question.", `blocked: ${blockReason}`);
  }
  const text = res.text?.trim();
  if (!text) {
    throw new GeminiError("bad_output", "Gemini returned an empty answer. Try again.");
  }
  return text;
}

const ASK_SYSTEM =
  "You are a helpful assistant answering a customer's question about places to eat or drink. " +
  "Be concise (under 220 words). Name specific places and include opening hours, " +
  "prices and locations only when you are confident of them. If you are unsure of a fact, say so.";

export interface GroundedAnswer {
  text: string;
  sources: Source[];
  model: string;
}

/**
 * One answer to a customer question. Google Search grounding is NOT used: it needs a paid Gemini
 * tier, so the answer is the model's own knowledge and no sources are returned.
 */
export async function askGrounded(question: string): Promise<GroundedAnswer> {
  const deadline = newDeadline();
  const { value, model } = await withModelFallback(async (ai, m) => {
    const res = await generate(ai, m, question, { systemInstruction: ASK_SYSTEM }, deadline, GROUNDED_CALL_MS);
    const sources: Source[] = [];
    return { text: assertUsable(res), sources };
  });
  return { ...value, model };
}

export interface JsonResult<T> {
  data: T;
  model: string;
}

/**
 * Ask for JSON, validate it with a zod schema, and retry once if the output is malformed.
 * Pass the same `deadline` to several calls in one route so their total stays under the Vercel limit.
 * Temperature is left at the default: Google recommends 1.0 for Gemini 3 models.
 */
export async function generateJson<T>(
  system: string,
  prompt: string,
  schema: ZodType<T>,
  opts: { deadline?: number } = {},
): Promise<JsonResult<T>> {
  const deadline = opts.deadline ?? newDeadline();
  const { value, model } = await withModelFallback(async (ai, m) => {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      // Do not start a second try with too little time left to finish it.
      if (attempt === 1 && msLeft(deadline) < 12_000) break;
      const contents = attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was not valid. Return ONLY one valid JSON object. Problem: ${lastError}`;
      const res = await generate(ai, m, contents, { systemInstruction: system, responseMimeType: "application/json" }, deadline, JSON_CALL_MS);
      const text = assertUsable(res);
      try {
        return schema.parse(parseJsonLoose(text));
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 300) : "invalid JSON";
      }
    }
    throw new GeminiError("bad_output", "Gemini returned output the app could not read. Please try again.", lastError);
  });
  return { data: value, model };
}

/** Tiny live call used by /api/health?live=1. Returns no secrets. */
export async function ping(): Promise<{ model: string; latencyMs: number }> {
  const started = Date.now();
  const { value, model } = await withModelFallback(async (ai, m) => {
    const res = await generate(ai, m, "Reply with the single word OK.", {}, newDeadline(30_000), 25_000);
    return assertUsable(res);
  });
  void value;
  return { model, latencyMs: Date.now() - started };
}
