"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scrollToId } from "./SmoothScroll";

const ROW_A = [
  "Best juice bar near me?",
  "Kilpauk la nalla juice kadai edhu?",
  "Which café is open late tonight?",
  "Best cafés in Koramangala",
  "Is there seating for 10 people?",
  "Sabse accha shake kahan milega?",
];
const ROW_B = [
  "Vegetarian breakfast nearby",
  "Cheap coffee with Wi-Fi",
  "Where do locals go for falooda?",
  "Birthday party spot with a big table",
  "What time does it close?",
  "Is it any good?",
];

const HEADLINE = ["What", "does", "AI", "tell", "your", "customers", "about", "your", "café?"];

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    gsap.registerPlugin(ScrollTrigger);
    const half = el.scrollWidth / 2;
    const tween = gsap.fromTo(
      el,
      { x: reverse ? -half : 0 },
      { x: reverse ? 0 : -half, duration: 38, ease: "none", repeat: -1 },
    );
    // Scrolling the page speeds the marquee up, then it eases back.
    const st = ScrollTrigger.create({
      onUpdate: (self) => {
        const v = Math.min(Math.abs(self.getVelocity()) / 220, 7);
        gsap.to(tween, { timeScale: 1 + v, duration: 0.2, overwrite: true });
        gsap.to(tween, { timeScale: 1, duration: 1.1, delay: 0.2, overwrite: "auto" });
      },
    });
    return () => {
      st.kill();
      tween.kill();
    };
  }, [reverse]);

  const doubled = [...items, ...items];
  return (
    <div className={`marquee ${reverse ? "marquee-b" : ""}`} aria-hidden="true">
      <div className="marquee-track" ref={track}>
        {doubled.map((t, i) => (
          <span key={i} className="marquee-chip">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  const [loaded, setLoaded] = useState(false);
  const root = useRef<HTMLElement>(null);
  const loader = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);

  // Preloader: a quick count to 100, then the lime sheet lifts off and the headline rises in.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem("bk-seen") === "1";
      sessionStorage.setItem("bk-seen", "1");
    } catch {
      /* storage can be blocked; just show the intro */
    }
    const quick = reduce || seen;
    const ctx = gsap.context(() => {
      const words = gsap.utils.toArray<HTMLElement>(".h-word > span");
      const extras = gsap.utils.toArray<HTMLElement>(".hero-rise");
      const reveal = () => {
        document.body.classList.remove("is-loading");
        setLoaded(true);
        if (reduce) {
          gsap.set([...words, ...extras], { clearProps: "all" });
          return;
        }
        gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 1, ease: "power4.out", stagger: 0.05 });
        gsap.fromTo(extras, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.1, delay: 0.35 });
      };
      if (quick) {
        gsap.set(loader.current, { display: "none" });
        reveal();
        return;
      }
      document.body.classList.add("is-loading");
      gsap.set(words, { yPercent: 110 });
      gsap.set(extras, { opacity: 0 });
      const n = { v: 0 };
      const tl = gsap.timeline();
      tl.to(n, {
        v: 100,
        duration: 1.1,
        ease: "power2.inOut",
        onUpdate: () => {
          if (count.current) count.current.textContent = String(Math.round(n.v)).padStart(2, "0");
        },
      })
        .to(".loader-logo", { scale: 1.08, duration: 0.3, ease: "power2.out" }, "-=0.2")
        .to(loader.current, { yPercent: -100, duration: 0.85, ease: "power4.inOut", onStart: reveal })
        .set(loader.current, { display: "none" });
    }, root);
    return () => {
      ctx.revert();
      document.body.classList.remove("is-loading");
    };
  }, []);

  return (
    <section ref={root} className={`hero ${loaded ? "is-loaded" : ""}`} aria-labelledby="hero-title">
      <div className="loader" ref={loader} aria-hidden="true">
        <div className="loader-logo">
          BeKnown<span className="logo-dot" />
        </div>
        <span className="loader-count" ref={count}>
          00
        </span>
      </div>

      <div className="hero-inner">
        <p className="label hero-rise">[ FOR CAFÉS, JUICE BARS, BAKERIES &amp; RESTAURANTS ]</p>
        <h1 id="hero-title" className="hero-title">
          {HEADLINE.map((w, i) => (
            <span key={i}>
              <span className="h-word">
                <span className={w === "AI" ? "h-ai" : undefined}>{w}</span>
              </span>{" "}
            </span>
          ))}
        </h1>
        <p className="lead hero-rise">
          Customers now ask AI where to eat. We ask it the same questions, show whether it names you, check what it says against your own facts, and draft text
          you can paste into your listings.
        </p>
        <div className="hero-cta hero-rise">
          <button type="button" className="btn btn-primary btn-big" data-magnetic onClick={() => scrollToId("check")}>
            Run a check <span aria-hidden="true">↓</span>
          </button>
          <button type="button" className="btn btn-big" data-magnetic onClick={() => scrollToId("how")}>
            How it works
          </button>
        </div>
      </div>

      <div className="hero-marquees hero-rise">
        <Marquee items={ROW_A} />
        <Marquee items={ROW_B} reverse />
      </div>
    </section>
  );
}
