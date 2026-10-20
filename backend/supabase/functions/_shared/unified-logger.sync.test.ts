// Guarda anti-deriva: _shared/unified-logger.ts é cópia de shared/unified-logger.ts (validar-gerente
// precisa ser autocontido para o empacotamento do Supabase). Compara o código de cada export.
import * as copia from "./unified-logger.ts";
import * as original from "../../../../shared/unified-logger.ts";

Deno.test("_shared/unified-logger.ts idêntico a shared/unified-logger.ts", () => {
  const a = Object.keys(copia).sort(), b = Object.keys(original).sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`exports diferem: ${a} x ${b}`);
  for (const k of a) {
    const x = (copia as Record<string, unknown>)[k], y = (original as Record<string, unknown>)[k];
    const sx = typeof x === "function" ? x.toString() : JSON.stringify(x);
    const sy = typeof y === "function" ? y.toString() : JSON.stringify(y);
    if (sx !== sy) throw new Error(`export ${k} divergiu — sincronize a cópia`);
  }
});
