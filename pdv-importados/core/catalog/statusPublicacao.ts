/**
 * Lifecycle catálogo R1 — dual-write status_publicacao + ativo.
 */
import { isProdutoVendavel } from '../../../shared-core/src/catalog/isProdutoVendavel'

export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'

export function ativoFromStatusPublicacao(status: StatusPublicacao): boolean {
  return status === 'PUBLICADO'
}

export function statusFromAtivoLegacy(ativo: boolean): StatusPublicacao {
  return ativo ? 'PUBLICADO' : 'INATIVO'
}

/** Novo cadastro manual / CSV sem override explícito → DRAFT até publicar. */
export function defaultStatusNovoProduto(input: {
  status_publicacao?: StatusPublicacao
  ativo?: boolean
}): { status_publicacao: StatusPublicacao; ativo: boolean } {
  if (input.status_publicacao) {
    const status = input.status_publicacao
    return { status_publicacao: status, ativo: ativoFromStatusPublicacao(status) }
  }
  if (input.ativo === true) {
    return { status_publicacao: 'PUBLICADO', ativo: true }
  }
  if (input.ativo === false) {
    return { status_publicacao: 'DRAFT', ativo: false }
  }
  return { status_publicacao: 'DRAFT', ativo: false }
}

export function dualWriteFromStatus(
  status: StatusPublicacao,
): { status_publicacao: StatusPublicacao; ativo: boolean } {
  return { status_publicacao: status, ativo: ativoFromStatusPublicacao(status) }
}

/** Leitura pessimista R1+: ausente → INATIVO (não inferir de ativo). */
export function resolveStatusPublicacaoLeitura(
  status: StatusPublicacao | null | undefined,
  _ativo?: boolean | null,
): StatusPublicacao {
  void _ativo
  if (status === 'DRAFT' || status === 'PUBLICADO' || status === 'INATIVO') {
    return status
  }
  return 'INATIVO'
}

/** Vendabilidade PDV — delega regra única shared-core. */
export function isVendavelPdv(
  status: StatusPublicacao | null | undefined,
  ativo?: boolean | null,
): boolean {
  return isProdutoVendavel({ ativo: ativo ?? false, status_publicacao: status ?? null })
}
