"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * A soft cursor that grows over links and buttons, and a small "magnetic" pull on buttons that
 * carry data-magnetic. Only runs with a mouse and no reduced-motion preference.
 */
export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = dot.current;
    if (!fine || reduce || !el) return;

    document.documentElement.classList.add("has-cursor");
    const x = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
    const y = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });
    let magnet: HTMLElement | null = null;

    const move = (e: PointerEvent) => {
      x(e.clientX);
      y(e.clientY);
      const target = e.target as HTMLElement | null;
      const hot = target?.closest("a, button, summary, select, input, [data-hot]");
      el.classList.toggle("is-hot", Boolean(hot));
      el.classList.toggle("is-text", Boolean(target?.closest("input, textarea")));

      const m = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (magnet && magnet !== m) gsap.to(magnet, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.5)" });
      magnet = m;
      if (m) {
        const r = m.getBoundingClientRect();
        gsap.to(m, {
          x: (e.clientX - (r.left + r.width / 2)) * 0.25,
          y: (e.clientY - (r.top + r.height / 2)) * 0.35,
          duration: 0.3,
          ease: "power2.out",
        });
      }
    };
    const leave = () => el.classList.add("is-away");
    const enter = () => el.classList.remove("is-away");

    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerenter", enter);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerenter", enter);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return <div ref={dot} className="cursor is-away" aria-hidden="true" />;
}
