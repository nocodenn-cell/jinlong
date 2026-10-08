/**
 * M2-B F1 — resolução de contexto de empresa ativa (servidor).
 * `empresa_id` / `loja_id` do cliente são apenas seleção; nunca autoridade.
 * Sem fallback para LOJA_MATRIZ_ID.
 */

export type TenantPapel = 'DONO' | 'GERENTE' | 'OPERADOR'

export type TenantVinculo = {
  empresaId: string
  lojaId: string | null
  papel: TenantPapel
  ativo: boolean
}

export type TenantLojaRef = { empresaId: string }

export type TenantContextOk = {
  ok: true
  authUserId: string
  empresaId: string
  lojaId: string | null
  papel: TenantPapel
  mode: 'multiempresa' | 'legacy_single_loja'
  version: number | null
}

export type TenantContextErr = {
  ok: false
  code:
    | 'NAO_AUTENTICADO'
    | 'USUARIO_INATIVO'
    | 'SEM_VINCULO'
    | 'EMPRESA_ATIVA_OBRIGATORIA'
    | 'EMPRESA_NAO_AUTORIZADA'
    | 'LOJA_FORA_DA_EMPRESA'
    | 'LOJA_NAO_AUTORIZADA'
    | 'EMPRESA_DIVERGENTE'
    | 'CONTEXTO_OBSOLETO'
}

export type TenantContextResult = TenantContextOk | TenantContextErr

export type ResolverContextoInput = {
  authUserId: string | null
  ativo: boolean
  vinculos: TenantVinculo[]
  /** Contexto persistido no servidor (usuario_contexto_ativo). */
  persistido?: { empresaId: string; lojaId: string | null; version: number } | null
  /** Sugestão da requisição — NÃO é autoridade. */
  solicitado?: { empresaId?: string | null; lojaId?: string | null } | null
  /** Empresa que a operação afirma estar usando (anti-stale). */
  empresaEsperadaOperacao?: string | null
  lojas: Record<string, TenantLojaRef>
  /**
   * Sem linhas em usuario_vinculos: modo legado (1 loja em usuarios.loja_id).
   * Não inventa empresa; só propaga loja.
   */
  legacyLojaId?: string | null
}

function papeisPreferidos(vinculos: TenantVinculo[]): TenantPapel {
  if (vinculos.some((v) => v.papel === 'DONO')) return 'DONO'
  if (vinculos.some((v) => v.papel === 'GERENTE')) return 'GERENTE'
  return 'OPERADOR'
}

/**
 * Algoritmo canônico fail-closed (D-M2A-1…5). Puro / testável sem I/O.
 */
export function resolverContextoEmpresaAtiva(input: ResolverContextoInput): TenantContextResult {
  if (!input.authUserId) return { ok: false, code: 'NAO_AUTENTICADO' }
  if (!input.ativo) return { ok: false, code: 'USUARIO_INATIVO' }

  const ativos = input.vinculos.filter((v) => v.ativo)

  if (ativos.length === 0) {
    if (input.legacyLojaId) {
      return {
        ok: true,
        authUserId: input.authUserId,
        empresaId: '',
        lojaId: input.legacyLojaId,
        papel: 'OPERADOR',
        mode: 'legacy_single_loja',
        version: null,
      }
    }
    return { ok: false, code: 'SEM_VINCULO' }
  }

  const empresas = [...new Set(ativos.map((v) => v.empresaId))]
  let empresaId = input.solicitado?.empresaId ?? input.persistido?.empresaId ?? null

  if (!empresaId) {
    if (empresas.length === 1) empresaId = empresas[0]
    else return { ok: false, code: 'EMPRESA_ATIVA_OBRIGATORIA' }
  }

  if (!empresas.includes(empresaId)) return { ok: false, code: 'EMPRESA_NAO_AUTORIZADA' }

  if (
    input.empresaEsperadaOperacao != null &&
    input.empresaEsperadaOperacao !== '' &&
    input.empresaEsperadaOperacao !== empresaId
  ) {
    return { ok: false, code: 'EMPRESA_DIVERGENTE' }
  }

  const vinculosEmpresa = ativos.filter((v) => v.empresaId === empresaId)
  let lojaId = input.solicitado?.lojaId ?? input.persistido?.lojaId ?? null

  if (lojaId) {
    const loja = input.lojas[lojaId]
    if (!loja || loja.empresaId !== empresaId) return { ok: false, code: 'LOJA_FORA_DA_EMPRESA' }
    const pode = vinculosEmpresa.some((v) => v.papel === 'DONO' || v.lojaId === lojaId)
    if (!pode) return { ok: false, code: 'LOJA_NAO_AUTORIZADA' }
  } else {
    const op = vinculosEmpresa.find((v) => v.papel === 'OPERADOR' && v.lojaId)
    if (op?.lojaId) lojaId = op.lojaId
    else if (vinculosEmpresa.length === 1 && vinculosEmpresa[0].lojaId) {
      lojaId = vinculosEmpresa[0].lojaId
    }
  }

  return {
    ok: true,
    authUserId: input.authUserId,
    empresaId,
    lojaId,
    papel: papeisPreferidos(vinculosEmpresa),
    mode: 'multiempresa',
    version: input.persistido?.version ?? null,
  }
}
