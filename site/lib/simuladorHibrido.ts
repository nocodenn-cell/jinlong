/**
 * Simulador "Simples puro x Simples híbrido" (IBS/CBS por fora do DAS) — 2027.
 * Cálculo 100% no navegador; nada é enviado nem guardado. Estimativa educativa.
 *
 * Fontes (ver SIMULADOR_FONTES):
 *  - Anexo I (comércio) LC 123/2006: faixas, alíquotas nominais e parcelas a deduzir; alíquota efetiva
 *    = (RBT12 × nominal − dedução) / RBT12 (art. 18, § 1º-A).
 *  - Partilha CBS + IBS no Anexo I em 2027–2028: 15,33% + 0,17% = 15,50% (Anexo XVIII da LC 214/2025,
 *    conferido em fontes secundárias — PENDENTE de conferência no texto oficial).
 *  - Crédito do comprador quando o fornecedor recolhe no DAS: limitado ao devido no Simples
 *    (LC 214/2025, art. 47, § 9º, II).
 *  - Híbrido: IBS/CBS pelo regime regular (art. 41, § 3º), com crédito das compras (art. 47).
 *  - Alíquotas 2027: CBS = referência − 0,1 p.p. (art. 347), IBS 0,1% (art. 344). A referência da CBS
 *    ainda NÃO foi fixada (Senado até 15/12/2026): o valor é uma hipótese editável.
 */

export interface FaixaSimples {
  ate: number
  nominal: number
  deducao: number
}

/** Anexo I da LC 123/2006 (comércio). */
export const ANEXO_I: readonly FaixaSimples[] = [
  { ate: 180_000, nominal: 0.04, deducao: 0 },
  { ate: 360_000, nominal: 0.073, deducao: 5_940 },
  { ate: 720_000, nominal: 0.095, deducao: 13_860 },
  { ate: 1_800_000, nominal: 0.107, deducao: 22_500 },
  { ate: 3_600_000, nominal: 0.143, deducao: 87_300 },
  { ate: 4_800_000, nominal: 0.19, deducao: 378_000 },
]

/** Parcela de CBS + IBS dentro do DAS, Anexo I, 2027–2028 (pendente de conferência oficial). */
export const PARTILHA_IBS_CBS_ANEXO_I = 0.155

/** Hipótese de CBS 2027 (já com −0,1 p.p.), NÃO oficial; editável pelo usuário. */
export const CBS_2027_HIPOTESE = 0.088
/** IBS 2027: 0,05% estadual + 0,05% municipal (LC 214/2025, art. 344). */
export const IBS_2027 = 0.001

export const LIMITE_SIMPLES = 4_800_000

export interface EntradaSimulador {
  /** Faturamento médio mensal (R$). */
  faturamentoMensal: number
  /** Receita bruta dos últimos 12 meses (R$); se ausente, usa faturamento mensal × 12. */
  rbt12?: number
  /** Parcela das vendas para empresas que tomam crédito (0–1). */
  parcelaB2B: number
  /** Compras mensais com IBS/CBS destacados que dão crédito no híbrido (R$). */
  comprasComCredito: number
  /** Alíquota CBS 2027 (fração). */
  aliquotaCbs?: number
  /** Alíquota IBS 2027 (fração). */
  aliquotaIbs?: number
}

export interface ResultadoOpcao {
  das: number
  ibsCbsPorFora: number
  total: number
  creditoRepassado: number
}

export interface ResultadoSimulador {
  faixa: number
  aliquotaEfetiva: number
  puro: ResultadoOpcao
  hibrido: ResultadoOpcao
  /** hibrido.total − puro.total (positivo = híbrido custa mais para você). */
  custoExtraHibrido: number
  /** Crédito adicional que seus clientes B2B recebem no híbrido. */
  creditoExtraClientes: number
  /** Saldo credor de IBS/CBS que sobra para meses seguintes (compras > débitos). */
  saldoCredor: number
  recomendacao: 'puro' | 'hibrido' | 'avaliar' | 'fora'
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0))
const round2 = (v: number) => Math.round(v * 100) / 100

export function faixaAnexoI(rbt12: number): number {
  const i = ANEXO_I.findIndex((f) => rbt12 <= f.ate)
  return i === -1 ? -1 : i
}

export function aliquotaEfetivaAnexoI(rbt12: number): number {
  if (rbt12 <= 0) return ANEXO_I[0].nominal
  const i = faixaAnexoI(rbt12)
  if (i === -1) return NaN
  const f = ANEXO_I[i]
  return (rbt12 * f.nominal - f.deducao) / rbt12
}

