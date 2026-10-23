"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STEPS = [
  {
    n: "01",
    tone: "lime",
    kicker: "ASK",
    title: "We ask what your customers ask.",
    body: "Six real-sounding questions about your area, five that don't name you and one that does. One can be in Tamil-English, Hinglish or Kannada-English.",
    visual: "ask",
  },
  {
    n: "02",
    tone: "paper",
    kicker: "COUNT",
    title: "Are you named, or is it someone else?",
    body: "We count how often the AI names you, show a plausible range, and list who it named instead.",
    visual: "count",
  },
  {
    n: "03",
    tone: "stamp",
    kicker: "COMPARE",
    title: "AI said. You said.",
    body: "You type the facts you know are true. We flag where the AI's claim differs. It's a prompt to check, not proof of who is right.",
    visual: "compare",
  },
  {
    n: "04",
    tone: "ink",
    kicker: "FIX",
    title: "Text you can paste.",
    body: "Draft descriptions for Google, Zomato and Swiggy, an hours line and three FAQs, using only your facts. Numbers you didn't give are flagged.",
    visual: "fix",
  },
] as const;

function Visual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  if (kind === "ask") {
    return (
      <div className="viz viz-ask" aria-hidden="true">
        <span className="vb vb1">Best juice bar near me?</span>
        <span className="vb vb2">Open late tonight?</span>
        <span className="vb vb3">Kilpauk la nalla juice kadai?</span>
      </div>
    );
  }
  if (kind === "count") {
    return (
      <div className="viz viz-count" aria-hidden="true">
        <span className="vbig">? of 5</span>
        <span className="vdots">
          <i /> <i /> <i /> <i /> <i />
        </span>
      </div>
    );
  }
  if (kind === "compare") {
    return (
      <div className="viz viz-compare" aria-hidden="true">
        <div className="vcard">
          <small>AI said</small>
          <b>Closes at 9 PM</b>
        </div>
        <span className="vvs">vs</span>
        <div className="vcard">
          <small>You said</small>
          <b>Closes at 11 PM</b>
        </div>
      </div>
    );
  }
  return (
    <div className="viz viz-fix" aria-hidden="true">
      <div className="vticket">
        <small>Google description</small>
        <span />
        <span />
        <span className="short" />
        <em>Copy</em>
      </div>
    </div>
  );
}

/** Pinned section: scrolling the page moves four panels sideways. On small screens it is a swipe row. */
export default function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      const t = track.current;
      if (!t) return;
      const dist = () => Math.max(0, t.scrollWidth - window.innerWidth);
      const slide = gsap.to(t, {
        x: () => -dist(),
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          pin: true,
          scrub: 0.7,
          start: "top top",
          end: () => "+=" + dist(),
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
          },
        },
      });
      // Each panel's big number drifts a little faster than the panel itself.
      gsap.utils.toArray<HTMLElement>(".step-n").forEach((el) => {
        gsap.fromTo(el, { xPercent: 6 }, {
          xPercent: -6,
          ease: "none",
          scrollTrigger: { trigger: el, containerAnimation: slide,start: "left right", end: "right left", scrub: true },
        });
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={root} id="how" className="how" aria-labelledby="how-title">
      <div className="how-head">
        <h2 id="how-title" className="how-title">
          How it works
        </h2>
        <span className="label how-hint">[ SCROLL → ]</span>
      </div>
      <div className="how-track" ref={track}>
        <div className="how-lead">
          <p>
            Four steps.
            <br />
            About 9 AI calls.
            <br />
            No account.
          </p>
        </div>
        {STEPS.map((s) => (
          <article key={s.n} className={`step step-${s.tone}`}>
            <span className="step-n" aria-hidden="true">
              {s.n}
            </span>
            <div className="step-body">
              <p className="label">[ {s.kicker} ]</p>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
            <Visual kind={s.visual} />
          </article>
        ))}
        <div className="how-end">
          <p>Now try it on your business ↓</p>
        </div>
      </div>
      <div className="how-progress" aria-hidden="true">
        <span ref={bar} />
      </div>
    </section>
  );
}
