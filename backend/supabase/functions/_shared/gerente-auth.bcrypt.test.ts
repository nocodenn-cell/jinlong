// Regressao de 680984c7: a troca de `import bcrypt from ...` para
// `import * as bcrypt from ...` (para calar TS1192) manteve o type-check verde
// mas quebrou o runtime — `bcrypt.compareSync` e `undefined` quando o modulo
// CJS chega via esm.sh, porque os metodos ficam sob `.default`.
//
// Efeito: `bcrypt.compareSync is not a function` em toda autorizacao de gerente
// (desconto no PDV, aprovacao de movimentacao de caixa, baixa de contas a
// pagar). Ninguem percebeu por ~3 meses porque nenhum teste tocava esta linha.
//
// Roda com: deno test backend/supabase/functions/_shared/gerente-auth.bcrypt.test.ts
import * as bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { verificarSenhaGerenteBcrypt } from "./gerente-auth.ts";

// Asserts locais de proposito: evitam somar `deno.land/std` ao deno.lock.
// O lockfile versionado esta no formato v4 e o backend fixa `deno@2.2.2`
// (`npm run check:edge`), que nao le o formato v5 gerado por Deno mais novo —
// puxar dependencia nova aqui quebraria aquele gate por efeito colateral.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertEquals<T>(atual: T, esperado: T, msg?: string): void {
  if (atual !== esperado) {
    throw new Error(`${msg ?? "assertEquals"}: esperado ${String(esperado)}, recebido ${String(atual)}`);
  }
}

// Senha sintetica, exclusiva deste teste. Nao e credencial de QA nem de producao.
const SENHA_FIXTURE = "teste-regressao-bcrypt-nao-e-credencial";

const bcryptImpl = (bcrypt as unknown as { default: typeof bcrypt }).default;

/**
 * Guarda de shape: se uma futura troca de import/versao voltar a mover os
 * metodos do modulo, isto falha ANTES de chegar em producao — em vez de
 * derrubar a autorizacao silenciosamente.
 */
Deno.test("bcryptjs via esm.sh expoe compareSync/hashSync no shape usado em producao", () => {
  assertEquals(
    typeof bcryptImpl?.compareSync,
    "function",
    "compareSync inacessivel: o shape do modulo bcryptjs mudou — ver 680984c7",
  );
  assertEquals(
    typeof bcryptImpl?.hashSync,
    "function",
    "hashSync inacessivel: o shape do modulo bcryptjs mudou — ver 680984c7",
  );
});

Deno.test("verificarSenhaGerenteBcrypt aceita a senha correta", () => {
  const hash = bcryptImpl.hashSync(SENHA_FIXTURE, 10);
  assert(hash.startsWith("$2"), "hash gerado nao parece bcrypt");
  assertEquals(verificarSenhaGerenteBcrypt(SENHA_FIXTURE, hash), true);
});

Deno.test("verificarSenhaGerenteBcrypt rejeita senha incorreta", () => {
  const hash = bcryptImpl.hashSync(SENHA_FIXTURE, 10);
  assertEquals(verificarSenhaGerenteBcrypt(`${SENHA_FIXTURE}-errada`, hash), false);
  assertEquals(verificarSenhaGerenteBcrypt("", hash), false);
});
