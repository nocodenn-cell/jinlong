import { caixaFmt, type CaixaMessages } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"

/**
 * Valor de cada parcela do crédito, sem juros nem taxas (o sistema não tem regra de juros).
 * Mesma regra do financeiro (`CONFIGURAR_RECEBIVEL`): `trunc(bruto/n, 2)` nas n-1 primeiras
 * e a última fecha o total — a soma bate exatamente com `total`.
 */
export function valoresParcelasCredito(
  total: number,
  n: number,
): { parcela: number; ultima: number } {
  const centavos = Number.isFinite(total) ? Math.max(0, Math.round(total * 100)) : 0
  const qtd = Math.max(1, Math.trunc(n) || 1)
  const parcela = Math.floor(centavos / qtd)
  const ultima = centavos - parcela * (qtd - 1)
  return { parcela: parcela / 100, ultima: ultima / 100 }
}

/** Rótulo de uma opção do seletor: "1x — À vista", "3x de R$ 33,33 (última R$ 33,34)". */
export function rotuloOpcaoParcelasCredito(
  n: number,
  total: number,
  c: Pick<
    CaixaMessages,
    | "pdv_pgto_a_vista"
    | "pdv_pgto_parcelas_n"
    | "pdv_pgto_parcelas_n_ultima"
    | "pdv_pgto_parcelas_n_sem_valor"
  >,
  moedaPrefixo: string,
): string {
  if (n <= 1) return c.pdv_pgto_a_vista
  const { parcela, ultima } = valoresParcelasCredito(total, n)
  if (parcela <= 0) return caixaFmt(c.pdv_pgto_parcelas_n_sem_valor, { n })
  const valor = `${moedaPrefixo} ${formatDecimalBRL(parcela)}`
  if (ultima === parcela) return caixaFmt(c.pdv_pgto_parcelas_n, { n, valor })
  return caixaFmt(c.pdv_pgto_parcelas_n_ultima, {
    n,
    valor,
    ultima: `${moedaPrefixo} ${formatDecimalBRL(ultima)}`,
  })
}
