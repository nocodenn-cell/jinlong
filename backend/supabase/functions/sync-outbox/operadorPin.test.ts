import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { bloqueadoAgora, derivarPinHash, hashDispositivo, montarCacheOperadores, parseOperadorEvento } from "./operadorPin.ts";

const U = "d2000000-0000-4000-8000-000000000003";
const L = "d1000000-0000-4000-8000-00000000000a";

Deno.test("PBKDF2-SHA256 bate com vetor de referência (RFC 7914 §11)", async () => {
  // P="passwd", S="salt", c=1, dkLen=32 (primeiros 32 bytes do vetor de 64)
  const saltHex = Array.from(new TextEncoder().encode("salt")).map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(await derivarPinHash("passwd", saltHex, 1), "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc");
});

Deno.test("hash_dispositivo depende do segredo do dispositivo", async () => {
  const a = await hashDispositivo("s".repeat(48), U, "a".repeat(64));
  const b = await hashDispositivo("t".repeat(48), U, "a".repeat(64));
  assertEquals(a.length, 64);
  assert(a !== b);
});

Deno.test("cache não leva pin_hash do banco", async () => {
  const c = await montarCacheOperadores([
    { usuario_id: U, nome: "Caixa", papel: "OPERADOR", idioma: "zh", pin_hash: "a".repeat(64), pin_salt: "b".repeat(32), pin_iteracoes: 120000, pin_bloqueado_ate: null },
    { usuario_id: L, nome: "Ana", papel: "GERENTE", idioma: "pt", pin_hash: null, pin_salt: null, pin_iteracoes: null, pin_bloqueado_ate: null },
  ], "s".repeat(48));
  assertEquals(c.map((x) => x.nome), ["Ana", "Caixa"]);
  assert(!JSON.stringify(c).includes("a".repeat(64)));
  assertEquals(c[0].tem_pin, false);
  assertEquals(c[1].idioma, "zh");
});

Deno.test("bloqueio", () => {
  assert(bloqueadoAgora("infinity"));
  assert(!bloqueadoAgora(null));
  assert(bloqueadoAgora(new Date(Date.now() + 60_000).toISOString()));
  assert(!bloqueadoAgora(new Date(Date.now() - 60_000).toISOString()));
});

Deno.test("evento de operador: valida e descarta campos desconhecidos", () => {
  const e = parseOperadorEvento({ id: U, loja_id: L, usuario_id: U, tipo: "entrou", origem: "offline", detalhe: { pin: "7391", motivo: "x" } });
  assertEquals(e.tipo, "ENTROU");
  assertEquals(e.origem, "offline");
  assertEquals(e.detalhe, { motivo: "x" });
  assertThrows(() => parseOperadorEvento({ id: U, loja_id: L, tipo: "QUALQUER" }));
  assertThrows(() => parseOperadorEvento({ id: "x", loja_id: L, tipo: "SAIU" }));
});
