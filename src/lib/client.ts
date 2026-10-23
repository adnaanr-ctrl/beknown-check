import type { ApiErrorBody } from "./types";

export class ApiCallError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiCallError("network", "Could not reach the server. Check your connection and try again.", 0);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiCallError(err?.code ?? "http_" + res.status, err?.message ?? `The server returned an error (${res.status}).`, res.status);
  }
  return json as T;
}

/** Run async tasks with at most `limit` in flight. Results keep their input order. */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop: () => boolean = () => false,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      if (shouldStop()) return; // the run was abandoned: do not start more calls
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
