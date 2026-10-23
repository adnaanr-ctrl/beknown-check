import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Gemini layer so route validation and post-processing can be tested without a key or network.
vi.mock("@/lib/gemini", async () => {
  class GeminiError extends Error {
    constructor(
      public code: string,
      public publicMessage: string,
    ) {
      super(publicMessage);
    }
  }
  return {
    GeminiError,
    askGrounded: vi.fn(),
    generateJson: vi.fn(),
    ping: vi.fn(),
    isConfigured: vi.fn(() => true),
    modelList: vi.fn(() => ["test-model"]),
    newDeadline: vi.fn(() => Date.now() + 55_000),
    msLeft: vi.fn((d: number) => d - Date.now()),
  };
});

import { POST as askRoute } from "@/app/api/ask/route";
import { POST as analyzeRoute } from "@/app/api/analyze/route";
import { POST as questionsRoute } from "@/app/api/questions/route";
import * as gemini from "@/lib/gemini";

const profile = {
  name: "Juice Pump",
  area: "Kilpauk, Chennai",
  type: "juice-bar",
  language: "tamil-english",
  facts: { hours: "11 AM to 11 PM", priceRange: "", outlets: "", seating: "", signatureItems: "", other: "" },
};

const req = (body: unknown, ip = "1.2.3.4") =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } });

beforeEach(() => vi.clearAllMocks());

