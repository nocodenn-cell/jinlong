/**
 * Situação operacional de um título (AP ou AR) — computada, nunca persistida.
 *
 * `contas_pagar.status` / `contas_receber.status` guardam o estado **contábil**
 * do título (PENDENTE/PARCIAL/PAGO/CANCELADO). Isso é correto no banco e
 * insuficiente na tela: um título PENDENTE que venceu ontem e um que vence em
 * 30 dias exigem ações diferentes hoje, e aparecem idênticos.
 *
 * O Bling resolve isso exibindo seis situações derivadas de **saldo × vencimento**
 * (Em aberto · Vencendo hoje · Atrasada · Paga · Paga parcialmente mas em dia ·
 * Paga parcialmente porém atrasada). Este módulo reproduz exatamente essas seis,
 * mais CANCELADO, que o Jinlong tem e o Bling trata como exclusão.
 *
 * Regras preservadas:
 * - Nada aqui é gravado. Segue a mesma decisão de `isTituloVencido` (item 13 do
 *   Plano Mestre): sem job de "envelhecimento", sem writer gravando 'ATRASADO'.
 * - `hoje` é injetado para manter a função pura e testável sem mockar relógio.
 * - O status do banco é a autoridade para os estados terminais (CANCELADO/PAGO);
 *   o saldo e o vencimento só resolvem a granularidade dentro do "em aberto".
 */

export type SituacaoTitulo =
  | 'CANCELADO'
  | 'QUITADO'
  | 'ATRASADO'
  | 'VENCE_HOJE'
  | 'EM_ABERTO'
  | 'PARCIAL_ATRASADO'
  | 'PARCIAL_EM_DIA'

/** Tolerância de comparação monetária (meio centavo) — `numeric` chega como float. */
const EPSILON = 0.005

const STATUS_CANCELADO = new Set(['CANCELADO', 'CANCELADA'])
const STATUS_QUITADO = new Set(['PAGO', 'PAGA', 'QUITADO', 'QUITADA'])

export type SituacaoTituloInput = {
  valorTotal: number
  /** Quanto já foi pago/liquidado. Em AR, `valor_total - valor_aberto`. */
  valorPago: number
  vencimento: string | null
  /** Status persistido (`contas_pagar.status` / `contas_receber.status`). */
  status: string
  /** Data de referência em `YYYY-MM-DD`. */
  hoje: string
}

/** Saldo em aberto do título. Nunca negativo — pagar a mais não vira crédito aqui. */
export function saldoTitulo(valorTotal: number, valorPago: number): number {
  const saldo = (Number(valorTotal) || 0) - (Number(valorPago) || 0)
  return saldo > EPSILON ? saldo : 0
}

export function situacaoTitulo(input: SituacaoTituloInput): SituacaoTitulo {
  const status = String(input.status ?? '').toUpperCase()
  if (STATUS_CANCELADO.has(status)) return 'CANCELADO'
  if (STATUS_QUITADO.has(status)) return 'QUITADO'

  const saldo = saldoTitulo(input.valorTotal, input.valorPago)
  // Defensivo: saldo zerado com status em aberto seria contradição de writer.
  // Ainda assim não se mostra "em aberto" ao operador para um título sem saldo —
  // pendência de R$ 0,00 é pior que uma quitação exibida um passo antes do status.
  if (saldo === 0) return 'QUITADO'

  const parcial = (Number(input.valorPago) || 0) > EPSILON
  const venc = input.vencimento
  if (!venc) return parcial ? 'PARCIAL_EM_DIA' : 'EM_ABERTO'

  // Datas puras `YYYY-MM-DD` comparam lexicograficamente. Comparar como Date
  // reintroduziria o bug de fuso já corrigido (`new Date('YYYY-MM-DD')` é UTC).
  const dia = venc.slice(0, 10)
  if (dia < input.hoje) return parcial ? 'PARCIAL_ATRASADO' : 'ATRASADO'
  if (parcial) return 'PARCIAL_EM_DIA'
  return dia === input.hoje ? 'VENCE_HOJE' : 'EM_ABERTO'
}

/** Situações que ainda pedem ação do operador — base de KPI e de filtro padrão. */
export function situacaoEmAberto(s: SituacaoTitulo): boolean {
  return s !== 'QUITADO' && s !== 'CANCELADO'
}

/** Situações que já passaram do prazo — destaque visual e KPI de atraso. */
export function situacaoAtrasada(s: SituacaoTitulo): boolean {
  return s === 'ATRASADO' || s === 'PARCIAL_ATRASADO'
}
