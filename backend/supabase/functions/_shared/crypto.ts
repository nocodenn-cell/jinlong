const encoder = new TextEncoder();

/** Comparação em tempo constante (evita leak por timing em segredos / assinaturas). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}
