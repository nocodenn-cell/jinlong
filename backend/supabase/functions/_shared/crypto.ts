const encoder = new TextEncoder();

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Comparação em tempo constante sobre SHA-256 das strings (evita leak de comprimento do segredo).
 * Use para API keys / SYNC_KEY / FISCAL_WORKER_KEY. Exige ambos não vazios antes de chamar.
 */
export async function timingSafeEqualSecret(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(da), new Uint8Array(db));
}

/** Comparação em tempo constante para strings do mesmo comprimento esperado (ex.: hex fixo). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  return timingSafeEqualBytes(ba, bb);
}
