import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { decidirLojaToken, resolverEscopoGerente } from "./escopoGerente.ts";

const LA = "a0000001-0000-4000-8000-000000000001";
const LA2 = "a0000002-0000-4000-8000-000000000002";
const LB = "b0000001-0000-4000-8000-000000000001";

Deno.test("SEC-04: body só escolhe entre lojas permitidas", () => {
  assertEquals(decidirLojaToken({ lojaBody: null, lojaUsuario: LA, permitidas: [] }), { ok: true, lojaId: LA });
  assertEquals(decidirLojaToken({ lojaBody: LA2, lojaUsuario: LA, permitidas: [LA, LA2] }), { ok: true, lojaId: LA2 });
  assertEquals(decidirLojaToken({ lojaBody: LB, lojaUsuario: LA, permitidas: [LA, LA2] }), { ok: false, error: "LOJA_NAO_PERMITIDA" });
});

function fake(tables: Record<string, Array<Record<string, unknown>>>, semVinculos = false) {
  return {
    from(t: string) {
      const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), q),
        in: (c: string, vs: unknown[]) => (filtros.push((r) => vs.includes(r[c])), q),
        maybeSingle: async () => ({ data: (tables[t] ?? []).filter((r) => filtros.every((f) => f(r)))[0] ?? null, error: null }),
        then: (res: (v: unknown) => void) =>
          res(t === "usuario_vinculos" && semVinculos
            ? { data: null, error: { message: "relation does not exist" } }
            : { data: (tables[t] ?? []).filter((r) => filtros.every((f) => f(r))), error: null }),
      };
      return q;
    },
  };
}

Deno.test("SEC-04: DONO escolhe qualquer loja da empresa; empresa vem da loja escolhida", async () => {
  const db = fake({
    usuarios: [{ id: "u", loja_id: LA, perfil: "DONO", ativo: true }],
    usuario_vinculos: [{ usuario_id: "u", empresa_id: "E1", loja_id: null, papel: "DONO", ativo: true }],
    lojas: [{ id: LA, empresa_id: "E1" }, { id: LA2, empresa_id: "E1" }, { id: LB, empresa_id: "E2" }],
  });
  assertEquals(await resolverEscopoGerente(db, "u", LA2), { ok: true, lojaId: LA2, empresaId: "E1" });
  assertEquals(await resolverEscopoGerente(db, "u", LB), { ok: false, error: "LOJA_NAO_PERMITIDA" });
});

Deno.test("SEC-04: sem tabela de vínculos ⇒ só a loja do usuário", async () => {
  const db = fake({ usuarios: [{ id: "u", loja_id: LA }], lojas: [{ id: LA, empresa_id: "E1" }] }, true);
  assertEquals(await resolverEscopoGerente(db, "u", null), { ok: true, lojaId: LA, empresaId: "E1" });
  assertEquals(await resolverEscopoGerente(db, "u", LA2), { ok: false, error: "LOJA_NAO_PERMITIDA" });
});