describe("input validation", () => {
  it("rejects a short question", async () => {
    const res = await askRoute(req({ question: "hi" }, "10.0.0.1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
  });
  it("rejects a missing business name", async () => {
    const res = await questionsRoute(req({ profile: { ...profile, name: "" } }, "10.0.0.2"));
    expect(res.status).toBe(400);
  });
  it("rejects invalid JSON", async () => {
    const res = await askRoute(new Request("http://localhost/api", { method: "POST", body: "not json", headers: { "x-forwarded-for": "10.0.0.3" } }));
    expect(res.status).toBe(400);
  });
});

describe("/api/ask", () => {
  it("returns the grounded answer", async () => {
    vi.mocked(gemini.askGrounded).mockResolvedValue({ text: "Juice Pump is on Ormes Road.", sources: [{ title: "x", uri: "https://example.com/a" }], model: "test-model" });
    const res = await askRoute(req({ question: "Best juice shop in Kilpauk?" }, "10.0.0.4"));
    expect(res.status).toBe(200);
    expect((await res.json()).text).toContain("Ormes Road");
  });
  it("maps a quota error to 429 with a plain message", async () => {
    vi.mocked(gemini.askGrounded).mockRejectedValue(new gemini.GeminiError("quota", "Gemini's rate or quota limit was reached."));
    const res = await askRoute(req({ question: "Best juice shop in Kilpauk?" }, "10.0.0.5"));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("quota");
  });
});

describe("oversized model output no longer fails the analysis", () => {
  it("trims long text, drops over-long or excess source links, and still answers", async () => {
    vi.mocked(gemini.generateJson).mockResolvedValue({
      model: "test-model",
      data: { answers: [], claims: [], notStated: [], gaps: [], summary: "ok" },
    });
    const sources = [
      { title: "t".repeat(500), uri: "https://example.com/ok" },
      { title: "long", uri: "https://example.com/" + "a".repeat(1100) },
      ...Array.from({ length: 30 }, (_, i) => ({ title: "s", uri: `https://example.com/${i}` })),
    ];
    const answers = [{ index: 0, question: "Best juice bars in Kilpauk?", text: "x".repeat(7000), sources }];
    const res = await analyzeRoute(req({ profile, answers }, "10.0.1.1"));
    expect(res.status).toBe(200);
    const prompt = vi.mocked(gemini.generateJson).mock.calls[0][1];
    expect(prompt).not.toContain("a".repeat(1100)); // the 1100-char link was dropped
    expect(prompt).not.toContain("x".repeat(6001)); // text was cut to 6000
    expect(prompt.match(/https:\/\/example\.com\//g)!.length).toBeLessThanOrEqual(20); // at most 20 links kept
  });
});

describe("/api/questions", () => {
  it("falls back to templates when the model output is unreadable", async () => {
    vi.mocked(gemini.generateJson).mockRejectedValue(new gemini.GeminiError("bad_output", "unreadable"));
    const res = await questionsRoute(req({ profile }, "10.0.0.6"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.source).toBe("template");
    expect(json.questions).toHaveLength(6);
  });
  it("repairs a model list that leaks the business name into unnamed questions", async () => {
    vi.mocked(gemini.generateJson).mockResolvedValue({
      model: "test-model",
      data: { questions: [{ text: "Is Juice Pump good?", namesBusiness: false }, { text: "Best juice bars in Kilpauk?", namesBusiness: false }] },
    });
    const json = await (await questionsRoute(req({ profile }, "10.0.0.7"))).json();
    expect(json.questions).toHaveLength(6);
    expect(json.questions.filter((q: { namesBusiness: boolean }) => q.namesBusiness)).toHaveLength(1);
  });
});

describe("/api/analyze", () => {
  const answers = [
    { index: 0, question: "Best juice bars in Kilpauk?", text: "Try Juice Pump on Ormes Road, open until 10 PM.", sources: [{ title: "s", uri: "https://example.com/a" }] },
    { index: 1, question: "Late night juice?", text: "Try Fruit Shop on Greams Road.", sources: [] },
  ];

  it("keeps only source links the answers actually listed and forces 'unchecked' without an owner value", async () => {
    vi.mocked(gemini.generateJson).mockResolvedValue({
      model: "test-model",
      data: {
        answers: [{ index: 0, businesses: ["Juice Pump"], targetNamed: false, targetRank: null }],
        claims: [
          { field: "hours", claim: "Open until 10 PM", status: "conflict", ownerValue: "11 AM to 11 PM", answerIndexes: [0], answersDisagree: false, note: "", sourceUrl: "https://example.com/a" },
          { field: "menu", claim: "Sells falooda", status: "match", ownerValue: null, answerIndexes: [0], answersDisagree: false, note: "", sourceUrl: "https://made-up.example/zzz" },
        ],
        notStated: [],
        gaps: [],
        summary: "ok",
      },
    });
    const res = await analyzeRoute(req({ profile, answers }, "10.0.0.8"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.claims[0].status).toBe("conflict");
    expect(json.claims[0].sourceUrl).toBe("https://example.com/a");
    expect(json.claims[1].status).toBe("unchecked");
    expect(json.claims[1].sourceUrl).toBeNull();
    // The name appears in answer 0's text, so it counts as named even though the model said false.
    expect(json.answers.find((a: { index: number }) => a.index === 0).targetNamed).toBe(true);
    expect(json.answers.find((a: { index: number }) => a.index === 1).targetNamed).toBe(false);
  });

  it("drops comparisons when the owner typed no facts", async () => {
    const noFacts = { ...profile, facts: { hours: "", priceRange: "", outlets: "", seating: "", signatureItems: "", other: "" } };
    vi.mocked(gemini.generateJson).mockResolvedValue({
      model: "test-model",
      data: {
        answers: [],
        claims: [{ field: "hours", claim: "Open until 10 PM", status: "conflict", ownerValue: "11 PM", answerIndexes: [0], answersDisagree: false, note: "", sourceUrl: null }],
        notStated: [{ field: "hours", ownerValue: "11 PM" }],
        gaps: [],
        summary: "",
      },
    });
    const json = await (await analyzeRoute(req({ profile: noFacts, answers }, "10.0.0.9"))).json();
    expect(json.claims[0].status).toBe("unchecked");
    expect(json.claims[0].ownerValue).toBeNull();
    expect(json.notStated).toEqual([]);
  });
});
