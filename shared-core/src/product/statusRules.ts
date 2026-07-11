/**
 * Regras de negócio centralizadas para status de publicação de produtos.
 * Este arquivo é o único lugar onde a lógica de status_publicacao é decidida.
 * UI deve delegar para estas funções (arquitetura de "deixe a UI só apresentar").
 *
 * NOTA: StatusPublicacao é definido UMA ÚNICA VEZ em shared-core/src/engine/productEngine.ts
 * (fonte canônica). Importamos de lá para evitar duplicação e conflitos de tipo.
 */

import type { StatusPublicacao } from '../engine/productEngine'

/**
 * Determina se um produto pode ser salvo como rascunho.
 * Regra: Sempre permitido em criação; em edição, só se estiver em DRAFT.
 */
export function podeSalvarComoRascunho(
  editando: boolean,
  statusPublicacao?: StatusPublicacao,
): boolean {
  if (!editando) return true // Nova criação sempre permite rascunho
  return statusPublicacao === 'DRAFT' // Edição só permite se já é rascunho
}

/**
 * Determina o rótulo do status para exibição.
 * Regra: DRAFT → "Rascunho", PUBLICADO → "Publicado"
 */
export function getRotuloStatus(status: StatusPublicacao): string {
  return status === 'DRAFT' ? 'Rascunho' : 'Publicado'
}

/**
 * Determina se um produto pode ser editado em modo completo.
 * Regra: Edição completa não permitida se produto já foi publicado.
 */
export function podeEditarModoCompleto(
  editando: boolean,
  statusPublicacao?: StatusPublicacao,
): boolean {
  if (!editando) return true // Nova criação permite modo completo
  return statusPublicacao === 'DRAFT' // Edição só permite modo completo se é rascunho
}

/**
 * Determina o texto do botão de publicação baseado no status.
 * Regra: DRAFT → "Publicar", PUBLICADO → "Atualizar e publicar"
 */
export function getTextoAcaoPublicacao(
  statusPublicacao: StatusPublicacao,
  msgCriado?: string,
  msgPublicado?: string,
): string {
  if (statusPublicacao === 'DRAFT') {
    return msgCriado || 'Publicar'
  }
  return msgPublicado || 'Atualizar e publicar'
}

/**
 * Determina o texto do botão salvar para edição.
 * Regra: Se em DRAFT, pode publicar; se PUBLICADO, apenas edita
 */
export function getTextoSalvarEdicao(
  editando: boolean,
  statusPublicacao?: StatusPublicacao,
  msgPublicar?: string,
  msgEditar?: string,
): string {
  if (!editando) return msgPublicar || 'Publicar no PDV'
  if (statusPublicacao !== 'DRAFT') return msgEditar || 'Editar'
  return msgPublicar || 'Publicar no PDV'
}
