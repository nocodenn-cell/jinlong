/**
 * "Vencido" (overdue) é sempre computado na leitura — nunca persistido por
 * nenhuma RPC/trigger/cron. Item 13 do Plano Mestre de Fechamento dos Gaps:
 * `contas_pagar.status` tem 'ATRASADO' como valor de CHECK válido mas
 * nenhum writer jamais grava esse valor; `contas_receber` não tem nem o
 * conceito no schema. Em vez de introduzir um job agendado para "envelhecer"
 * títulos, o vencimento é comparado a `hoje` no momento da leitura.
 *
 * `hoje` é injetado (não `new Date()` interno) para manter a função pura e
 * testável sem mockar relógio.
 */
// 'ATRASADO' entra aqui porque é um valor de CHECK legado em contas_pagar
// que nenhum writer grava mais (ver comentário do arquivo) — mas se algum
// dia existir uma linha nesse estado (SQL manual, dado legado), ela ainda
// deve contar como em aberto/vencida, não ser ignorada.
const STATUS_EM_ABERTO = new Set(['PENDENTE', 'PARCIAL', 'ABERTO', 'ATRASADO'])

export function isTituloVencido(
  vencimento: string | null,
  status: string,
  hojeYmd: string,
): boolean {
  if (!vencimento) return false
  if (!STATUS_EM_ABERTO.has(status.toUpperCase())) return false
  return vencimento.slice(0, 10) < hojeYmd
}

/** Fuso padrão da loja (mesmo valor de `RELATORIO_TZ_PADRAO` do app). */
export const FUSO_PADRAO_LOJA = 'America/Sao_Paulo'

/**
 * Dia civil (`YYYY-MM-DD`) de um instante no fuso da loja, para comparar com colunas `date`
 * (sem hora/fuso). NÃO usar `toISOString()`: em UTC, entre 21h e 24h de Brasília "hoje" já
 * viraria amanhã e um título que vence hoje apareceria como vencido.
 */
export function hojeYmd(d: Date = new Date(), timeZone: string = FUSO_PADRAO_LOJA): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
