import { describe, expect, it } from 'vitest'
import { evaluateProduct } from '@shared-core/src/engine/productEngine'
import { STATUS_PUBLICACAO_BADGE } from './statusPublicacaoBadge'
import type { StatusPublicacao } from '@/core/ports/produto'

/**
 * Fase 1 — visibilidade de rascunho na tela gerente/produtos.
 *
 * Bug corrigido: o badge de status era dirigido por `p.ativo` (booleano), então
 * um produto DRAFT (ativo=false, nunca publicado) aparecia como "Inativo",
 * indistinguível de um produto inativado de propósito. Isto escondia do gerente
 * o motivo real de o produto não estar vendável no PDV.
 *
 * Estes testes travam a equivalência entre o badge exibido e a verdade de
 * vendabilidade do productEngine (fonte única): só PUBLICADO é vendável, e cada
 * status tem um badge distinto.
 */
describe('STATUS_PUBLICACAO_BADGE — divergência 0% vs productEngine', () => {
  const statuses: StatusPublicacao[] = ['DRAFT', 'PUBLICADO', 'INATIVO']

  it('todo status conhecido tem um badge mapeado', () => {
    for (const s of statuses) {
      expect(STATUS_PUBLICACAO_BADGE[s]).toBeDefined()
    }
  })

  it('DRAFT não é mais colapsado no badge de INATIVO', () => {
    expect(STATUS_PUBLICACAO_BADGE.DRAFT.key).not.toBe(STATUS_PUBLICACAO_BADGE.INATIVO.key)
    expect(STATUS_PUBLICACAO_BADGE.DRAFT.labelKey).toBe('rascunho')
  })

  it('badge "vendável/ativo" aparece somente quando o productEngine considera vendável', () => {
    for (const s of statuses) {
      const vendavel = evaluateProduct({ ativo: s === 'PUBLICADO', status_publicacao: s }).vendavel
      const badgeAtivo = STATUS_PUBLICACAO_BADGE[s].key === 'ATIVO'
      expect(badgeAtivo).toBe(vendavel)
    }
  })
})
