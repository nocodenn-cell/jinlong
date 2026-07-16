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

/**
 * Leitura de negócio: o produto está em rascunho? A UI consome este predicado
 * em vez de comparar status_publicacao por literal (enforçado por
 * scripts/core-rule-guard.mjs). Leitura pessimista: ausente → não é rascunho.
 *
 * Predicado canônico único (a antiga `isStatusRascunho`, byte-idêntica, foi
 * consolidada aqui na reconciliação #191 × #196).
 */
export function isRascunho(status: StatusPublicacao | null | undefined): boolean {
  return resolveStatusPublicacaoLeitura(status) === 'DRAFT'
}

/**
 * Intenção de salvar como rascunho → payload canônico. Mantém o literal 'DRAFT'
 * dentro do core; a UI apenas envia a intenção (opts.rascunho) e espalha isto.
 */
export function payloadStatusRascunho(): { status_publicacao: 'DRAFT' } {
  return { status_publicacao: 'DRAFT' }
}

/**
 * Decisão de negócio: só rascunho é publicável (ação "Publicar" individual).
 * A UI consome este predicado — nunca compara status_publicacao por literal
 * (enforçado por scripts/core-rule-guard.mjs).
 */
export function podePublicarProduto(status: StatusPublicacao | null | undefined): boolean {
  return isRascunho(status)
}

/**
 * Decisão de negócio: quando o formulário pode oferecer "salvar como rascunho".
 * Ao criar, sempre; ao editar, apenas enquanto ainda for rascunho — um produto
 * já publicado não regressa a rascunho por este caminho.
 */
export function podeSalvarComoRascunho(
  editando: boolean,
  status: StatusPublicacao | null | undefined,
): boolean {
  return !editando || isRascunho(status)
}

/** Intenção "salvar como rascunho" → status a persistir. Mantém o literal no core. */
export function statusPublicacaoRascunho(): StatusPublicacao {
  return 'DRAFT'
}

/**
 * Lê a intenção "salvar como rascunho" em dados brutos (pré-validação Zod, nas
 * server actions de criar/editar produto). Mantém o literal 'DRAFT' só aqui.
 */
export function isIntencaoRascunho(rawStatusPublicacao: unknown): boolean {
  return rawStatusPublicacao === 'DRAFT'
}

/**
 * Decisão de negócio: transição de lifecycle ao editar/salvar um produto existente.
 * - Salvar como rascunho (intenção explícita) → DRAFT.
 * - INATIVO é preservado — editar não republica um produto inativado.
 * - Nos demais casos (rascunho em edição normal, já publicado, ou status
 *   desconhecido) → PUBLICADO, pois "Salvar" fora do rascunho é publicação implícita.
 * Retorna null quando o lifecycle atual (dual-write) não deve ser alterado.
 */
export function lifecycleAoEditarProduto(
  comoRascunho: boolean,
  statusAtual: StatusPublicacao | null,
): { status_publicacao: StatusPublicacao; ativo: boolean } | null {
  if (comoRascunho) return dualWriteFromStatus('DRAFT')
  if (statusAtual === 'INATIVO') return null
  return dualWriteFromStatus('PUBLICADO')
}
