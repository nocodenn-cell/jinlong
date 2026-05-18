/** Thin structured logger for Edge Functions — no browser-API dependencies. */
export function logJson(svc: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), svc, ...payload }));
}
