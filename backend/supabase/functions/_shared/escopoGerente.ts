// Multiempresa / SEC-04 (ESPEC_MULTIEMPRESA_V1 §8, tabela de Edges): a loja do token de gerente é decidida
// no servidor. O corpo só pode ESCOLHER entre as lojas permitidas do usuário; nunca indicar outra.

export const ESCOPO_SEM_EMPRESA = "ESCOPO_GERENTE_SEM_EMPRESA" as const;
/** 20261028 (decisão do dono, item 3): usuário inativo, sem papel de loja ou sem vínculo ativo não pede token. */
export const USUARIO_INATIVO = "USUARIO_INATIVO_OU_SEM_VINCULO" as const;
const PAPEIS_LOJA = new Set(["DONO", "GERENTE", "OPERADOR"]);

export type DecisaoLoja =
  | { ok: true; lojaId: string | null }
  | { ok: false; error: "LOJA_NAO_PERMITIDA" };

/** Regra pura (testável): body ∈ permitidas ⇒ body; body ausente ⇒ loja do usuário; senão recusa. */
export function decidirLojaToken(input: {
  lojaBody: string | null;
  lojaUsuario: string | null;
  permitidas: string[];
}): DecisaoLoja {
  const body = input.lojaBody?.trim() || null;
  if (!body) return { ok: true, lojaId: input.lojaUsuario };
  const permitidas = new Set(input.permitidas);
  if (input.lojaUsuario) permitidas.add(input.lojaUsuario);
  return permitidas.has(body) ? { ok: true, lojaId: body } : { ok: false, error: "LOJA_NAO_PERMITIDA" };
}

type Admin = {
  // deno-lint-ignore no-explicit-any
  from: (t: string) => any;
};

/**
 * Lê loja do usuário + vínculos (DONO ⇒ todas as lojas da empresa) e decide a loja do token e a empresa
 * (para escolher a senha de gerente DA EMPRESA). Tabelas multiempresa ausentes ⇒ comportamento antigo.
 *
 * Fail-closed: sem loja OU sem empresa resolvida no servidor ⇒ recusa (ESCOPO_GERENTE_SEM_EMPRESA).
 * Nunca cair na pdv_config id=1 (senha de gerente da Empresa 1) nem emitir token com loja nula.
 * Usuário inexistente, inativo ou com perfil fora de DONO/GERENTE/OPERADOR ⇒ USUARIO_INATIVO_OU_SEM_VINCULO.
 * Com a tabela de vínculos disponível, a loja escolhida precisa estar coberta por vínculo ATIVO (DONO ⇒ empresa;
 * GERENTE/OPERADOR ⇒ a própria loja); a loja cadastral sozinha não basta. O banco confere de novo no consumo.
 */
export async function resolverEscopoGerente(
  supabase: Admin,
  userId: string,
  lojaBody: string | null,
): Promise<{ ok: true; lojaId: string; empresaId: string } | { ok: false; error: string }> {
  const { data: u } = await supabase.from("usuarios").select("loja_id, perfil, ativo").eq("id", userId).maybeSingle();
  if (!u || u.ativo !== true || !PAPEIS_LOJA.has(String(u.perfil ?? ""))) return { ok: false, error: USUARIO_INATIVO };
  const lojaUsuario = (u?.loja_id as string | null) ?? null;
  let permitidas: string[] = lojaUsuario ? [lojaUsuario] : [];
  let porVinculo: Set<string> | null = null;
  const vinc = await supabase.from("usuario_vinculos").select("empresa_id, loja_id, papel").eq("usuario_id", userId)
    .eq("ativo", true);
  if (!vinc.error && Array.isArray(vinc.data)) {
    const rows = vinc.data as Array<{ empresa_id: string; loja_id: string | null; papel: string }>;
    porVinculo = new Set(rows.map((r) => r.loja_id).filter((x): x is string => !!x));
    permitidas = [...permitidas, ...porVinculo];
    const empresasDono = rows.filter((r) => r.papel === "DONO").map((r) => r.empresa_id);
    if (empresasDono.length > 0) {
      const l = await supabase.from("lojas").select("id").in("empresa_id", empresasDono);
      if (!l.error && Array.isArray(l.data)) {
        for (const x of l.data as Array<{ id: string }>) {
          permitidas.push(x.id);
          porVinculo.add(x.id);
        }
      }
    }
  }
  const d = decidirLojaToken({ lojaBody, lojaUsuario, permitidas });
  if (!d.ok) return d;
  if (d.lojaId && porVinculo && !porVinculo.has(d.lojaId)) return { ok: false, error: USUARIO_INATIVO };
  let empresaId: string | null = null;
  if (d.lojaId) {
    const l = await supabase.from("lojas").select("empresa_id").eq("id", d.lojaId).maybeSingle();
    if (!l.error) empresaId = (l.data?.empresa_id as string | null) ?? null;
  }
  if (!d.lojaId || !empresaId) return { ok: false, error: ESCOPO_SEM_EMPRESA };
  return { ok: true, lojaId: d.lojaId, empresaId };
}
