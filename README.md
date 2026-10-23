# BeKnown Check

A café, juice-bar or restaurant owner enters their business and the facts they know to be true. The app asks an AI assistant the questions customers would ask, shows whether the business gets named, compares what the AI says with the owner's facts, and drafts text the owner can paste into their listings.

Student project for Mesa School of Business, ForgeX hackathon (October 2026).

## What it does

1. **Questions.** Gemini writes 6 customer questions for the business (5 that do not name it, 1 that does), including one in Tamil-English, Hinglish or Kannada-English if chosen. If the model's output is unusable, fixed templates are used.
2. **Answers.** Each question is asked once (6 calls; the free Gemini tier allows only about 5 requests per minute per model, so a second run per question was dropped) through the Gemini API **without** Google Search grounding (no sources are shown).
3. **Analysis.** Gemini reads all answers and returns structured JSON: who was named and in what order, claims made about the business, and each claim compared with the owner's facts (conflict, match, or unchecked). Source links are kept only if they were listed with that answer. A claim cannot be marked a conflict or match without an owner fact.
4. **Fixes.** Gemini drafts a Google Business Profile description, a Zomato and Swiggy description, an hours line and 3 FAQs using only the owner's facts. Numbers not found in the owner's facts are flagged to the user.

## What is real and what is not

- Real: calls to the Gemini API, run on the server. Google Search grounding was built first but removed, because it needs a paid Gemini tier and the free-tier key returns a quota error. Answers therefore come from the model's own knowledge, not live web results, and can be outdated or wrong. "AI said vs you said" compares that output with your typed facts and is not proof of what is on Google or Zomato. Grounding can be restored with a paid key by adding `tools: [{ googleSearch: {} }]` in `askGrounded` (`src/lib/gemini.ts`).
- Not done: the app does not read Google Business Profile, Zomato, Swiggy or the ChatGPT app. API answers can differ from what people see in the consumer apps.
- "Conflict" means the AI's claim differs from the facts the owner typed. It does not prove which one is right.
- Two runs per question is a small sample, so the mention rate is shown with a range.
- Nothing is stored. No database, no accounts.
- Planned but not built: n8n orchestration, Claude for the analysis steps, re-checks, ChatGPT and Perplexity answers.

## Stack

Next.js 16 (App Router, TypeScript), React 19, `@google/genai`, zod, vitest. Deployed on Vercel. No database.

## Setup (Windows, PowerShell)

Requires Node.js 22.12 or newer (https://nodejs.org, LTS).

```powershell
cd C:\Users\south\beknown-check
npm install
npm run dev
```

Open http://localhost:3000.

`.env.local` must contain one line: `GEMINI_API_KEY=your_key` (create a key at https://aistudio.google.com/apikey). Never commit this file or paste the key into chat. `.env.example` shows the format.

Optional: `GEMINI_MODEL=<model id>` forces one model. If unset, the app tries `gemini-3.8-flash`, then `gemini-3.6-flash`, then `gemini-3.5-flash-lite`, and remembers the first one that works.

## Checks

```powershell
npm run typecheck
npm test          # 21 unit tests (Gemini is mocked, no key needed)
npm run build
```

## Test the Gemini connection without exposing the key

- http://localhost:3000/api/health shows whether a key is configured (true or false only).
- http://localhost:3000/api/health?live=1 makes one tiny Gemini call and returns `{ ok: true, model, latencyMs }`, or a plain error code: `missing_key`, `invalid_key`, `quota`, `model_unavailable`.

## Deploy to Vercel

1. Push the repo to GitHub (the `.env*` rule in `.gitignore` keeps the key out).
2. In Vercel: Add New, Project, import the repo.
3. Settings, Environment Variables: add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
4. Deploy, then open `/api/health?live=1` on the live URL.

## Project layout

```
src/app/page.tsx              page shell
src/components/CheckApp.tsx   form, progress, results (client)
src/app/api/questions | ask | analyze | fixes | health   route.ts files
src/lib/gemini.ts             Gemini client, model fallback, error mapping (server only)
src/lib/prompts.ts            prompts and question rules
src/lib/analysis.ts           name matching, mention rate, rivals, number checks
src/lib/schemas.ts            zod input and output schemas
tests/                        unit and route tests (Gemini mocked)
```

## Known limits

- A public deployment spends your Gemini quota. A simple in-memory rate limit slows abuse but is not a hard guarantee.
- Each API route allows 60 seconds. One check uses about 15 calls, run 4 at a time.
- Free-tier rate limits can interrupt a check. The app shows a plain message and lets the user retry the failed step.
