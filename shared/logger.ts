/** Log estruturado para Edge functions */
export function logJson(svc: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), svc, ...payload })
  );
}