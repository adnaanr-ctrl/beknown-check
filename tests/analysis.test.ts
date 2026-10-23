import { describe, expect, it } from "vitest";
import {
  countRivals,
  extractNumbers,
  mentionRate,
  mentionsBusiness,
  nameVariants,
  normalize,
  numbersNotInFacts,
  parseJsonLoose,
  wilsonInterval,
} from "@/lib/analysis";
import { fallbackQuestions, finaliseQuestions } from "@/lib/prompts";
import type { Profile } from "@/lib/types";

const profile: Profile = {
  name: "Big Bean Cafe",
  area: "Koramangala, Bengaluru",
  type: "cafe",
  language: "english",
  facts: { hours: "7 AM to 12 midnight", priceRange: "about 600 rupees for two", outlets: "7 outlets", seating: "80 seats", signatureItems: "", other: "" },
};

describe("name matching", () => {
  it("normalises accents and punctuation", () => {
    expect(normalize("Café  du L'Amour!")).toBe("cafe du l amour");
  });
  it("matches the full name and the name without a generic ending", () => {
    expect(nameVariants("Big Bean Cafe")).toContain("big bean");
    expect(mentionsBusiness("Try Big Bean in Koramangala for coffee.", "Big Bean Cafe")).toBe(true);
    expect(mentionsBusiness("Big Bean Café is open late", "Big Bean Cafe")).toBe(true);
  });
  it("does not match inside other words", () => {
    expect(mentionsBusiness("The Biggest Beanery in town", "Big Bean Cafe")).toBe(false);
    expect(mentionsBusiness("Third Wave Coffee is popular", "Big Bean Cafe")).toBe(false);
  });
});

describe("mention rate", () => {
  it("computes a Wilson interval inside 0..1", () => {
    const r = wilsonInterval(3, 10);
    expect(r.low).toBeGreaterThan(0.1);
    expect(r.high).toBeLessThan(0.7);
    expect(wilsonInterval(0, 10).low).toBe(0);
    expect(wilsonInterval(10, 10).high).toBe(1);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });
  it("reports named, total and rate", () => {
    const r = mentionRate(2, 8);
    expect(r.rate).toBeCloseTo(0.25);
    expect(r.named).toBe(2);
  });
});

describe("rivals", () => {
  it("counts each rival once per answer and skips the target", () => {
    const rivals = countRivals(
      [
        { index: 0, businesses: ["Dyu Art Cafe", "Third Wave Coffee", "Big Bean"], targetNamed: true, targetRank: 3 },
        { index: 1, businesses: ["dyu art cafe", "Dyu Art Cafe", "Blue Tokai"], targetNamed: false, targetRank: null },
      ],
      "Big Bean Cafe",
    );
    expect(rivals[0]).toEqual({ name: "Dyu Art Cafe", count: 2 });
    expect(rivals.find((r) => r.name === "Big Bean")).toBeUndefined();
  });
});

describe("number checking for fixes", () => {
  it("extracts numbers", () => {
    expect(extractNumbers("Open 10:30 AM, 1,200 rupees, 4.5 stars")).toEqual(["10:30", "1200", "4.5"]);
  });
  it("accepts numbers that appear in the owner's facts", () => {
    expect(numbersNotInFacts("Open from 7 AM. About 600 rupees for two. 80 seats.", profile)).toEqual([]);
  });
  it("flags invented numbers", () => {
    expect(numbersNotInFacts("Open from 7 AM with 120 seats and 15 outlets.", profile).sort()).toEqual(["120", "15"]);
  });
});

describe("loose JSON parsing", () => {
  it("handles code fences and stray text", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Here you go: {"a":2} thanks')).toEqual({ a: 2 });
    expect(() => parseJsonLoose("no json here")).toThrow();
  });
});

describe("question rules", () => {
  it("always ends with exactly one question that names the business", () => {
    const qs = finaliseQuestions(
      [
        { text: "Best cafes in Koramangala?" },
        { text: "Is Big Bean good for working?" },
        { text: "Quiet cafe to work in Koramangala" },
      ],
      profile,
    );
    expect(qs).toHaveLength(6);
    expect(qs.filter((q) => q.namesBusiness)).toHaveLength(1);
    expect(qs[5].namesBusiness).toBe(true);
    expect(qs.slice(0, 5).every((q) => !mentionsBusiness(q.text, profile.name))).toBe(true);
  });
  it("has a template fallback for every language", () => {
    for (const language of ["english", "tamil-english", "hinglish", "kannada-english"] as const) {
      const qs = fallbackQuestions({ ...profile, language });
      expect(qs).toHaveLength(6);
      expect(qs[5].text).toContain(profile.name);
    }
  });
});
