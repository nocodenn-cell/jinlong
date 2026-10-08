/**
 * M2-B F3 — assert de TenantContext para Server Actions / API.
 * Não usa LOJA_MATRIZ_ID. Não confia em empresa_id do cliente como authz.
 */
import {
  resolverContextoEmpresaAtiva,
  type TenantContextOk,
  type TenantContextResult,
  type TenantVinculo,
} from '@/lib/admin/auth/tenantContext'

export type AssertTenantInput = {
  authUserId: string | null
  ativo: boolean
  vinculos: TenantVinculo[]
  persistido?: { empresaId: string; lojaId: string | null; version: number } | null
  solicitadoEmpresaId?: string | null
  solicitadoLojaId?: string | null
  /** Empresa gravada no formulário/operação — detecta request atrasada pós-troca. */
  empresaEsperadaOperacao?: string | null
  lojas: Record<string, { empresaId: string }>
  legacyLojaId?: string | null
}

export type AssertTenantOk = { ok: true; context: TenantContextOk }
export type AssertTenantErr = { ok: false; code: Exclude<TenantContextResult, { ok: true }>['code'] }

export function assertTenantContext(input: AssertTenantInput): AssertTenantOk | AssertTenantErr {
  const resolved = resolverContextoEmpresaAtiva({
    authUserId: input.authUserId,
    ativo: input.ativo,
    vinculos: input.vinculos,
    persistido: input.persistido,
    solicitado: {
      empresaId: input.solicitadoEmpresaId,
      lojaId: input.solicitadoLojaId,
    },
    empresaEsperadaOperacao: input.empresaEsperadaOperacao,
    lojas: input.lojas,
    legacyLojaId: input.legacyLojaId,
  })

  if (!resolved.ok) return { ok: false, code: resolved.code }

  // Legado sem empresa: permitido só para compat single-loja (F3).
  if (resolved.mode === 'legacy_single_loja' && !resolved.lojaId) {
    return { ok: false, code: 'SEM_VINCULO' }
  }

  return { ok: true, context: resolved }
}

/** Mapeia código tipado → reason estável para adminPolicy / logs (sem PII). */
export function tenantCodeToPolicyReason(code: AssertTenantErr['code']): string {
  switch (code) {
    case 'NAO_AUTENTICADO':
      return 'unauthenticated'
    case 'USUARIO_INATIVO':
      return 'conta_inativa'
    case 'SEM_VINCULO':
      return 'conta_sem_loja'
    case 'EMPRESA_ATIVA_OBRIGATORIA':
      return 'empresa_ativa_obrigatoria'
    case 'EMPRESA_NAO_AUTORIZADA':
      return 'empresa_nao_autorizada'
    case 'LOJA_FORA_DA_EMPRESA':
    case 'LOJA_NAO_AUTORIZADA':
      return 'loja_nao_autorizada'
    case 'EMPRESA_DIVERGENTE':
    case 'CONTEXTO_OBSOLETO':
      return 'empresa_divergente'
    default: {
      const _x: never = code
      return _x
    }
  }
}
