import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolverConsultaConfigGerente } from "./gerente-auth.ts";

// Regressão: sem empresa, só o emissor legado EXPLÍCITO (sync-outbox modo legado) usa pdv_config id=1.
Deno.test("sem empresa e sem flag legado ⇒ recusa (nunca id=1)", () => {
  assertEquals(resolverConsultaConfigGerente(null), { tipo: "recusar" });
  assertEquals(resolverConsultaConfigGerente("   "), { tipo: "recusar" });
});
Deno.test("dispositivo/usuário com empresa ⇒ linha da própria empresa", () => {
  assertEquals(resolverConsultaConfigGerente(" e1 "), { tipo: "empresa", empresaId: "e1" });
  assertEquals(resolverConsultaConfigGerente("e1", true), { tipo: "empresa", empresaId: "e1" });
});
Deno.test("legado explícito do cliente 1 ⇒ id=1", () => {
  assertEquals(resolverConsultaConfigGerente(null, true), { tipo: "legado_id1" });
});
