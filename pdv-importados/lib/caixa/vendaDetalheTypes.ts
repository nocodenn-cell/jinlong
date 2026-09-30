/**
 * Tipos do detalhe de venda (admin) — fora de `app/` para que `lib/` não dependa de actions.
 * `app/admin/vendas/actions.ts` re-exporta.
 */
export type VendaItemDetalhe = Readonly<{
  id: string
  nome: string
  codigo_barras: string | null
  quantidade: number
  quantidade_devolvida: number
  preco_unitario: number
  preco_unitario_original: number
  desconto_unitario: number
  subtotal: number
  tipo_preco: string | null
  tipo_preco_fonte: string | null
  custo_unitario_snap: number | null
  regra_aplicada_id: string | null
}>

export type VendaDetalhe = Readonly<{
  id: string
  data: string | null
  total_bruto: number
  total_desconto: number
  total_liquido: number
  forma_pagamento: string | null
  tipo_venda: string | null
  status: string | null
  numero_nf: string | null
  operador_nome: string | null
  cliente_nome: string | null
  tem_conta_receber: boolean
  valor_aberto_cr: number
  /** Pagamentos por forma (split). Vazio em vendas legadas sem `vendas_pagamentos`. */
  pagamentos: Readonly<{ forma_pagamento: string; valor: number }>[]
  /** Desconto do gerente (`descontos_venda`); 0 quando não houve. Já incluído em `total_desconto`. */
  desconto_gerente_valor: number
  desconto_gerente_percentual: number
  itens: VendaItemDetalhe[]
  showMargemVisual: boolean
  showPrecoFonte: boolean
}>
