// Best-effort, in-memory limiter. On serverless hosting each instance has its own memory,
// so this slows casual abuse of your Gemini key but is not a hard guarantee.
const WINDOW_MS = 10 * 60 * 1000;
// One check is about 15 requests (more with retries). 200 allows roughly 8 checks per 10 minutes per
// address, which leaves room for several people on one shared WiFi.
const MAX_REQUESTS = 200;
const hits = new Map<string, number[]>();

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") ?? "local").trim();
}

export function allow(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}
