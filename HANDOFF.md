# BeKnown Check: handoff to the next account

Written because the previous account ran out of credits. Read this fully, then continue.

## 1. Situation and deadline (most important)

- The user (Adnaan, Mesa School of Business, ForgeX hackathon) must submit **Launch by 22 Oct 2026, 7:30 PM IST**: a **live Vercel link**, a **public LinkedIn post**, and **documentation** (the README plus the GitHub repo link). Submit on the ForgeX portal, Home page, step 4 "Launch", button "Add my links". Check the countdown timer in the portal header for the real time left.
- The Prototype step (due 22 Oct 1 PM) was **missed**. The user was told to message their Mesa contact (Shruti, or Pragati / the Forge team).
- The user is not a strong coder. Give exact copy-paste commands for Windows PowerShell, one step at a time, and ask for the exact error text.
- GitHub repo: https://github.com/adnaanr-ctrl/beknown-check
- Local folder: `C:\Users\south\beknown-check`. This OUTER folder is the git repo (it contains `.git`, `.env.local`, `.gitignore`, `README.md`) and also a nested folder `beknown-check\` holding only a README, which must be ignored.
- `.env.local` already exists and holds the Gemini key. `.gitignore` already contains `.env*` (twice, harmless). **Do not overwrite, print or ask for the key.** The app files are NOT in the repo yet.

## 2. What is in this package

The complete Next.js app (source, tests, package.json, lockfile, README). Copy the **contents** of this folder into the outer repo folder. `.env.local` and `.gitignore` are not included on purpose, so nothing is overwritten.

Windows steps (PowerShell):

```powershell
cd C:\Users\south\beknown-check
# copy the unzipped files in here so package.json sits next to .git, then:
Add-Content .gitignore "node_modules","/.next","*.tsbuildinfo","next-env.d.ts"
node -v          # must be 22.12 or newer; if not, install Node LTS from nodejs.org and reopen PowerShell
npm install
npm run typecheck
npm test
npm run dev
```

Then open http://localhost:3000/api/health?live=1. Expected: `{"ok":true,"configured":true,"model":"...","latencyMs":...}`. This checks the key and the model without printing the secret.

Check `.env.local` safely without showing it:

```powershell
$l = Get-Content .env.local | Where-Object { $_ -like 'GEMINI_API_KEY=*' }; if ($l) { "GEMINI_API_KEY line present, value length: " + ($l.Length - 15) } else { "GEMINI_API_KEY line missing" }
```

## 3. What was verified in the sandbox, and what was NOT

Verified (Linux sandbox, Node 22):
- `npm install` clean (0 vulnerabilities), `tsc --noEmit` clean, **21 unit and route tests pass** (Gemini mocked), `next build` succeeds.
- Production server: `/api/health` and `/api/health?live=1` return clean JSON errors with no key; `/api/ask` returns `missing_key` without a key; bad input returns `invalid_input`; the string `GEMINI_API_KEY` does not appear in the browser bundles.

NOT verified:
- **No live Gemini call has ever been made.** No real key was available in the sandbox. Model ids, the grounding call and the JSON output path are written from the SDK types and docs, untested against the real API.
- **The UI was not driven in a browser.** A Playwright script with mocked API responses (`scripts/ui_smoke_mocked.py`) was written, but its run failed because the server process had exited. Test the flow by hand (section 5).
- Not deployed to Vercel.

## 4. Product, in short

BeKnown Check: the owner enters business name, area, type, language style and optional real facts (hours, price, outlets, seating, signature items). The app: (1) Gemini writes 6 customer questions, (2) each is asked twice through the Gemini API with Google Search grounding, (3) Gemini extracts who is named and compares claims with the owner's facts, (4) Gemini drafts paste-ready listing text, with numbers not in the owner's facts flagged. Results show "named in X of Y answers" with a Wilson range, who was named instead, "AI said vs you said" cards with source links, copy-button fix tickets, the raw answers, and an honesty panel.

Architecture: the browser orchestrates short server routes (`/api/questions`, `/api/ask` x12 with 4 in flight, `/api/analyze`, `/api/fixes`), so no single request nears Vercel's 60 s limit. Gemini only. No n8n, no Claude, no database.

Honesty rules (keep them): never claim live ChatGPT, Google listing, Zomato or Swiggy data; "conflict" means differs from the owner's typed facts, not proof; no ranking or footfall promises; never advise asking customers for specific review wording (Google policy); nothing is stored.

## 5. Known risks and what to try first if something breaks

1. **Model ids.** Default order: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite` (Gemini 2.5 models were scheduled for shutdown on 16 Oct 2026). If `/api/health?live=1` says `model_unavailable`, set `GEMINI_MODEL` in `.env.local` to a model id the user's key lists in https://aistudio.google.com, and restart `npm run dev`.
2. **Quota or rate limits** (`quota`): the free tier may cap Search-grounded calls. Reduce `RUNS_PER_QUESTION` from 2 to 1 in `src/components/CheckApp.tsx`, or wait a minute.
3. **Grounding and JSON are separate calls on purpose.** `/api/ask` uses Search grounding with plain text; the JSON routes use `responseMimeType: application/json` with no tools.
4. **Thinking level.** For `gemini-3*` models the code sets `thinkingLevel: LOW` and retries without it if the API complains about "thinking".
5. **Windows Node version.** vitest 5 needs Node 22.12+. If the user cannot upgrade, `npm run dev` and `npm run build` should still work; only `npm test` is affected.
6. **Test by hand in the browser:** click "Try an example", then "Run the check", and watch progress, results and the copy buttons. Also test a made-up business (it must not invent claims), an empty form (shows a validation message), and a phone-width window (390 px).
7. Cosmetic: the validation message for a too-short question reads "Too small: expected string to have >=5 characters" (that route is only called by the app).

