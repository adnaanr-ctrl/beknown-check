import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { askGrounded, generateJson } from "@/lib/gemini";

// The real gemini.ts and the real SDK run here; only the network (fetch) is faked.
type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];

function reply(status: number, json: unknown) {
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
}
const ok = (text: string, chunks: unknown[] = []) =>
  reply(200, { candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: chunks } }] });

function fakeFetch(handler: (n: number, url: string) => Response) {
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return handler(calls.length, String(url));
  });
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("GEMINI_API_KEY", "fake-key-for-tests");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("gemini.ts against a fake Gemini server", () => {
  it("asks without Google Search and returns no sources", async () => {
    fakeFetch(() => ok("Try Fruit Shop."));
    const r = await askGrounded("Best juice bars in Kilpauk?");
    expect(r.text).toBe("Try Fruit Shop.");
    expect(r.sources).toEqual([]);
    expect(calls[0].body.tools).toBeUndefined();
  });

  it("JSON calls ask for JSON and do not set a temperature", async () => {
    fakeFetch(() => ok('{"a":1}'));
    const r = await generateJson("sys", "prompt", z.object({ a: z.number() }));
    expect(r.data.a).toBe(1);
    const cfg = calls[0].body.generationConfig as Record<string, unknown>;
    expect(cfg.responseMimeType).toBe("application/json");
    expect(cfg.temperature).toBeUndefined();
  });

  it("falls back to the next model when the first is not found", async () => {
    fakeFetch((n) => (n === 1 ? reply(404, { error: { code: 404, message: "models/x is not found", status: "NOT_FOUND" } }) : ok("hi")));
    const r = await askGrounded("Best juice bars in Kilpauk?");
    expect(r.text).toBe("hi");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).not.toBe(calls[1].url);
  });

  it("retries without the thinking setting if the API rejects it", async () => {
    fakeFetch((n) => (n === 1 ? reply(400, { error: { code: 400, message: "thinking level is not supported", status: "INVALID_ARGUMENT" } }) : ok("hi")));
    const r = await askGrounded("Best juice bars in Kilpauk?");
    expect(r.text).toBe("hi");
    expect((calls[1].body.generationConfig as Record<string, unknown> | undefined)?.thinkingConfig).toBeUndefined();
  });

  it("maps 429 to quota and a bad key to invalid_key, with no raw API text", async () => {
    fakeFetch(() => reply(429, { error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" } }));
    await expect(askGrounded("Best juice bars in Kilpauk?")).rejects.toMatchObject({ code: "quota" });
    fakeFetch(() => reply(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }));
    await expect(askGrounded("Best juice bars in Kilpauk?")).rejects.toMatchObject({ code: "invalid_key" });
  });

  it("retries once when the JSON is malformed, then gives up with bad_output", async () => {
    fakeFetch(() => ok("this is not json"));
    await expect(generateJson("sys", "prompt", z.object({ a: z.number() }))).rejects.toMatchObject({ code: "bad_output" });
    expect(calls).toHaveLength(2);
  });
});