export function simular(e: EntradaSimulador): ResultadoSimulador {
  const fat = Math.max(0, Number.isFinite(e.faturamentoMensal) ? e.faturamentoMensal : 0)
  const rbt12 = e.rbt12 && e.rbt12 > 0 ? e.rbt12 : fat * 12
  const b2b = clamp(e.parcelaB2B, 0, 1)
  const compras = Math.max(0, Number.isFinite(e.comprasComCredito) ? e.comprasComCredito : 0)
  const t = clamp(e.aliquotaCbs ?? CBS_2027_HIPOTESE, 0, 1) + clamp(e.aliquotaIbs ?? IBS_2027, 0, 1)

  const faixa = faixaAnexoI(rbt12)
  const vazio: ResultadoOpcao = { das: 0, ibsCbsPorFora: 0, total: 0, creditoRepassado: 0 }
  if (faixa === -1) {
    return { faixa, aliquotaEfetiva: NaN, puro: vazio, hibrido: vazio, custoExtraHibrido: 0, creditoExtraClientes: 0, saldoCredor: 0, recomendacao: 'fora' }
  }
  const ef = aliquotaEfetivaAnexoI(rbt12)

  const dasPuro = fat * ef
  const puro: ResultadoOpcao = {
    das: round2(dasPuro),
    ibsCbsPorFora: 0,
    total: round2(dasPuro),
    creditoRepassado: round2(fat * b2b * ef * PARTILHA_IBS_CBS_ANEXO_I),
  }

  const dasHib = fat * ef * (1 - PARTILHA_IBS_CBS_ANEXO_I)
  const debito = fat * t
  const credito = compras * t
  const porFora = Math.max(0, debito - credito)
  const hibrido: ResultadoOpcao = {
    das: round2(dasHib),
    ibsCbsPorFora: round2(porFora),
    total: round2(dasHib + porFora),
    creditoRepassado: round2(fat * b2b * t),
  }

  const custoExtraHibrido = round2(hibrido.total - puro.total)
  const creditoExtraClientes = round2(hibrido.creditoRepassado - puro.creditoRepassado)
  const saldoCredor = round2(Math.max(0, credito - debito))

  let recomendacao: ResultadoSimulador['recomendacao']
  if (custoExtraHibrido <= 0) recomendacao = 'hibrido'
  else if (b2b === 0 || creditoExtraClientes < custoExtraHibrido) recomendacao = 'puro'
  else recomendacao = 'avaliar'

  return { faixa, aliquotaEfetiva: ef, puro, hibrido, custoExtraHibrido, creditoExtraClientes, saldoCredor, recomendacao }
}

export interface FonteSimulador {
  id: string
  label: string
  url: string
  status: 'oficial' | 'secundaria' | 'hipotese'
}

export const SIMULADOR_FONTES: readonly FonteSimulador[] = [
  { id: 'prazo', label: 'Receita Federal — prazos 2027 (Res. CGSN nº 194/2026): opção até 30/10/2026, cancelamento 03/11 a 20/12/2026', url: 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade', status: 'oficial' },
  { id: 'manual', label: 'Receita Federal — Manual da opção pelo regime regular do IBS e da CBS no Simples Nacional', url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/Manual%20op%C3%A7%C3%A3o%20regime%20regular%20IBS%20e%20CBS%20no%20Simples%20Nacional.pdf', status: 'oficial' },
  { id: 'serpro', label: 'Serpro — opção feita em servicos.receitafederal.gov.br/servico/regime-ibs-cbs; janelas seguintes em março e setembro', url: 'https://www.serpro.gov.br/menu/noticias/noticias-2026/opcao-simples-hibrido', status: 'oficial' },
  { id: 'lc214', label: 'LC 214/2025 — arts. 41 § 3º (opção), 47 § 9º II (crédito limitado ao DAS), 344 (IBS 0,1%), 347 (CBS − 0,1 p.p.)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm', status: 'oficial' },
  { id: 'lc123', label: 'LC 123/2006 — Anexo I (comércio) e fórmula da alíquota efetiva (art. 18, § 1º-A)', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm', status: 'oficial' },
  { id: 'partilha', label: 'Partilha CBS 15,33% + IBS 0,17% no Anexo I em 2027–2028 (Anexo XVIII da LC 214/2025) — conferida em fonte secundária, confirmar no texto oficial', url: 'https://hopecont.com/calculadora-credito-ibs-cbs-simples/', status: 'secundaria' },
  { id: 'cbs', label: 'Alíquota de referência da CBS 2027: ainda não fixada (Senado até 15/12/2026, cronograma TCU). 8,8% é só hipótese editável', url: 'https://sites.tcu.gov.br/recursos/reforma-tributaria/Painel%20da%20Reforma%20Tribut%C3%A1ria_Cronograma_v5.pdf', status: 'hipotese' },
]
