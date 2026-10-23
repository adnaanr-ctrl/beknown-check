"use client";

import { useState } from "react";
import { copyText } from "@/lib/client";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? "done" : "failed");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "done" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
