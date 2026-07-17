import type { KitComposicaoRepositoryPort } from '@/core/ports/kitComposicao'

/**
 * Fase 5, Entrega 8b — Kits: serviço de domínio que traduz a venda de N
 * unidades de um produto KIT em movimentos de estoque dos componentes reais.
 *
 * Fronteira de domínio deliberada: Vendas, recibo, financeiro e auditoria
 * continuam enxergando o kit como **um único item vendido** (1 linha, 1
 * preço, 1 produto_id). Só o domínio de Estoque, através deste serviço,
 * enxerga os componentes — nenhuma outra parte do sistema deve expandir
 * kits por conta própria (evita duplicar a regra de expansão em múltiplos
 * lugares, o mesmo problema que motivou extrair `autorizar_operacao_
 * privilegiada` como SSoT de autorização nesta mesma fase).
 *
 * NÃO integrado ao fluxo de finalização (v4) ainda. `finalizar_venda_
 * transacional_canonica_v4` está congelada e baixa estoque 1:1 pelo
 * produto_id de cada linha de `p_itens` — plugar este serviço ali exige
 * decidir COMO a baixa dos componentes entra nessa mesma transação sem
 * quebrar o freeze nem os relatórios que leem `itens_venda` (margem, curva
 * ABC, kardex) assumindo 1 linha = 1 produto real vendido. Essa integração
 * fica para uma entrega futura, com ambiente adequado para validar contra
 * um banco real — errar aqui corrompe estoque/kardex em produção.
 *
 * Quando integrado, o caller deve:
 *   1. Chamar `expandirVendaDeKit` ANTES de finalizar a venda.
 *   2. Persistir cada movimento retornado em `venda_kit_expansao`
 *      (snapshot imutável, uma linha por componente, referenciando
 *      `composicaoId` — não a composição "atual" do kit, que pode mudar
 *      depois) associado ao `item_venda_id` real da linha do kit.
 *   3. Decrementar o estoque dos componentes pelos movimentos retornados
 *      — nunca o do próprio produto_id do kit (kits não têm linha de
 *      estoque própria).
 * Isso garante que devoluções/auditorias futuras leiam sempre
 * `venda_kit_expansao` (o que foi vendido de fato), nunca
 * `kit_composicoes` (a composição atual, que pode já ter mudado).
 */

export type MovimentoEstoqueComponente = {
  produtoId: string
  quantidade: number
}

export type ExpansaoKitResultado =
  | {
      ok: true
      kitProdutoId: string
      composicaoId: string
      versao: number
      movimentos: MovimentoEstoqueComponente[]
    }
  | { ok: false; error: string }

function roundQuantidade(n: number): number {
  return Math.round(n * 1000) / 1000
}

export class InventoryExpansionService {
  constructor(private readonly kitComposicaoRepository: KitComposicaoRepositoryPort) {}

  async expandirVendaDeKit(
    kitProdutoId: string,
    quantidadeVendida: number,
  ): Promise<ExpansaoKitResultado> {
    if (!kitProdutoId) {
      return { ok: false, error: 'Kit inválido.' }
    }
    if (!Number.isFinite(quantidadeVendida) || quantidadeVendida <= 0) {
      return { ok: false, error: 'Quantidade vendida do kit deve ser maior que zero.' }
    }

    const composicao = await this.kitComposicaoRepository.obterComposicaoAtual(kitProdutoId)
    if (!composicao) {
      return { ok: false, error: 'Produto não é um kit ou não tem composição ativa.' }
    }
    if (composicao.componentes.length === 0) {
      return { ok: false, error: 'Kit sem componentes cadastrados.' }
    }

    const movimentos: MovimentoEstoqueComponente[] = composicao.componentes.map((c) => ({
      produtoId: c.produtoId,
      quantidade: roundQuantidade(c.quantidade * quantidadeVendida),
    }))

    return {
      ok: true,
      kitProdutoId,
      composicaoId: composicao.composicaoId,
      versao: composicao.versao,
      movimentos,
    }
  }
}