## 6. Remaining steps to ship

1. Install and run locally (section 2). Fix anything that breaks. Confirm `/api/health?live=1` is ok.
2. Run one full check locally with the Juice Pump example.
3. Commit and push:
   ```powershell
   git add .
   git status --short      # confirm .env.local is NOT listed
   git commit -m "Build BeKnown Check MVP"
   git push
   ```
4. Vercel: Add New, Project, import the repo, Environment Variables: add `GEMINI_API_KEY` (and `GEMINI_MODEL` only if needed), Deploy. Open `/api/health?live=1` on the live URL, then run a full check there and on a phone.
5. Make sure the GitHub repo is **public** and the README shows.
6. Post on LinkedIn (public) and copy the post URL. Draft below.
7. Submit Launch on the portal: Vercel link, LinkedIn post URL, documentation (GitHub README link).

If the full check is too slow or flaky on Vercel, lower `RUNS_PER_QUESTION` to 1 and say so in the README rather than shipping something broken.

## 7. LinkedIn post draft (fill the two links)

> When customers ask ChatGPT or Gemini "best juice bar near me", the AI gives a short list. Most café owners never see that list, and many have never checked what it says about them.
>
> I logged 294 AI answers about two food brands, in Bengaluru and Chennai. What I saw: a well-rated café chain missing from every "best cafés in its own area" answer, and AI answers that disagreed with each other about hours and prices for the same place.
>
> So I built BeKnown Check for the Mesa ForgeX hackathon. Enter your business and the facts you know are true. It asks an AI assistant the questions your customers ask (including in Tamil-English), shows whether you are named and who is named instead, compares what the AI says with your facts, and drafts text you can paste into your Google, Zomato and Swiggy listings.
>
> What it is not: it does not read Google Business Profile, Zomato or the ChatGPT app. It shows what the Gemini API says, and a small sample can change from run to run. I'm testing it with café owners next.
>
> Try it: [VERCEL LINK]
> Code: [GITHUB LINK]
>
> #ForgeX #MesaSchoolOfBusiness #AI #BuildInPublic

## 8. Background the next assistant may need

- Evidence (the user's own manual logs): 294 AI answers across two brands (Big Bean Cafe, Bengaluru, 264 answers; Juice Pump, Chennai, 30 answers) on ChatGPT, Gemini and Perplexity. Big Bean was named in 14 of 114 unprompted answers (12%) and 0 of 30 for "best cafés in Koramangala". Juice Pump was named in 6 of 24, with 0 of 15 for city-wide questions, and its hours, prices, outlet count and diet label conflicted across sources. Present these as "AI answers varied", not as proof of more.
- The user interviewed 5 Chennai owners (unrecorded): all use Google and Instagram, a marketing team updates their pages, none had checked what AI says. Willingness to pay is untested.
- The problem statement and MVP scope were already submitted. The MVP scope said Claude + n8n + Gemini; the shipped build is Gemini only because of the deadline. Say so plainly in docs and the pitch: "planned n8n and Claude, shipped Gemini-only to meet the deadline".
- Design tokens (in `globals.css`): espresso `#14110F`, surface `#1E1A17`, receipt paper `#F7F7F4`, lime `#C8F53D` used sparingly, stamp red `#D2412C`.
- Pitch: 23 Oct from 2 PM (7 minutes plus 7 minutes of questions). Loom (5+ minutes) and pitch deck are due 23 Oct 1 PM.

## 9. Security

- A Gemini key was pasted into a chat earlier and should be considered exposed. The user was told to delete it and create a new one at https://aistudio.google.com/apikey. Confirm that the key in `.env.local` and in Vercel is the new one.
- Never ask the user to paste a key into chat. Never print `.env.local`. Never commit it.
- A public deployment spends the user's Gemini quota. The app has a best-effort in-memory rate limit only.

## 10. Prompt to paste into the next assistant (Claude Code or Claude Desktop)

```
Read HANDOFF.md and README.md in this folder first. The project is BeKnown Check, a Next.js app that needs to be live on Vercel with a public LinkedIn post and README by 22 Oct 7:30 PM IST. The code is written but has never been run against the real Gemini API or driven in a browser. Work in C:\Users\south\beknown-check (the outer folder with .git). Do not overwrite or print .env.local or .gitignore, and never ask me to paste an API key. Steps: inspect the folder and git status; make sure the app files are in place; add the missing .gitignore lines; run npm install, npm run typecheck, npm test; start npm run dev; help me verify http://localhost:3000/api/health?live=1; fix any model-id, quota or JSON problems; test a full check in the browser; commit and push; then help me deploy to Vercel with GEMINI_API_KEY set as an environment variable and test the live link on my phone. Give me exact PowerShell commands one step at a time and ask for exact error text when something fails. Be honest about anything untested.
```
