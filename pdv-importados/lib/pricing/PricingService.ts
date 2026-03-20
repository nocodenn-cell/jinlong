// lib/pricing/PricingService.ts
// Motor de preço atacado — implementação com Strategy Pattern
// REGRA CRÍTICA: ao mudar quantidade, recalcular TODOS os itens do produto

export interface ItemCarrinho {
  id: string            // id único do item no carrinho (não o produto_id)
  produtoId: string
  nome: string
  quantidade: number
  precoVariejo: number  // preço base do produto
  categoriaId?: string
}

export interface ResultadoPreco {
  precoUnitario: number
  precoOriginal: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'
  regraAplicadaId?: string
}

export interface RegraPreco {
  id: string
  tipoRegra: 'PRODUTO' | 'CATEGORIA'
  produtoId?: string
  categoriaId?: string
  quantidadeMinima: number
  quantidadeMaxima?: number
  tipoDesconto: 'PERCENTUAL' | 'VALOR_FIXO'
  valorDesconto: number
  dataValidade?: string
  ativo: boolean
}

// ============================================================
// Strategies
// ============================================================

interface PriceStrategy {
  calcular(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number
  ): ResultadoPreco | null
}

class ProductWholesaleStrategy implements PriceStrategy {
  calcular(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number
  ): ResultadoPreco | null {
    const regrasDoP = regras
      .filter(
        (r) =>
          r.tipoRegra === 'PRODUTO' &&
          r.produtoId === item.produtoId &&
          r.ativo &&
          !isExpirada(r)
      )
      .sort((a, b) => b.quantidadeMinima - a.quantidadeMinima)

    const regra = regrasDoP.find(
      (r) =>
        quantidadeTotal >= r.quantidadeMinima &&
        (r.quantidadeMaxima === undefined || quantidadeTotal <= r.quantidadeMaxima)
    )

    if (!regra) return null
    return aplicarDesconto(item.precoVariejo, regra)
  }
}

class CategoryWholesaleStrategy implements PriceStrategy {
  calcular(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number
  ): ResultadoPreco | null {
    if (!item.categoriaId) return null

    const regrasCat = regras
      .filter(
        (r) =>
          r.tipoRegra === 'CATEGORIA' &&
          r.categoriaId === item.categoriaId &&
          r.ativo &&
          !isExpirada(r)
      )
      .sort((a, b) => b.quantidadeMinima - a.quantidadeMinima)

    const regra = regrasCat.find(
      (r) =>
        quantidadeTotal >= r.quantidadeMinima &&
        (r.quantidadeMaxima === undefined || quantidadeTotal <= r.quantidadeMaxima)
    )

    if (!regra) return null
    return aplicarDesconto(item.precoVariejo, regra)
  }
}

class DefaultPriceStrategy implements PriceStrategy {
  calcular(item: ItemCarrinho): ResultadoPreco {
    return {
      precoUnitario: item.precoVariejo,
      precoOriginal: item.precoVariejo,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    }
  }
}

// ============================================================
// PricingService — orquestra as strategies
// ============================================================

export class PricingService {
  private strategies: PriceStrategy[]

  constructor() {
    // Ordem importa: produto primeiro, depois categoria, depois default
    this.strategies = [
      new ProductWholesaleStrategy(),
      new CategoryWholesaleStrategy(),
      new DefaultPriceStrategy(),
    ]
  }

  /**
   * Calcula o preço de um item com base na quantidade total daquele
   * produto no carrinho (não apenas a quantidade deste item).
   *
   * IMPORTANTE: passar quantidadeTotal = soma de todos os itens do
   * mesmo produto no carrinho, não só a quantidade deste item.
   */
  calcularPreco(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number
  ): ResultadoPreco {
    for (const strategy of this.strategies) {
      const resultado = strategy.calcular(item, regras, quantidadeTotal)
      if (resultado !== null) return resultado
    }

    // Fallback seguro (DefaultPriceStrategy sempre retorna)
    return {
      precoUnitario: item.precoVariejo,
      precoOriginal: item.precoVariejo,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    }
  }

  /**
   * Recalcula TODOS os itens do carrinho.
   * Chamar sempre que quantidade de qualquer item mudar.
   *
   * Retorna novo array com preços atualizados.
   */
  recalcularCarrinho(
    carrinho: ItemCarrinho[],
    regras: RegraPreco[]
  ): Array<ItemCarrinho & { resultado: ResultadoPreco }> {
    // Agrupar quantidades por produto
    const quantidadesPorProduto = carrinho.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.produtoId] = (acc[item.produtoId] ?? 0) + item.quantidade
        return acc
      },
      {}
    )

    return carrinho.map((item) => ({
      ...item,
      resultado: this.calcularPreco(
        item,
        regras,
        quantidadesPorProduto[item.produtoId] ?? item.quantidade
      ),
    }))
  }
}

// ============================================================
// Utilitários
// ============================================================

function aplicarDesconto(precoBase: number, regra: RegraPreco): ResultadoPreco {
  let precoFinal: number

  if (regra.tipoDesconto === 'PERCENTUAL') {
    precoFinal = precoBase * (1 - regra.valorDesconto / 100)
  } else {
    precoFinal = Math.max(0, precoBase - regra.valorDesconto)
  }

  precoFinal = Math.round(precoFinal * 100) / 100

  return {
    precoUnitario: precoFinal,
    precoOriginal: precoBase,
    descontoUnitario: Math.round((precoBase - precoFinal) * 100) / 100,
    tipoPreco: 'ATACADO',
    regraAplicadaId: regra.id,
  }
}

function isExpirada(regra: RegraPreco): boolean {
  if (!regra.dataValidade) return false
  return new Date(regra.dataValidade) < new Date()
}

// Singleton para uso na aplicação
export const pricingService = new PricingService()