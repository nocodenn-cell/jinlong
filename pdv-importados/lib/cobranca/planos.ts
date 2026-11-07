import { ROUTES } from '@/lib/navigation/routes'

/**
 * Planos e recursos (sprint cobrança). Fonte de verdade de PREÇO é a tabela `public.planos`
 * (editável sem deploy). Os valores abaixo são só fallback/documentação e são PLACEHOLDER:
 * o dono do produto define os preços reais antes de vender.
 */
export type CodigoPlano = 'BASICO' | 'ATACADO' | 'REDE'
export type CodigoAddon = 'FISCAL'
export type Recurso =
  | 'pdv' | 'estoque' | 'caixa'
  | 'faixas_preco' | 'financeiro' | 'comissoes'
  | 'multi_loja' | 'transferencias' | 'painel_dono'
  | 'fiscal'

export type PlanoCatalogo = {
  codigo: CodigoPlano | CodigoAddon
  nome: string
  tipo: 'PLANO' | 'ADDON'
  recursos: Recurso[]
  preco_loja_centavos: number
  preco_caixa_adicional_centavos: number
  caixas_inclusos_por_loja: number
  max_lojas: number | null
  preco_placeholder: boolean
}

const BASE: Recurso[] = ['pdv', 'estoque', 'caixa']
const ATACADO: Recurso[] = [...BASE, 'faixas_preco', 'financeiro', 'comissoes']

/** PLACEHOLDER — espelha o seed da migration 20261020100000. */
export const PLANOS_FALLBACK: PlanoCatalogo[] = [
  { codigo: 'BASICO', nome: 'Básico', tipo: 'PLANO', recursos: BASE, preco_loja_centavos: 9900, preco_caixa_adicional_centavos: 3900, caixas_inclusos_por_loja: 1, max_lojas: 1, preco_placeholder: true },
  { codigo: 'ATACADO', nome: 'Atacado', tipo: 'PLANO', recursos: ATACADO, preco_loja_centavos: 17900, preco_caixa_adicional_centavos: 3900, caixas_inclusos_por_loja: 1, max_lojas: 1, preco_placeholder: true },
  { codigo: 'REDE', nome: 'Rede', tipo: 'PLANO', recursos: [...ATACADO, 'multi_loja', 'transferencias', 'painel_dono'], preco_loja_centavos: 24900, preco_caixa_adicional_centavos: 3900, caixas_inclusos_por_loja: 1, max_lojas: null, preco_placeholder: true },
  { codigo: 'FISCAL', nome: 'Fiscal (NFC-e/NF-e)', tipo: 'ADDON', recursos: ['fiscal'], preco_loja_centavos: 5900, preco_caixa_adicional_centavos: 0, caixas_inclusos_por_loja: 0, max_lojas: null, preco_placeholder: true },
]

export type CalculoMensal = { totalCentavos: number; linhas: { descricao: string; centavos: number }[] }

/** Valor mensal = (preço por loja × lojas) + (caixas além dos inclusos × preço por caixa) + add-ons por loja. */
export function calcularValorMensal(
  catalogo: PlanoCatalogo[],
  plano: string,
  addons: string[],
  qtdLojas: number,
  qtdCaixas: number,
): CalculoMensal {
  const p = catalogo.find((x) => x.codigo === plano && x.tipo === 'PLANO')
  if (!p) throw new Error('PLANO_INVALIDO')
  const lojas = Math.max(1, Math.floor(qtdLojas))
  const caixas = Math.max(lojas, Math.floor(qtdCaixas))
  if (p.max_lojas !== null && lojas > p.max_lojas) throw new Error('PLANO_LIMITE_LOJAS')
  const linhas = [{ descricao: `${p.nome} × ${lojas} loja(s)`, centavos: p.preco_loja_centavos * lojas }]
  const extras = Math.max(0, caixas - p.caixas_inclusos_por_loja * lojas)
  if (extras > 0) linhas.push({ descricao: `${extras} caixa(s) adicional(is)`, centavos: extras * p.preco_caixa_adicional_centavos })
  for (const a of new Set(addons)) {
    const ad = catalogo.find((x) => x.codigo === a && x.tipo === 'ADDON')
    if (!ad) throw new Error('ADDON_INVALIDO')
    linhas.push({ descricao: `${ad.nome} × ${lojas} loja(s)`, centavos: ad.preco_loja_centavos * lojas })
  }
  return { totalCentavos: linhas.reduce((s, l) => s + l.centavos, 0), linhas }
}

/** `recursos === null` ⇒ empresa sem assinatura (cliente 1/legado) ⇒ tudo liberado. */
export function temRecurso(recursos: string[] | null | undefined, r: Recurso): boolean {
  if (recursos === null || recursos === undefined) return true
  return recursos.includes(r)
}

/** Prefixos de rota do painel que exigem um recurso do plano (gating web). */
export const ROTAS_POR_RECURSO: { prefixo: string; recurso: Recurso }[] = [
  { prefixo: ROUTES.admin.financeiro, recurso: 'financeiro' },
  { prefixo: ROUTES.admin.comissoes, recurso: 'comissoes' },
  { prefixo: ROUTES.admin.estoqueTransferencias, recurso: 'transferencias' },
]

/** Recurso exigido por um caminho, ou null se o caminho é livre em qualquer plano. */
export function recursoDaRota(pathname: string): Recurso | null {
  const hit = ROTAS_POR_RECURSO.find((x) => pathname === x.prefixo || pathname.startsWith(`${x.prefixo}/`))
  return hit?.recurso ?? null
}

export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
