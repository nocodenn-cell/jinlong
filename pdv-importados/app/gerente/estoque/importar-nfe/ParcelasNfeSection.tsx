'use client'

import { formatBRL } from '@/lib/format/money'

/** Forma mínima de uma parcela — serve tanto ao XML recém-lido quanto ao staged. */
export type ParcelaExibivel = Readonly<{
  numero: string | null
  data_vencimento: string
  valor: number
}>

export type ParcelasLabels = Readonly<{
  titulo: string
  hint: string
  colNumero: string
  colVencimento: string
  colValor: string
  total: string
  vazio: string
}>

type Props = Readonly<{
  parcelas: readonly ParcelaExibivel[]
  labels: ParcelasLabels
  locale: string
}>

export function somaParcelas(parcelas: readonly ParcelaExibivel[]): number {
  return parcelas.reduce((acc, p) => acc + p.valor, 0)
}

function formatarVencimento(iso: string, locale: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (!ano || !mes || !dia) return iso
  return new Date(ano, mes - 1, dia).toLocaleDateString(locale)
}

/**
 * Parcelas (duplicatas) declaradas na NF-e.
 *
 * Já eram lidas do XML e gravadas, mas nenhuma tela as mostrava: o operador
 * confirmava a entrada — que gera as contas a pagar — sem ver quanto nem
 * quando ia pagar. No Bling essa informação está no próprio formulário.
 */
export function ParcelasNfeSection({ parcelas, labels, locale }: Props) {
  if (parcelas.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3">
        <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">
          {labels.titulo}
        </p>
        <p className="mt-1.5 text-body text-fg-muted">{labels.vazio}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">
        {labels.titulo}
      </p>
      <p className="mt-1 text-caption text-fg-subtle">{labels.hint}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="py-1 pr-2">{labels.colNumero}</th>
              <th className="py-1 pr-2">{labels.colVencimento}</th>
              <th className="py-1 pr-2 text-right">{labels.colValor}</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((parcela, idx) => (
              <tr
                key={`${parcela.numero ?? idx}-${parcela.data_vencimento}`}
                className="border-t border-[var(--color-border)]"
              >
                <td className="py-1.5 pr-2 font-mono">{parcela.numero ?? String(idx + 1)}</td>
                <td className="py-1.5 pr-2 tabular-nums">
                  {formatarVencimento(parcela.data_vencimento, locale)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatBRL(parcela.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] font-semibold">
              <td className="py-1.5 pr-2" colSpan={2}>
                {labels.total}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {formatBRL(somaParcelas(parcelas))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
