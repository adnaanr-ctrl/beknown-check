import { NextResponse } from "next/server";
import { numbersNotInFacts } from "@/lib/analysis";
import { generateJson } from "@/lib/gemini";
import { geminiErrorResponse, readBody } from "@/lib/http";
import { FIXES_SYSTEM, fixesPrompt } from "@/lib/prompts";
import { fixesOutputSchema, fixesRequestSchema } from "@/lib/schemas";
import type { Fixes } from "@/lib/types";

export const maxDuration = 60;

type FixesOutput = ReturnType<typeof fixesOutputSchema.parse>;

function allText(f: FixesOutput): string {
  return [f.googleDescription, f.marketplaceDescription, f.hoursLine ?? "", ...f.faqs.flatMap((q) => [q.question, q.answer])].join("\n");
}

export async function POST(req: Request) {
  const body = await readBody(req, fixesRequestSchema);
  if (!body.ok) return body.res;
  const { profile, analysis } = body.data;

  try {
    let { data } = await generateJson(FIXES_SYSTEM, fixesPrompt(profile, analysis), fixesOutputSchema);
    let bad = numbersNotInFacts(allText(data), profile);
    if (bad.length) {
      // One stricter retry; anything still unverified is shown to the owner as a warning.
      ({ data } = await generateJson(FIXES_SYSTEM, fixesPrompt(profile, analysis, bad), fixesOutputSchema));
      bad = numbersNotInFacts(allText(data), profile);
    }
    const fixes: Fixes = {
      googleDescription: data.googleDescription.trim(),
      marketplaceDescription: data.marketplaceDescription.trim(),
      hoursLine: data.hoursLine && data.hoursLine.trim() ? data.hoursLine.trim() : null,
      faqs: data.faqs.slice(0, 3),
      needsFromOwner: data.needsFromOwner,
      unverifiedNumbers: bad,
    };
    return NextResponse.json(fixes);
  } catch (e) {
    return geminiErrorResponse(e);
  }
}
