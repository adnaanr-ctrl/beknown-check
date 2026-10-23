import { mentionsBusiness } from "./analysis";
import type { Analysis, BusinessType, GeneratedQuestion, Language, Profile } from "./types";

const TYPE_SINGULAR: Record<BusinessType, string> = {
  cafe: "café",
  "juice-bar": "juice bar",
  restaurant: "restaurant",
  bakery: "bakery",
  other: "place to eat or drink",
};
const TYPE_PLURAL: Record<BusinessType, string> = {
  cafe: "cafés",
  "juice-bar": "juice bars",
  restaurant: "restaurants",
  bakery: "bakeries",
  other: "places to eat or drink",
};
const LANGUAGE_LABEL: Record<Language, string> = {
  english: "plain English",
  "tamil-english": "Tamil written in English letters mixed with English (Tanglish), the way people in Chennai type, e.g. 'Kilpauk la nalla juice kadai edhu?'",
  hinglish: "Hindi written in English letters mixed with English (Hinglish), e.g. 'Koramangala mein chill karne ke liye best café'",
  "kannada-english": "Kannada written in English letters mixed with English, the way people in Bengaluru type, e.g. 'Koramangala alli friends jothe hang out madakke olle café yavudu?'",
};

export const typeLabel = (t: BusinessType) => TYPE_SINGULAR[t];

export const QUESTIONS_SYSTEM =
  "You write realistic questions that real customers type into an AI assistant when choosing where to eat or drink. " +
  "Return only JSON.";

export function questionsPrompt(p: Profile): string {
  return `Business type: ${TYPE_SINGULAR[p.type]}
Area: ${p.area}
Business name: ${p.name}
Language style for one question: ${LANGUAGE_LABEL[p.language]}

Write exactly 6 customer questions as JSON: {"questions":[{"text":"...","namesBusiness":false}, ...]}

Rules:
- Questions 1 to 5 must NOT contain the business name "${p.name}" or any part of it.
- Cover these five: (1) best ${TYPE_PLURAL[p.type]} in ${p.area}; (2) a need such as working, meeting friends or a quiet date; (3) open late at night or early in the morning; (4) a group, birthday or spacious seating; (5) one question written in the language style above.
- Question 6 names "${p.name}" and asks whether it is good and what its timings and prices are. Set namesBusiness true only for question 6.
- Keep each question under 25 words, natural, no quotation marks.`;
}

export function fallbackQuestions(p: Profile): GeneratedQuestion[] {
  const one = TYPE_SINGULAR[p.type];
  const many = TYPE_PLURAL[p.type];
  const local: Record<Language, string> = {
    english: `Quiet ${one} in ${p.area} for a first date?`,
    "tamil-english": `${p.area} la nalla ${one} edhu?`,
    hinglish: `${p.area} mein friends ke saath hangout karne ke liye achha ${one}?`,
    "kannada-english": `${p.area} alli friends jothe hang out madakke olle ${one} yavudu?`,
  };
  return [
    { text: `Best ${many} in ${p.area}?`, namesBusiness: false },
    { text: `Which ${one} in ${p.area} is good for working or meeting friends?`, namesBusiness: false },
    { text: `${one[0].toUpperCase()}${one.slice(1)} in ${p.area} open late at night`, namesBusiness: false },
    { text: `${one[0].toUpperCase()}${one.slice(1)} in ${p.area} with space for a birthday group of 10`, namesBusiness: false },
    { text: local[p.language], namesBusiness: false },
    { text: `Is ${p.name} in ${p.area} good? What are its timings and price range?`, namesBusiness: true },
  ];
}

/** Keep the model's questions only if they follow the rules; otherwise fill gaps from templates. */
export function finaliseQuestions(raw: { text: string }[], p: Profile): GeneratedQuestion[] {
  const fallback = fallbackQuestions(p);
  const unnamed: GeneratedQuestion[] = [];
  let named: GeneratedQuestion | undefined;
  for (const q of raw) {
    const isNamed = mentionsBusiness(q.text, p.name);
    if (isNamed && !named) named = { text: q.text, namesBusiness: true };
    else if (!isNamed && unnamed.length < 5) unnamed.push({ text: q.text, namesBusiness: false });
  }
  for (const f of fallback) {
    if (!f.namesBusiness && unnamed.length < 5) unnamed.push(f);
  }
  return [...unnamed.slice(0, 5), named ?? fallback[5]];
}

export const ANALYZE_SYSTEM =
  "You are a careful fact-checker. You only report what is written in the answers you are given and in the owner's facts. " +
  "You never invent facts, URLs or businesses. Return only JSON.";

