export type TituloResumoCliente = {
  valorAberto: number
  atrasado: boolean
  vencimento: string | null
}

export type ResumoTitulosCliente = {
  vencido: number
  comVencimento: number
  totalTitulos: number
}

/** Soma o que o leitor de contas a receber já marcou como atrasado. */
export function resumirTitulosCliente(titulos: TituloResumoCliente[]): ResumoTitulosCliente {
  let vencido = 0
  let comVencimento = 0
  for (const titulo of titulos) {
    if (titulo.vencimento) comVencimento += 1
    if (titulo.atrasado) vencido += titulo.valorAberto
  }
  return {
    vencido: arredondarCentavos(vencido),
    comVencimento,
    totalTitulos: titulos.length,
  }
}

/** Exibição: limite menos o saldo em aberto da view, nunca abaixo de zero. */
export function limiteDisponivel(limite: number, saldoAberto: number): number {
  return arredondarCentavos(Math.max(0, limite - saldoAberto))
}

function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100
}
