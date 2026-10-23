import CheckApp from "@/components/CheckApp";
import Cursor from "@/components/Cursor";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import SmoothScroll from "@/components/SmoothScroll";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Cursor />
      <header className="site-header">
        <a className="logo" href="#top" aria-label="BeKnown Check, top of page">
          BeKnown<span className="logo-dot" aria-hidden="true" />
        </a>
        <span className="tag">Check</span>
      </header>
      <main id="top">
        <Hero />
        <HowItWorks />
        <CheckApp />
      </main>
      <footer className="site-footer">
        <p className="foot-big" aria-hidden="true">
          Be known.
        </p>
        <div className="wrap">
          BeKnown Check is a student project (Mesa School of Business, ForgeX). It shows what the Gemini API says from its own knowledge, without live web search.
          It does not read Google Business Profile, Zomato, Swiggy or the ChatGPT app directly.
        </div>
      </footer>
    </>
  );
}
