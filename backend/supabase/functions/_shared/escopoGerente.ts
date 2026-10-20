// Multiempresa / SEC-04 (ESPEC_MULTIEMPRESA_V1 §8, tabela de Edges): a loja do token de gerente é decidida
// no servidor. O corpo só pode ESCOLHER entre as lojas permitidas do usuário; nunca indicar outra.

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
 */
export async function resolverEscopoGerente(
  supabase: Admin,
  userId: string,
  lojaBody: string | null,
): Promise<{ ok: true; lojaId: string | null; empresaId: string | null } | { ok: false; error: string }> {
  const { data: u } = await supabase.from("usuarios").select("loja_id, perfil, ativo").eq("id", userId).maybeSingle();
  const lojaUsuario = (u?.loja_id as string | null) ?? null;
  let permitidas: string[] = lojaUsuario ? [lojaUsuario] : [];
  const vinc = await supabase.from("usuario_vinculos").select("empresa_id, loja_id, papel").eq("usuario_id", userId)
    .eq("ativo", true);
  if (!vinc.error && Array.isArray(vinc.data)) {
    const rows = vinc.data as Array<{ empresa_id: string; loja_id: string | null; papel: string }>;
    permitidas = [...permitidas, ...rows.map((r) => r.loja_id).filter((x): x is string => !!x)];
    const empresasDono = rows.filter((r) => r.papel === "DONO").map((r) => r.empresa_id);
    if (empresasDono.length > 0) {
      const l = await supabase.from("lojas").select("id").in("empresa_id", empresasDono);
      if (!l.error && Array.isArray(l.data)) permitidas.push(...(l.data as Array<{ id: string }>).map((x) => x.id));
    }
  }
  const d = decidirLojaToken({ lojaBody, lojaUsuario, permitidas });
  if (!d.ok) return d;
  let empresaId: string | null = null;
  if (d.lojaId) {
    const l = await supabase.from("lojas").select("empresa_id").eq("id", d.lojaId).maybeSingle();
    if (!l.error) empresaId = (l.data?.empresa_id as string | null) ?? null;
  }
  return { ok: true, lojaId: d.lojaId, empresaId };
}
