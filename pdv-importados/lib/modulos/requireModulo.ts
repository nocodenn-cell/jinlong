/**
 * Gate de módulo opcional por cliente contratante (D3, F1).
 *
 * Nega por padrão. O acesso exige, cumulativamente e verificado no banco
 * (fp_empresa_contexto_modulo → fp_pode_modulo):
 *   1. tenant válido (vínculo ativo do usuário com a empresa);
 *   2. módulo habilitado e dentro da vigência;
 *   3. usuário autenticado (sessão do próprio usuário, nunca service_role);
 *   4. papel autorizado (padrão: DONO);
 *   5. empresa operacional (status e vigência da empresa).
 *
 * O tenant é DERIVADO da sessão. Um empresaId vindo do frontend só é usado como
 * escolha entre empresas já autorizadas e é validado no banco; ambiguidade nega.
 * Não usa feature_flags global.
 */

export const MODULOS = ['IMPORT_INTELLIGENCE'] as const
export type ModuloCodigo = (typeof MODULOS)[number]

export type PapelModulo = 'DONO' | 'GERENTE' | 'OPERADOR'

export type ModuloNegado = { ok: false; motivo: 'SEM_SESSAO' | 'NEGADO' | 'ERRO' }
export type ModuloLiberado = { ok: true; empresaId: string; modulo: ModuloCodigo }
export type ResultadoModulo = ModuloLiberado | ModuloNegado

/** Contrato mínimo do client Supabase com a sessão do usuário (permite teste sem rede). */
export type ClienteSessao = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> }
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function requireModulo(
  client: ClienteSessao,
  modulo: ModuloCodigo,
  opts: { papeis?: readonly PapelModulo[]; empresaId?: string | null } = {},
): Promise<ResultadoModulo> {
  if (!MODULOS.includes(modulo)) return { ok: false, motivo: 'NEGADO' }

  const papeis = opts.papeis && opts.papeis.length > 0 ? [...opts.papeis] : ['DONO']
  const empresaPedida = opts.empresaId ?? null
  if (empresaPedida !== null && !UUID_RE.test(empresaPedida)) return { ok: false, motivo: 'NEGADO' }

  try {
    const { data: userData, error: userErr } = await client.auth.getUser()
    if (userErr || !userData?.user?.id) return { ok: false, motivo: 'SEM_SESSAO' }

    const { data, error } = await client.rpc('fp_empresa_contexto_modulo', {
      p_modulo: modulo,
      p_papeis: papeis,
      p_empresa: empresaPedida,
    })
    if (error) return { ok: false, motivo: 'ERRO' }
    if (typeof data !== 'string' || !UUID_RE.test(data)) return { ok: false, motivo: 'NEGADO' }
    if (empresaPedida !== null && data.toLowerCase() !== empresaPedida.toLowerCase()) {
      return { ok: false, motivo: 'NEGADO' }
    }
    return { ok: true, empresaId: data, modulo }
  } catch {
    return { ok: false, motivo: 'ERRO' }
  }
}
