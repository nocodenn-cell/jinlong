/**
 * SYSTEM RULES — "Constitution File" do sistema.
 *
 * FONTE ÚNICA das regras centrais de negócio. É puro, estável e isolado:
 *  - NÃO importa React / UI
 *  - NÃO depende de DB / Supabase
 *  - NÃO tem efeito colateral
 *
 * Modelo de 3 camadas:
 *   CORE (decide) → SERVER (executa: actions/repositories) → UI (apresenta).
 * A UI nunca decide regra: só envia intenção. O CORE decide aqui.
 */

import type { StatusPublicacao } from '@/core/ports/produto'

export const SYSTEM_RULES = {
  product: {
    /** Cadastro manual (humano) no sistema administrativo → vendável na hora. */
    createdByHuman: {
      status: 'PUBLICADO',
      ativo: true,
    },
    /** Importação (CSV/NF-e) → rascunho até publicação explícita. */
    createdByImport: {
      status: 'DRAFT',
      ativo: false,
    },
  },

  pdv: {
    /** Um produto só é vendável no PDV se cumprir TODOS estes requisitos. */
    vendavel: {
      requires: {
        ativo: true,
        status_publicacao: 'PUBLICADO',
      },
    },
    /** Fluxo de venda canônico — ordem obrigatória. */
    flow: ['adicionar_item', 'validar_sku', 'calcular_total', 'finalizar_venda'],
  },

  forbidden: {
    businessLogicOutsideCore: true,
    duplicatedRules: true,
    uiBusinessLogic: true,
  },
} as const

export type ProdutoOrigem = 'human' | 'import'

/**
 * Decisão de status inicial de um produto — ÚNICO ponto que decide isto.
 * `criarProduto` (server) apenas executa o que o core decide aqui.
 */
export function statusInicialProduto(
  origem: ProdutoOrigem,
): { status_publicacao: StatusPublicacao; ativo: boolean } {
  const regra =
    origem === 'human' ? SYSTEM_RULES.product.createdByHuman : SYSTEM_RULES.product.createdByImport
  return { status_publicacao: regra.status, ativo: regra.ativo }
}