export function analyzePrompt(p: Profile, answers: { index: number; question: string; text: string; sources: { title: string; uri: string }[] }[]): string {
  const facts = p.facts;
  const factLines = [
    ["hours", facts.hours],
    ["price", facts.priceRange],
    ["outlets", facts.outlets],
    ["seating", facts.seating],
    ["signature items", facts.signatureItems],
    ["other", facts.other],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const blocks = answers
    .map(
      (a) =>
        `### Answer ${a.index}\nQuestion: ${a.question}\nText: ${a.text}\nSources: ${
          a.sources.length ? a.sources.map((s) => `${s.title || "source"} <${s.uri}>`).join("; ") : "none listed"
        }`,
    )
    .join("\n\n");

  return `Target business: ${p.name} (${typeLabel(p.type)}) in ${p.area}.

Facts typed by the owner (the only facts you may treat as true):
${factLines || "(none provided)"}

Answers from an AI assistant:
${blocks}

Return JSON with exactly this shape:
{
  "answers": [{"index": 0, "businesses": ["names of places recommended, in the order given, max 10"], "targetNamed": false, "targetRank": null}],
  "claims": [{"field": "hours|price|outlets|location|menu|amenities|events|other", "claim": "what the answers say about the target", "status": "conflict|match|unchecked", "ownerValue": "the owner's fact or null", "answerIndexes": [0], "answersDisagree": false, "note": "one short sentence", "sourceUrl": "a URL copied exactly from the Sources lines, or null"}],
  "notStated": [{"field": "hours", "ownerValue": "owner fact that no answer mentions"}],
  "gaps": ["at most 3 short observations about useful information the answers lacked or got vague about"],
  "summary": "two plain sentences for a café owner"
}

Rules:
- Include one entry in "answers" for every answer index above. targetNamed is true only if that answer names ${p.name} as a place.
- "claims" contains only statements the answers make about ${p.name}. Merge the same claim across answers. Never add claims from your own knowledge.
- status: "conflict" if the owner gave a fact for this field and the claim differs; "match" if it agrees; "unchecked" if the owner gave no fact for this field. Never guess.
- Set answersDisagree true if different answers give different values for the same field.
- sourceUrl must be copied exactly from the Sources of an answer listed in answerIndexes, or be null.
- If ${p.name} appears in no answer, "claims" is an empty list.
- "notStated" lists owner facts that no answer mentions. Leave it empty if the owner gave no facts.`;
}

export const FIXES_SYSTEM =
  "You write short, plain-language text for a small food business's online listings. You use ONLY the facts you are given. " +
  "You never invent hours, prices, counts, awards or locations. Return only JSON.";

export function fixesPrompt(p: Profile, a: Analysis, strictNumbers: string[] = []): string {
  const f = p.facts;
  const facts = [
    ["name", p.name],
    ["area", p.area],
    ["type", typeLabel(p.type)],
    ["hours", f.hours],
    ["price range", f.priceRange],
    ["outlets", f.outlets],
    ["seating", f.seating],
    ["signature items", f.signatureItems],
    ["other", f.other],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const issues = [
    ...a.claims
      .filter((c) => c.status === "conflict")
      .map((c) => `CONFLICT (${c.field}): AI said "${c.claim}" but the owner says "${c.ownerValue ?? ""}".`),
    ...a.notStated.map((n) => `NOT MENTIONED (${n.field}): "${n.ownerValue}" appeared in none of the AI answers.`),
    ...a.claims
      .filter((c) => c.status === "unchecked")
      .map((c) => `UNCHECKED (${c.field}): AI said "${c.claim}" and the owner gave no fact to compare.`),
    ...a.gaps.map((g) => `GAP: ${g}`),
  ];

  return `Owner's facts (the only facts you may use):
${facts}

What the AI answers got wrong or left out:
${issues.length ? issues.map((i) => `- ${i}`).join("\n") : "- Nothing specific was found."}

Write fixes as JSON:
{
  "googleDescription": "Google Business Profile description, at most 700 characters",
  "marketplaceDescription": "Short description for Zomato and Swiggy, at most 350 characters",
  "hoursLine": "one line stating the opening hours exactly as the owner gave them, or null if no hours were given",
  "faqs": [{"question": "a question a customer would ask", "answer": "answer using only the facts"}],
  "needsFromOwner": ["facts you could not write because they were not provided"]
}

Rules:
- Exactly 3 FAQs, chosen to correct the conflicts and add the facts that were not mentioned.
- Every number, time and price must appear in the owner's facts above. Do not add any other number.${
    strictNumbers.length ? `\n- Your last attempt used numbers that are not in the facts: ${strictNumbers.join(", ")}. Remove them.` : ""
  }
- Do not use claims like "best", "#1", "famous" or "award-winning". Describe what the place offers.
- Never suggest asking customers to use particular words in their reviews.
- If a fact needed for a good fix is missing, add it to "needsFromOwner" instead of guessing.`;
}
