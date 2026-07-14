/** Logger mínimo para Edge — evita import monorepo fora do bundle Docker. */
export function logJson(svc: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), svc, ...payload }))
}
