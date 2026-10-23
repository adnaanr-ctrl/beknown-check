"use client";

import { useMemo, useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { countRivals, mentionRate, mentionsBusiness } from "@/lib/analysis";
import { ApiCallError, postJson, runPool } from "@/lib/client";
import type { Analysis, AnswerRecord, BusinessType, Claim, Fixes, GeneratedQuestion, Language, Profile } from "@/lib/types";

const RUNS_PER_QUESTION = 1;
const MAX_IN_FLIGHT = 4;

const EMPTY_FACTS = { hours: "", priceRange: "", outlets: "", seating: "", signatureItems: "", other: "" };

const EXAMPLE: Profile = {
  name: "Juice Pump",
  area: "Kilpauk, Chennai",
  type: "juice-bar",
  language: "tamil-english",
  facts: {
    hours: "11 AM to 11 PM, every day",
    priceRange: "About 300 rupees for two",
    outlets: "Kilpauk (Ormes Road)",
    seating: "Indoor seating",
    signatureItems: "Fresh fruit juices, milkshakes, falooda",
    other: "",
  },
};

type Phase = "idle" | "questions" | "asking" | "analyzing" | "fixing" | "done" | "failed";

const STATUS_LABEL: Record<Claim["status"], string> = {
  conflict: "Conflicts with your facts",
  match: "Matches your facts",
  unchecked: "No fact from you to compare",
};

function stageMessage(phase: Phase, answers: AnswerRecord[]): string {
  const done = answers.filter((a) => a.status !== "pending").length;
  switch (phase) {
    case "questions":
      return "Writing the questions your customers would ask…";
    case "asking":
      return `Asking the AI. ${done} of ${answers.length} answers back.`;
    case "analyzing":
      return "Reading every answer and comparing with your facts…";
    case "fixing":
      return "Drafting paste-ready fixes from your facts…";
    default:
      return "";
  }
}

export default function CheckApp() {
  const [profile, setProfile] = useState<Profile>({ name: "", area: "", type: "cafe", language: "english", facts: { ...EMPTY_FACTS } });
  const [formError, setFormError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [questionSource, setQuestionSource] = useState<string>("");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fixes, setFixes] = useState<Fixes | null>(null);
  const [error, setError] = useState<{ stage: string; message: string } | null>(null);
  const [runProfile, setRunProfile] = useState<Profile | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const runId = useRef(0);

  const busy = phase === "questions" || phase === "asking" || phase === "analyzing" || phase === "fixing";

  function setField<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }
  function setFact(key: keyof Profile["facts"], value: string) {
    setProfile((p) => ({ ...p, facts: { ...p.facts, [key]: value } }));
  }

  function reset() {
    runId.current += 1; // abandon any run still in flight
    setPhase("idle");
    setQuestions([]);
    setAnswers([]);
    setAnalysis(null);
    setFixes(null);
    setError(null);
    setRunProfile(null);
  }

  async function analyse(p: Profile, records: AnswerRecord[], id: number) {
    setPhase("analyzing");
    const ok = records.map((r, i) => ({ r, i })).filter(({ r }) => r.status === "ok");
    const result = await postJson<Analysis>("/api/analyze", {
      profile: p,
      answers: ok.map(({ r, i }) => ({ index: i, question: r.question, text: r.text, sources: r.sources })),
    });
    if (id !== runId.current) return null;
    setAnalysis(result);
    return result;
  }

  async function draftFixes(p: Profile, a: Analysis, id: number) {
    setPhase("fixing");
    const result = await postJson<Fixes>("/api/fixes", { profile: p, analysis: a });
    if (id !== runId.current) return;
    setFixes(result);
  }

  async function runCheck() {
    const name = profile.name.trim();
    const area = profile.area.trim();
    if (name.length < 2 || area.length < 2) {
      setFormError("Enter the business name and the area or city.");
      return;
    }
    setFormError("");
    reset();
    const id = runId.current;
    const p: Profile = { ...profile, name, area };
    setRunProfile(p);
    setPhase("questions");
    setTimeout(() => headingRef.current?.focus(), 50);

    let qs: GeneratedQuestion[];
    try {
      const res = await postJson<{ questions: GeneratedQuestion[]; source: string }>("/api/questions", { profile: p });
      if (id !== runId.current) return;
      qs = res.questions;
      setQuestions(qs);
      setQuestionSource(res.source);
    } catch (e) {
      if (id !== runId.current) return;
      setError({ stage: "questions", message: e instanceof Error ? e.message : "Could not write the questions." });
      setPhase("failed");
      return;
    }

    const tasks = qs.flatMap((q, qi) => Array.from({ length: RUNS_PER_QUESTION }, (_, run) => ({ q, qi, run })));
    const initial: AnswerRecord[] = tasks.map((t, i) => ({
      id: `a${i}`,
      questionIndex: t.qi,
      run: t.run + 1,
      question: t.q.text,
      namesBusiness: t.q.namesBusiness,
      status: "pending",
      text: "",
      sources: [],
      namedQuick: false,
    }));
    setAnswers(initial);
    setPhase("asking");

    const finished = await runPool(initial, MAX_IN_FLIGHT, async (rec) => {
      const attempt = async () => postJson<{ text: string; sources: { title: string; uri: string }[]; model: string }>("/api/ask", { question: rec.question });
      let updated: AnswerRecord;
      try {
        // Up to 3 tries. Waits grow (and vary a little) so rate-limited calls do not all retry at once.
        const waits = [3000, 8000];
        let res: Awaited<ReturnType<typeof attempt>> | undefined;
        for (let n = 0; ; n++) {
          try {
            res = await attempt();
            break;
          } catch (err) {
            const fatal = err instanceof ApiCallError && ["invalid_key", "missing_key", "rate_limited"].includes(err.code);
            if (fatal || n >= waits.length || id !== runId.current) throw err;
            await new Promise((r) => setTimeout(r, waits[n] + Math.random() * 1000));
          }
        }
        updated = { ...rec, status: "ok", text: res.text, sources: res.sources, model: res.model, namedQuick: mentionsBusiness(res.text, p.name) };
      } catch (e) {
        updated = { ...rec, status: "error", error: e instanceof Error ? e.message : "Failed" };
      }
      if (id === runId.current) setAnswers((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      return updated;
    }, () => id !== runId.current);
    if (id !== runId.current) return;

    const okCount = finished.filter((r) => r.status === "ok").length;
    if (okCount === 0) {
      const firstErr = finished.find((r) => r.error)?.error;
      setError({ stage: "asking", message: firstErr ?? "No answers came back from Gemini." });
      setPhase("failed");
      return;
    }

    let a: Analysis | null = null;
    try {
      a = await analyse(p, finished, id);
    } catch (e) {
      if (id !== runId.current) return;
      setError({ stage: "analyzing", message: e instanceof Error ? e.message : "The analysis failed." });
      setPhase("failed");
      return;
    }
    if (!a) return;

    try {
      await draftFixes(p, a, id);
      if (id === runId.current) setPhase("done");
    } catch (e) {
      if (id !== runId.current) return;
      setError({ stage: "fixing", message: e instanceof Error ? e.message : "Drafting fixes failed." });
      setPhase("failed");
    }
  }

  async function retryFromError() {
    if (!error || !runProfile) return;
    const id = runId.current;
    const stage = error.stage;
    setError(null);
    try {
      if (stage === "analyzing") {
        const a = await analyse(runProfile, answers, id);
        if (a) {
          await draftFixes(runProfile, a, id);
          if (id === runId.current) setPhase("done");
        }
      } else if (stage === "fixing" && analysis) {
        await draftFixes(runProfile, analysis, id);
        if (id === runId.current) setPhase("done");
      } else {
        await runCheck();
      }
    } catch (e) {
      if (id !== runId.current) return;
      setError({ stage, message: e instanceof Error ? e.message : "That did not work." });
      setPhase("failed");
    }
  }

  // ----- derived numbers -----
  const unnamedAnswers = answers.filter((a) => !a.namesBusiness);
  const okUnnamed = unnamedAnswers.filter((a) => a.status === "ok");
  const liveNamed = okUnnamed.filter((a) => a.namedQuick).length;

  const final = useMemo(() => {
    if (!analysis) return null;
    const byIndex = new Map(analysis.answers.map((a) => [a.index, a]));
    let named = 0;
    let total = 0;
    answers.forEach((rec, i) => {
      if (rec.namesBusiness || rec.status !== "ok") return;
      total += 1;
      if (byIndex.get(i)?.targetNamed) named += 1;
    });
    return { rate: mentionRate(named, total), rivals: countRivals(analysis.answers, runProfile?.name ?? "") };
  }, [analysis, answers, runProfile]);

  const showResults = (phase === "done" || phase === "fixing" || phase === "failed") && analysis;
  const showProgress = busy || (phase === "failed" && !analysis);

  return (
    <div className="wrap">
      {/* ---------- Intro and form ---------- */}
      <section className="intro">
        <h1>What does AI tell your customers about your café?</h1>
        <p className="lead">
          Enter your business. We ask an AI assistant the questions your customers would ask, show whether it names you, check what it says
          against your own facts, and draft fixes you can paste into your listings.
        </p>
      </section>

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void runCheck();
        }}
        noValidate
      >
        <div className="grid2">
          <div className="field">
            <label htmlFor="name">Business name</label>
            <input id="name" value={profile.name} onChange={(e) => setField("name", e.target.value)} maxLength={80} autoComplete="organization" placeholder="e.g. Juice Pump" />
          </div>
          <div className="field">
            <label htmlFor="area">Area and city</label>
            <input id="area" value={profile.area} onChange={(e) => setField("area", e.target.value)} maxLength={80} placeholder="e.g. Kilpauk, Chennai" />
          </div>
          <div className="field">
            <label htmlFor="type">Type of business</label>
            <select id="type" value={profile.type} onChange={(e) => setField("type", e.target.value as BusinessType)}>
              <option value="cafe">Café</option>
              <option value="juice-bar">Juice bar</option>
              <option value="restaurant">Restaurant</option>
              <option value="bakery">Bakery</option>
              <option value="other">Other food or drink place</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="language">One question in this language style</label>
            <select id="language" value={profile.language} onChange={(e) => setField("language", e.target.value as Language)}>
              <option value="english">English</option>
              <option value="tamil-english">Tamil-English</option>
              <option value="hinglish">Hinglish</option>
              <option value="kannada-english">Kannada-English</option>
            </select>
          </div>
        </div>

        <fieldset className="facts">
          <legend>Your real facts (optional, but needed to spot conflicts)</legend>
          <p className="hint">Type what is true. The app compares the AI's answers with these and never treats anything else as verified.</p>
          <div className="grid2">
            <div className="field">
              <label htmlFor="hours">Opening hours</label>
              <input id="hours" value={profile.facts.hours} onChange={(e) => setFact("hours", e.target.value)} maxLength={300} placeholder="e.g. 8 AM to 10 PM, every day" />
            </div>
            <div className="field">
              <label htmlFor="price">Price range</label>
              <input id="price" value={profile.facts.priceRange} onChange={(e) => setFact("priceRange", e.target.value)} maxLength={200} placeholder="e.g. about 300 rupees for two" />
            </div>
            <div className="field">
              <label htmlFor="outlets">Outlets</label>
              <input id="outlets" value={profile.facts.outlets} onChange={(e) => setFact("outlets", e.target.value)} maxLength={400} placeholder="e.g. Kilpauk and Egmore" />
            </div>
            <div className="field">
              <label htmlFor="seating">Seating and space</label>
              <input id="seating" value={profile.facts.seating} onChange={(e) => setFact("seating", e.target.value)} maxLength={200} placeholder="e.g. 40 seats, two floors" />
            </div>
            <div className="field span2">
              <label htmlFor="items">Signature items</label>
              <input id="items" value={profile.facts.signatureItems} onChange={(e) => setFact("signatureItems", e.target.value)} maxLength={400} placeholder="e.g. cold brew, mango falooda" />
            </div>
            <div className="field span2">
              <label htmlFor="other">Anything else that is true (events, Wi-Fi, diet)</label>
              <input id="other" value={profile.facts.other} onChange={(e) => setFact("other", e.target.value)} maxLength={600} placeholder="e.g. fully vegetarian, comedy night on Fridays" />
            </div>
          </div>
        </fieldset>

        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Running…" : "Run the check"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setProfile(EXAMPLE);
              setFormError("");
            }}
          >
            Try an example
          </button>
          {phase !== "idle" && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Start over
            </button>
          )}
        </div>
        <p className="hint">
          The example uses Juice Pump with <strong>sample facts for the demo</strong>, not Juice Pump's verified details. About {RUNS_PER_QUESTION * 6} AI calls per check.
        </p>
      </form>

      {/* ---------- Progress ---------- */}
      {phase !== "idle" && (
        <section className="card stage" aria-labelledby="stage-title">
          <h2 id="stage-title" ref={headingRef} tabIndex={-1}>
            {runProfile ? `Checking ${runProfile.name}` : "Checking"}
          </h2>
          <p className="progress" aria-live="polite">
            {showProgress && busy ? stageMessage(phase, answers) : phase === "done" ? "Done." : ""}
          </p>

          {questionSource === "template" && (
            <p className="hint">The AI's question list could not be read, so standard questions were used.</p>
          )}

          {questions.length > 0 && (
            <ol className="qlist">
              {questions.map((q, qi) => {
                const recs = answers.filter((a) => a.questionIndex === qi);
                return (
                  <li key={qi} className="qitem">
                    <div className="bubble">{q.text}</div>
                    <div className="dots" aria-label={`${recs.filter((r) => r.status !== "pending").length} of ${recs.length} answers received`}>
                      {recs.map((r) => (
                        <span key={r.id} className={`dot dot-${r.status}`} title={r.status === "error" ? r.error : r.status} />
                      ))}
                      {q.namesBusiness && <span className="tiny">names you, not counted in the rate</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {okUnnamed.length > 0 && (
            <p className="counter">
              Named in <strong>{liveNamed}</strong> of <strong>{okUnnamed.length}</strong> answers so far
              <span className="tiny"> (quick text match on questions that do not name you)</span>
            </p>
          )}

          {error && (
            <div className="alert" role="alert">
              <p>
                <strong>Something stopped the check.</strong> {error.message}
              </p>
              <button type="button" className="btn" onClick={() => void retryFromError()}>
                Try this step again
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- Results ---------- */}
      {showResults && runProfile && analysis && final && (
        <Results profile={runProfile} analysis={analysis} final={final} answers={answers} fixes={fixes} fixing={phase === "fixing"} />
      )}
    </div>
  );
}

function Results({
  profile,
  analysis,
  final,
  answers,
  fixes,
  fixing,
}: {
  profile: Profile;
  analysis: Analysis;
  final: { rate: ReturnType<typeof mentionRate>; rivals: ReturnType<typeof countRivals> };
  answers: AnswerRecord[];
  fixes: Fixes | null;
  fixing: boolean;
}) {
  const { rate, rivals } = final;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const conflicts = analysis.claims.filter((c) => c.status === "conflict");
  const others = analysis.claims.filter((c) => c.status !== "conflict");
  const failed = answers.filter((a) => a.status === "error").length;

  return (
    <>
      <section className="card result-hero" aria-labelledby="r-title">
        <h2 id="r-title">Does the AI name {profile.name}?</h2>
        <p className="big">
          {rate.named} of {rate.total} answers
        </p>
        <p>
          to questions that do not name you included {profile.name}
          {rate.total > 0 ? ` (${pct(rate.rate)}; a plausible range is ${pct(rate.low)} to ${pct(rate.high)})` : ""}.
        </p>
        {failed > 0 && <p className="hint">{failed} answer(s) failed and are not counted.</p>}
        {analysis.summary && (
          <p className="summary">
            <span className="chip">AI-written summary</span> {analysis.summary}
          </p>
        )}
        <p className="hint">Small sample: {rate.total} answers. Run the check again and the numbers can change, because AI answers vary from run to run.</p>
      </section>

      {rivals.length > 0 && (
        <section className="card" aria-labelledby="rivals-title">
          <h2 id="rivals-title">Who the AI named instead</h2>
          <ul className="rivals">
            {rivals.map((r) => (
              <li key={r.name}>
                <span>{r.name}</span>
                <span className="count">{r.count} {r.count === 1 ? "answer" : "answers"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="claims-title">
        <h2 id="claims-title">What the AI said about you vs what you said</h2>
        {analysis.claims.length === 0 ? (
          <p>The answers made no checkable claims about {profile.name}. Either it was not named, or the AI said nothing specific about it.</p>
        ) : (
          <>
            <p className="hint">
              These are statements found in the AI's answers. "Conflicts" means the AI's claim differs from the facts you typed. It does not prove which one is right, so check the source before changing anything.
            </p>
            <ul className="claims">
              {[...conflicts, ...others].map((c, i) => (
                <li key={i} className={`claim claim-${c.status}`}>
                  <div className="claim-head">
                    <span className="chip">{c.field}</span>
                    <span className={`status status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    {c.answersDisagree && <span className="status status-warn">AI answers disagree</span>}
                  </div>
                  <p>
                    <strong>AI said:</strong> {c.claim}
                  </p>
                  {c.ownerValue && (
                    <p>
                      <strong>You said:</strong> {c.ownerValue}
                    </p>
                  )}
                  {c.note && <p className="note">{c.note}</p>}
                  <p className="tiny">
                    In {c.answerIndexes.length} {c.answerIndexes.length === 1 ? "answer" : "answers"}.{" "}
                    {c.sourceUrl ? (
                      <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Source the AI listed
                      </a>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {analysis.notStated.length > 0 && (
          <>
            <h3>Your facts the AI never mentioned</h3>
            <ul className="plain">
              {analysis.notStated.map((n, i) => (
                <li key={i}>
                  <strong>{n.field}:</strong> {n.ownerValue}
                </li>
              ))}
            </ul>
          </>
        )}
        {analysis.gaps.length > 0 && (
          <>
            <h3>What the answers lacked or left vague</h3>
            <ul className="plain">
              {analysis.gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="fix-title">
        <h2 id="fix-title">Paste-ready fixes</h2>
        <p className="hint">
          <span className="chip">AI-drafted</span> from the facts you typed. Read each one before you publish it. The app cannot post to Google, Zomato or Swiggy for you.
        </p>
        {fixing && !fixes && <p className="progress">Drafting fixes…</p>}
        {fixes && (
          <>
            {fixes.unverifiedNumbers.length > 0 && (
              <p className="alert" role="alert">
                Check these numbers before using the text. They are not in the facts you typed: <strong>{fixes.unverifiedNumbers.join(", ")}</strong>.
              </p>
            )}
            <Ticket title="Google Business Profile description" text={fixes.googleDescription} />
            <Ticket title="Zomato and Swiggy description" text={fixes.marketplaceDescription} />
            {fixes.hoursLine && <Ticket title="Opening hours line" text={fixes.hoursLine} />}
            {fixes.faqs.map((f, i) => (
              <Ticket key={i} title={`Website FAQ ${i + 1}: ${f.question}`} text={`${f.question}\n${f.answer}`} />
            ))}
            {fixes.needsFromOwner.length > 0 && (
              <>
                <h3>Facts you could add to make these better</h3>
                <ul className="plain">
                  {fixes.needsFromOwner.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="hint">Do not ask customers to include particular words in reviews. Google's review policy does not allow businesses to request specific content.</p>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="raw-title">
        <h2 id="raw-title">The answers behind this</h2>
        {answers.map((a, i) => (
          <details key={a.id} className="raw">
            <summary>
              Q{a.questionIndex + 1}, run {a.run}: {a.question}
              {a.status === "ok" ? "" : " (failed)"}
            </summary>
            {a.status === "ok" ? (
              <>
                <p className="answer-text">{a.text}</p>
                {a.sources.length > 0 && (
                  <ul className="plain sources">
                    {a.sources.slice(0, 6).map((s) => (
                      <li key={s.uri}>
                        <a href={s.uri} target="_blank" rel="noopener noreferrer">
                          {s.title || s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="tiny">Answer {i + 1}. Model: {a.model}</p>
              </>
            ) : (
              <p className="error">{a.error}</p>
            )}
          </details>
        ))}
      </section>

      <section className="card limits" aria-labelledby="limits-title">
        <h2 id="limits-title">How to read this honestly</h2>
        <ul className="plain">
          <li>The answers come from the Gemini API's own knowledge, with no live web search, so they can be out of date or wrong. They can differ from what people see in the ChatGPT or Gemini apps.</li>
          <li>The app did not read your Google Business Profile, Zomato, Swiggy or ChatGPT. No source links are shown because the answers are not web-searched.</li>
          <li>Only the facts you typed count as true. Everything else is an AI statement that may be wrong.</li>
          <li>{rate.total} answers is a small sample. Treat the rate as a first signal, not a ranking.</li>
        </ul>
      </section>
    </>
  );
}

function Ticket({ title, text }: { title: string; text: string }) {
  return (
    <div className="ticket">
      <div className="ticket-head">
        <h3>{title}</h3>
        <CopyButton text={text} />
      </div>
      <p className="ticket-text">{text}</p>
    </div>
  );
}
