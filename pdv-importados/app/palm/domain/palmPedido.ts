import type { ItemCarrinhoComPreco } from '@/stores/carrinhoStore'

export type ItemEntrada = {
  produto_id?: string
  produtoId?: string
  quantidade: number
}

export type ItemAssumido = {
  produto_id: string
  quantidade: number
  nome?: string | null
  codigo?: string | null
  descricao?: string | null
  imagem?: string | null
  preco_unitario: number | string
  tipo?: string | null
  quantidade_minima?: number | string | null
}

const CHAVE_REQUEST = 'jinlong-palm-request-id'

export function canonItens(itens: ItemEntrada[]): { produtoId: string; quantidade: number }[] {
  const mapa = new Map<string, number>()
  for (const item of itens) {
    const id = item.produto_id ?? item.produtoId ?? ''
    if (!id) continue
    mapa.set(id, (mapa.get(id) ?? 0) + item.quantidade)
  }
  return [...mapa.entries()]
    .map(([produtoId, quantidade]) => ({ produtoId, quantidade }))
    .sort((a, b) => a.produtoId.localeCompare(b.produtoId))
}

/** O servidor ignora preço. O payload leva só produto e quantidade. */
export function payloadEnvio(linhas: { produtoId: string; quantidade: number }[]) {
  return linhas.map((linha) => ({ produto_id: linha.produtoId, quantidade: linha.quantidade }))
}

export function estoqueSuficiente(quantidade: number, disponivel: number | null): boolean {
  if (disponivel == null || quantidade < 1) return false
  return quantidade <= disponivel
}

export function baixoEstoque(atual: number | null, minimo: number | null): boolean {
  if (atual == null) return true
  if (minimo == null || minimo <= 0) return atual <= 0
  return atual <= minimo
}

export function totalPedido(linhas: { quantidade: number; precoUnitario: number }[]): number {
  const centavos = linhas.reduce(
    (acc, linha) => acc + Math.round(linha.precoUnitario * 100) * linha.quantidade,
    0,
  )
  return centavos / 100
}

export function mapAssumidoParaCarrinho(itens: ItemAssumido[]): ItemCarrinhoComPreco[] {
  return itens.map((item) => linhaCarrinho(item))
}

export function requestIdDe(
  storage: { getItem: (chave: string) => string | null; setItem: (chave: string, valor: string) => void },
  criar: () => string,
): string {
  const atual = storage.getItem(CHAVE_REQUEST)
  if (atual) return atual
  const id = criar()
  storage.setItem(CHAVE_REQUEST, id)
  return id
}

export function limparRequestId(storage: { removeItem: (chave: string) => void }): void {
  storage.removeItem(CHAVE_REQUEST)
}

function linhaCarrinho(item: ItemAssumido): ItemCarrinhoComPreco {
  const tipo = item.tipo === 'ATACADO' ? 'ATACADO' : 'VAREJO'
  const preco = Number(item.preco_unitario)
  const minima = numeroOuNulo(item.quantidade_minima)
  return {
    id: item.produto_id,
    produtoId: item.produto_id,
    quantidade: item.quantidade,
    nome: item.nome ?? '',
    sku: item.codigo ?? undefined,
    descricao: item.descricao ?? undefined,
    imagem: item.imagem ?? undefined,
    precoUnitario: preco,
    precoOriginal: preco,
    resultado: {
      precoUnitario: preco,
      precoOriginal: preco,
      descontoUnitario: 0,
      tipoPreco: tipo,
      quantidadeMinima: tipo === 'ATACADO' ? minima : null,
    },
  }
}

function numeroOuNulo(valor: number | string | null | undefined): number | null {
  if (valor == null) return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}
