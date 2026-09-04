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

/** `hoje` em `YYYY-MM-DD`, para comparar com colunas `date` (sem hora/fuso). */
export function hojeYmd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}
