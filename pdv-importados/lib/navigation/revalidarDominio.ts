/**
 * Autoridade única de invalidação de cache — por EVENTO DE DOMÍNIO.
 *
 * Antes: cada server action escolhia à mão quais caminhos revalidar. O resultado
 * eram 53 chamadas para rotas `/gerente/*` que hoje são só redirect (no-op), e
 * várias telas canônicas `/admin/*` que ninguém revalidava — sangria não
 * atualizava `/admin/vendas`, recebimento não atualizava `/admin/estoque`, e por aí.
 *
 * Regra: a action declara **o que aconteceu no negócio**, não **qual tela mexer**.
 * O mapa evento → telas mora aqui e só aqui. Tela nova ou rota renomeada se
 * resolve num lugar, não em 20 actions.
 *
 * Não use `revalidatePath` direto em server action — use `revalidarDominio`.
 * Guarda: `scripts/check-revalidate-boundary.mjs`.
 */

import { revalidatePath } from 'next/cache'
import { ROUTES } from '@shared-core/navigation/routes'

const T = {
  caixa: ROUTES.caixa.home,
  dashboard: ROUTES.admin.dashboard,
  catalogo: ROUTES.admin.catalogo,
  estoque: ROUTES.admin.estoque,
  recebimento: ROUTES.admin.estoqueRecebimento,
  transferencias: ROUTES.admin.estoqueTransferencias,
  compras: ROUTES.admin.compras,
  vendas: ROUTES.admin.vendas,
  financeiro: ROUTES.admin.financeiro,
  comissoes: ROUTES.admin.comissoes,
  clientes: ROUTES.admin.clientes,
  fornecedores: ROUTES.admin.fornecedores,
  funcionarios: ROUTES.admin.funcionarios,
  configuracoes: ROUTES.admin.configuracoes,
  suspensao: ROUTES.admin.suspensao,
  categoriasProdutos: ROUTES.admin.categoriasProdutos,
  categoriasFinanceiras: ROUTES.admin.categoriasFinanceiras,
  marcasProdutos: ROUTES.admin.marcasProdutos,
  auditoria: ROUTES.admin.auditoria,
  relatorios: ROUTES.admin.relatorios,
} as const

/**
 * Eventos de domínio → telas que leem o que o evento mudou.
 *
 * Nome do evento = fato consumado no negócio (`venda.finalizada`), nunca a ação
 * técnica (`insertVenda`). Um evento pode tocar várias telas; uma tela pode
 * aparecer em vários eventos.
 */
export const TELAS_POR_EVENTO = {
  // ─── Catálogo ───────────────────────────────────────────────────────────
  'produto.alterado': [T.catalogo, T.estoque, T.dashboard],
  'categoria.alterada': [T.categoriasProdutos, T.catalogo],
  'marca.alterada': [T.marcasProdutos, T.catalogo],
  'preco.alterado': [T.catalogo, T.caixa],

  // ─── Estoque ────────────────────────────────────────────────────────────
  'estoque.ajustado': [T.estoque, T.catalogo, T.dashboard],
  'estoque.recebido': [T.recebimento, T.estoque, T.catalogo, T.compras, T.financeiro],
  'estoque.transferido': [T.transferencias, T.estoque],

  // ─── Compras ────────────────────────────────────────────────────────────
  'compra.alterada': [T.compras],

  // ─── Vendas ─────────────────────────────────────────────────────────────
  'venda.finalizada': [T.caixa, T.vendas, T.estoque, T.financeiro, T.dashboard],
  'venda.cancelada': [T.caixa, T.vendas, T.estoque, T.financeiro, T.auditoria, T.dashboard],
  'venda.devolvida': [T.caixa, T.vendas, T.estoque, T.financeiro, T.dashboard],

  // ─── Caixa ──────────────────────────────────────────────────────────────
  'caixa.turno.alterado': [T.caixa, T.vendas, T.dashboard],
  'caixa.movimentacao.alterada': [T.caixa, T.vendas],

  // ─── Financeiro / Fiscal ────────────────────────────────────────────────
  'financeiro.titulo.alterado': [T.financeiro, T.dashboard],
  'categoria.financeira.alterada': [T.categoriasFinanceiras, T.financeiro],
  'fiscal.documento.alterado': [T.financeiro],
  'comissao.alterada': [T.comissoes],

  // ─── Cadastros ──────────────────────────────────────────────────────────
  'cliente.alterado': [T.clientes],
  'fornecedor.alterado': [T.fornecedores, T.compras],
  'funcionario.alterado': [T.funcionarios, T.comissoes],

  // ─── Configuração ───────────────────────────────────────────────────────
  'configuracao.alterada': [T.configuracoes, T.caixa],
  'suspensao.alterada': [T.suspensao, T.caixa],
  'relatorio.invalidado': [T.relatorios, T.dashboard],
} as const satisfies Record<string, readonly string[]>

export type EventoDominio = keyof typeof TELAS_POR_EVENTO

export type RevalidarDominioOpts = {
  /**
   * Caminhos dinâmicos (`/admin/financeiro/documento/<id>`) que não cabem num
   * mapa estático. Só para rotas com parâmetro.
   */
  extras?: readonly string[]
  /**
   * `'layout'` derruba também os segmentos aninhados. Use quando o evento muda
   * dados lidos por um layout (ex.: contadores da fila fiscal no chrome da aba).
   */
  escopo?: 'page' | 'layout'
}

/** Revalida as telas afetadas por um ou mais eventos de domínio. */
export function revalidarDominio(
  eventos: EventoDominio | readonly EventoDominio[],
  opts?: RevalidarDominioOpts,
): void {
  const lista = typeof eventos === 'string' ? [eventos] : eventos
  const alvos = new Set<string>()
  for (const evento of lista) {
    for (const tela of TELAS_POR_EVENTO[evento]) alvos.add(tela)
  }
  for (const extra of opts?.extras ?? []) {
    if (extra?.trim()) alvos.add(extra.trim())
  }
  for (const alvo of alvos) {
    if (opts?.escopo === 'layout') revalidatePath(alvo, 'layout')
    else revalidatePath(alvo)
  }
}

/**
 * Variante para quando o chrome inteiro precisa cair (troca de idioma, dados da
 * loja no cabeçalho). Raro — prefira `revalidarDominio`.
 */
export function revalidarLayoutAdmin(): void {
  revalidatePath('/admin', 'layout')
}
