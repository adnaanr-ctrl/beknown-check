import CheckApp from "@/components/CheckApp";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="wrap header-row">
          <span className="logo">BeKnown<span className="logo-dot" aria-hidden="true" /></span>
          <span className="tag">Check</span>
        </div>
      </header>
      <main>
        <CheckApp />
      </main>
      <footer className="site-footer">
        <div className="wrap">
          BeKnown Check is a student project (Mesa School of Business, ForgeX). It shows what the Gemini API says from its own knowledge, without live web search.
          It does not read Google Business Profile, Zomato, Swiggy or the ChatGPT app directly.
        </div>
      </footer>
    </>
  );
}
