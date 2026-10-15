'use client'

import Link from 'next/link'
import { SlidersHorizontal, History, PackagePlus, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import type { EstoqueLabels, EstoqueLinha } from './EstoqueTable'
import {
  adminEstoqueRecebimentoProdutoQuery,
  adminEtiquetasProdutoQuery,
} from '@/lib/navigation/routes'

export function SaldoMobileCards({ linhas, labels, onAjustar, onKardex }: {
  linhas: EstoqueLinha[]
  labels: EstoqueLabels
  onAjustar: (row: EstoqueLinha) => void
  onKardex: (row: EstoqueLinha) => void
}) {
  return <div className="space-y-3 p-3 lg:hidden">
    {linhas.length === 0 ? <EmptyState title={labels.vazioTitulo} description={labels.vazioSub} /> : null}
    {linhas.map((row) => <article key={row.id} className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
      <h3 className="break-words text-body font-semibold">{row.nome}</h3>
      <p className="text-caption text-fg-muted">{row.codigo_barras ?? '—'}</p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-body">
        <div><dt className="text-caption text-fg-muted">{labels.saldo}</dt><dd>{row.quantidade_atual ?? '—'} {row.unidade_medida}</dd></div>
        <div><dt className="text-caption text-fg-muted">{labels.minimo}</dt><dd>{row.estoque_minimo ?? '—'}</dd></div>
        <div><dt className="text-caption text-fg-muted">{labels.deficit}</dt><dd>{row.deficit ?? '—'}</dd></div>
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="min-h-11 w-full justify-center whitespace-normal text-center" onClick={() => onAjustar(row)}><SlidersHorizontal aria-hidden />{labels.ajusteTitulo}</Button>
        <Button variant="outline" size="sm" className="min-h-11 w-full justify-center whitespace-normal text-center" onClick={() => onKardex(row)}><History aria-hidden />{labels.kardexTitulo}</Button>
        <Button asChild variant="outline" size="sm" className="min-h-11 w-full justify-center whitespace-normal text-center"><Link href={adminEstoqueRecebimentoProdutoQuery(row.id)}><PackagePlus aria-hidden />{labels.reporTitulo}</Link></Button>
        <Button asChild variant="outline" size="sm" className="min-h-11 w-full justify-center whitespace-normal text-center">
          <Link
            href={adminEtiquetasProdutoQuery({
              codigo: row.codigo_barras,
              produtoId: row.codigo_barras ? null : row.id,
            })}
          >
            <Printer aria-hidden />
            {labels.etiquetasTitulo}
          </Link>
        </Button>
      </div>
    </article>)}
  </div>
}
