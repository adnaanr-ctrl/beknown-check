import type { AnalysisAnswer, Facts, Profile } from "./types";

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u0b80-\u0bff\u0c80-\u0cff\u0900-\u097f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_SUFFIXES = ["cafe", "coffee", "restaurant", "bakery", "bar", "kitchen", "house", "shop"];

/** Names we accept as "the business was named": the full name, and the name without a generic ending. */
export function nameVariants(name: string): string[] {
  const full = normalize(name);
  const variants = new Set<string>();
  if (full.length >= 3) variants.add(full);
  const words = full.split(" ");
  while (words.length > 1 && GENERIC_SUFFIXES.includes(words[words.length - 1])) {
    words.pop();
    const shorter = words.join(" ");
    if (shorter.length >= 4) variants.add(shorter);
  }
  return [...variants];
}

export function mentionsBusiness(text: string, name: string): boolean {
  const haystack = ` ${normalize(text)} `;
  return nameVariants(name).some((v) => haystack.includes(` ${v} `));
}

/** Wilson score interval for a proportion, as fractions between 0 and 1. */
export function wilsonInterval(k: number, n: number, z = 1.96): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 0 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

export interface MentionRate {
  named: number;
  total: number;
  rate: number;
  low: number;
  high: number;
}

export function mentionRate(named: number, total: number): MentionRate {
  const { low, high } = wilsonInterval(named, total);
  return { named, total, rate: total === 0 ? 0 : named / total, low, high };
}

export interface Rival {
  name: string;
  count: number;
}

export function countRivals(answers: AnalysisAnswer[], targetName: string, limit = 8): Rival[] {
  const target = nameVariants(targetName);
  const counts = new Map<string, Rival>();
  for (const a of answers) {
    const seen = new Set<string>();
    for (const raw of a.businesses) {
      const key = normalize(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (target.some((v) => key === v || key.includes(v) || v.includes(key))) continue;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { name: raw.trim(), count: 1 });
    }
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)).slice(0, limit);
}

/** Numbers like 8, 10:30, 4.5 or 1,200, as plain strings. */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(?:[.,:]\d+)*/g) ?? [];
  return matches.map((m) => m.replace(/,/g, ""));
}

export function factsText(profile: Profile): string {
  const f: Facts = profile.facts;
  return [profile.name, profile.area, f.hours, f.priceRange, f.outlets, f.seating, f.signatureItems, f.other].join(" \n ");
}

/** Numbers present in generated text but absent from everything the owner typed. */
export function numbersNotInFacts(generated: string, profile: Profile): string[] {
  const allowed = new Set(extractNumbers(factsText(profile)));
  const bad = new Set<string>();
  for (const n of extractNumbers(generated)) {
    if (allowed.has(n)) continue;
    // "10:30" is fine if both parts are in the facts as "10" and "30" or as a whole.
    const parts = n.split(/[:.]/).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => allowed.has(p))) continue;
    bad.add(n);
  }
  return [...bad];
}

/** Parse JSON that may be wrapped in code fences or have stray text around it. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    const first = unfenced.indexOf("{");
    const last = unfenced.lastIndexOf("}");
    if (first !== -1 && last > first) return JSON.parse(unfenced.slice(first, last + 1));
    throw new Error("The model did not return JSON.");
  }
}

export function hasAnyFacts(profile: Profile): boolean {
  return Object.values(profile.facts).some((v) => v.trim().length > 0);
}
