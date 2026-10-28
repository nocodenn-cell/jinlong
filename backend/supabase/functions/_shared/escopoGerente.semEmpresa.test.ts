import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ESCOPO_SEM_EMPRESA, resolverEscopoGerente } from "./escopoGerente.ts";

// Regressão: usuário sem loja/vínculo e sem loja_id no corpo NÃO pode cair na pdv_config id=1
// (senha de gerente da Empresa 1) nem receber token com loja nula.

const LA = "a0000001-0000-4000-8000-000000000001";
const LB = "b0000001-0000-4000-8000-000000000001";

function fake(tables: Record<string, Array<Record<string, unknown>>>, opts: { semVinculos?: boolean; inserts?: string[] } = {}) {
  return {
    from(t: string) {
      const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push((r) => r[c] === v), q),
        is: (c: string, v: unknown) => (filtros.push((r) => (r[c] ?? null) === v), q),
        in: (c: string, vs: unknown[]) => (filtros.push((r) => vs.includes(r[c])), q),
        insert: async () => (opts.inserts?.push(t), { data: null, error: null }),
        maybeSingle: async () => ({ data: (tables[t] ?? []).filter((r) => filtros.every((f) => f(r)))[0] ?? null, error: null }),
        then: (res: (v: unknown) => void) =>
          res(t === "usuario_vinculos" && opts.semVinculos
            ? { data: null, error: { message: "relation does not exist" } }
            : { data: (tables[t] ?? []).filter((r) => filtros.every((f) => f(r))), error: null }),
      };
      return q;
    },
  };
}

Deno.test("SEC-04b: sem loja/vínculo e sem loja_id ⇒ recusa (sem empresa)", async () => {
  const db = fake({
    usuarios: [{ id: "u", loja_id: null, perfil: "OPERADOR", ativo: true }],
    usuario_vinculos: [],
    lojas: [{ id: LA, empresa_id: "E1" }],
    pdv_config: [{ id: 1, loja_id: null, empresa_id: "E1" }],
  });
  assertEquals(await resolverEscopoGerente(db, "u", null), { ok: false, error: ESCOPO_SEM_EMPRESA });
});

Deno.test("SEC-04b: loja sem empresa resolvível ⇒ recusa (nunca empresaId null)", async () => {
  const db = fake({ usuarios: [{ id: "u", loja_id: LA, perfil: "GERENTE", ativo: true }], lojas: [{ id: LA, empresa_id: null }] }, { semVinculos: true });
  assertEquals(await resolverEscopoGerente(db, "u", null), { ok: false, error: ESCOPO_SEM_EMPRESA });
});

Deno.test("SEC-04b: empresa válida ⇒ usa a empresa da loja (config dessa empresa)", async () => {
  const db = fake({
    usuarios: [{ id: "u", loja_id: LB, perfil: "GERENTE", ativo: true }],
    usuario_vinculos: [{ usuario_id: "u", empresa_id: "E2", loja_id: LB, papel: "GERENTE", ativo: true }],
    lojas: [{ id: LA, empresa_id: "E1" }, { id: LB, empresa_id: "E2" }],
  });
  const r = await resolverEscopoGerente(db, "u", null);
  assertEquals(r, { ok: true, lojaId: LB, empresaId: "E2" });
});

Deno.test("SEC-04b: escopo ok nunca tem loja nula (nenhum token com loja nula)", async () => {
  const casos: Array<[Record<string, Array<Record<string, unknown>>>, string | null]> = [
    [{ usuarios: [{ id: "u", loja_id: null }], usuario_vinculos: [], lojas: [] }, null],
    [{ usuarios: [], usuario_vinculos: [], lojas: [{ id: LA, empresa_id: "E1" }] }, null],
    [{ usuarios: [{ id: "u", loja_id: LA }], usuario_vinculos: [], lojas: [{ id: LA, empresa_id: "E1" }] }, null],
  ];
  for (const [tables, body] of casos) {
    const r = await resolverEscopoGerente(fake(tables), "u", body);
    if (r.ok) {
      assertEquals(typeof r.lojaId, "string");
      assertEquals(typeof r.empresaId, "string");
    }
  }
});
