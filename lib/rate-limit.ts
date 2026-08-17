const attempts = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const history = attempts.get(ip) ?? [];
  const recent = history.filter((t) => now - t < WINDOW_MS);
  attempts.set(ip, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordAttempt(ip: string): void {
  const history = attempts.get(ip) ?? [];
  history.push(Date.now());
  attempts.set(ip, history);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, history] of attempts) {
    const recent = history.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) attempts.delete(ip);
    else attempts.set(ip, recent);
  }
}, WINDOW_MS);
