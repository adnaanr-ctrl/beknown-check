import { NextResponse } from "next/server";
import { hasAnyFacts, mentionsBusiness } from "@/lib/analysis";
import { generateJson } from "@/lib/gemini";
import { geminiErrorResponse, readBody } from "@/lib/http";
import { ANALYZE_SYSTEM, analyzePrompt } from "@/lib/prompts";
import { analysisOutputSchema, analyzeRequestSchema } from "@/lib/schemas";
import type { Analysis, Claim } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readBody(req, analyzeRequestSchema);
  if (!body.ok) return body.res;
  const { profile, answers } = body.data;

  try {
    const { data } = await generateJson(ANALYZE_SYSTEM, analyzePrompt(profile, answers), analysisOutputSchema);
    const hasFacts = hasAnyFacts(profile);
    const sourceUrlsByIndex = new Map<number, Set<string>>(answers.map((a) => [a.index, new Set(a.sources.map((s) => s.uri))]));
    const modelAnswers = new Map(data.answers.map((a) => [a.index, a]));

    // Every answer gets an entry; a name match in the text counts even if the model missed it.
    const cleanAnswers = answers.map((a) => {
      const m = modelAnswers.get(a.index);
      const quick = mentionsBusiness(a.text, profile.name);
      const targetNamed = Boolean(m?.targetNamed) || quick;
      return {
        index: a.index,
        businesses: (m?.businesses ?? []).slice(0, 10),
        targetNamed,
        targetRank: targetNamed ? (m?.targetRank ?? null) : null,
      };
    });

    const claims: Claim[] = data.claims.map((c) => {
      const allowed = new Set<string>();
      for (const i of c.answerIndexes) for (const u of sourceUrlsByIndex.get(i) ?? []) allowed.add(u);
      const ownerValue = hasFacts && c.ownerValue && c.ownerValue.trim() ? c.ownerValue.trim() : null;
      return {
        ...c,
        ownerValue,
        // Without an owner fact there is nothing to compare, so a claim can only be "unchecked".
        status: ownerValue ? c.status : "unchecked",
        sourceUrl: c.sourceUrl && allowed.has(c.sourceUrl) ? c.sourceUrl : null,
      };
    });

    const analysis: Analysis = {
      answers: cleanAnswers,
      claims,
      notStated: hasFacts ? data.notStated.filter((n) => n.ownerValue.trim()) : [],
      gaps: data.gaps.slice(0, 3),
      summary: data.summary,
    };
    return NextResponse.json(analysis);
  } catch (e) {
    return geminiErrorResponse(e);
  }
}
