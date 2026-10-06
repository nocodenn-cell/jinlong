'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { History, PackagePlus, SlidersHorizontal } from 'lucide-react'
import { adminEstoqueRecebimentoProdutoQuery } from '@/lib/navigation/routes'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { QuantityCell } from '@/components/ui/QuantityCell'
import { classificarEstoque } from '@/lib/estoque/classificarEstoque'
import { cn } from '@/lib/utils'
import { SaldoMobileCards } from './SaldoMobileCards'
import { AjusteSaldoModal, type AjusteAlvo } from './AjusteSaldoModal'
import { KardexSheet, type KardexAlvo } from './KardexSheet'

export type EstoqueLinha = {
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  origem: string
  quantidade_atual: number | null
  estoque_minimo: number | null
  deficit: number | null
}

export type EstoqueLabels = {
  produto: string
  saldo: string
  minimo: string
  deficit: string
  unidade: string
  origem: string
  origemChina: string
  origemBrasilNf: string
  origemBrasil: string
  vazioTitulo: string
  vazioSub: string
  ajusteTitulo: string
  reporTitulo: string
  saldoAtual: string
  estoqueMinimo: string
  motivo: string
  observacao: string
  cancelar: string
  salvarAjuste: string
  salvando: string
  motivoAcertoInventario: string
  motivoEntradaCompra: string
  motivoPerda: string
  motivoQuebra: string
  motivoOutro: string
  kardexTitulo: string
  kardexVerAuditoria: string
  semMovimentos: string
  semMovimentosSub: string
  tipoMap: Record<string, string>
  situacaoZerado: string
  situacaoAbaixoMinimo: string
  situacaoNoMinimo: string
}

const ORIGEM_BADGE: Record<string, string> = {
  china_manual:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]',
  brasil_nf: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand',
  brasil_sem_nf: 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-muted',
}

const SORT_KEYS: Record<string, string> = { produto: 'nome', saldo: 'quantidade_atual', minimo: 'estoque_minimo', deficit: 'deficit' }

export function EstoqueTable({ linhas, labels, ordem = 'nome', direcao = 'asc', idioma = 'pt' }: {
  linhas: EstoqueLinha[]; labels: EstoqueLabels; ordem?: string; direcao?: 'asc' | 'desc'; idioma?: 'pt' | 'zh'
}) {
  const router = useRouter()
  const params = useSearchParams()
  const pathname = usePathname()
  const ordenar = (key: string, direction: 'asc' | 'desc') => {
    const query = new URLSearchParams(params.toString())
    query.set('ordem', SORT_KEYS[key] ?? 'nome')
    query.set('dir', direction)
    query.delete('page')
    router.replace(`${pathname}?${query}`)
  }
  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)

  const columns: Column<EstoqueLinha>[] = [
    {
      key: 'produto',
      priority: 'primary',
      header: labels.produto,
      // Fixa o produto durante o scroll horizontal (ver DataTable `sticky`).
      sticky: true,
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[150px] whitespace-normal sm:max-w-[240px] text-body font-medium text-fg">{r.nome}</p>
          <p className="font-mono text-caption text-fg-subtle">{r.codigo_barras ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'saldo',
      priority: 'primary',
      header: labels.saldo,
      align: 'right',
      sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
      cell: (r) => {
        // Texto além da cor (acessibilidade) e nome próprio para cada situação (UX-006).
        const situacao = classificarEstoque(r.quantidade_atual, r.estoque_minimo)
        const rotulo =
          situacao === 'ZERADO'
            ? labels.situacaoZerado
            : situacao === 'ABAIXO_MINIMO'
              ? labels.situacaoAbaixoMinimo
              : situacao === 'NO_MINIMO'
                ? labels.situacaoNoMinimo
                : null
        return (
          <div className="flex flex-col items-end">
            <QuantityCell value={r.quantidade_atual} threshold={r.estoque_minimo} />
            {rotulo ? <span className="text-caption text-fg-subtle">{rotulo}</span> : null}
          </div>
        )
      },
    },
    {
      key: 'minimo',
      priority: 'contextual',
      header: labels.minimo,
      align: 'right',
      sortValue: (r) => r.estoque_minimo ?? Number.NEGATIVE_INFINITY,
      cell: (r) =>
        r.estoque_minimo === null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="tabular-nums text-fg-muted">{r.estoque_minimo}</span>
        ),
    },
    {
      key: 'deficit',
      priority: 'contextual',
      header: labels.deficit,
      align: 'right',
      sortValue: (r) => r.deficit ?? 0,
      cell: (r) =>
        r.deficit != null && r.deficit > 0 ? (
          <span className="font-medium tabular-nums text-[var(--color-warning-strong)]">
            -{r.deficit}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'unidade',
      header: labels.unidade,
      align: 'center',
      cell: (r) => (
        <span className="text-caption uppercase text-fg-subtle">{r.unidade_medida}</span>
      ),
    },
    {
      key: 'origem',
      header: labels.origem,
      cell: (r) => {
        const badgeClass = ORIGEM_BADGE[r.origem]
        if (!badgeClass) return <span className="text-fg-subtle">—</span>
        const origemLabel =
          r.origem === 'china_manual'
            ? labels.origemChina
            : r.origem === 'brasil_nf'
              ? labels.origemBrasilNf
              : labels.origemBrasil
        return <Badge className={cn('text-caption font-medium', badgeClass)}>{origemLabel}</Badge>
      },
    },
  ]

  return (
    <>
      <SaldoMobileCards linhas={linhas} labels={labels} idioma={idioma}
        onAjustar={(row) => setAjusteAlvo({ produtoId: row.id, produtoNome: row.nome, quantidadeAtual: row.quantidade_atual ?? 0, estoqueMinimo: row.estoque_minimo ?? 0 })}
        onKardex={(row) => setKardexAlvo({ produtoId: row.id, produtoNome: row.nome })} />
      <div className="hidden lg:block">
      <DataTable
        data={linhas}
        onSort={ordenar}
        sortKey={Object.keys(SORT_KEYS).find((key) => SORT_KEYS[key] === ordem)}
        sortDirection={direcao}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={<EmptyState title={labels.vazioTitulo} description={labels.vazioSub} />}
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {row.deficit != null && row.deficit > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${labels.reporTitulo} ${row.nome}`}
                title={labels.reporTitulo}
                asChild
              >
                <Link
                  href={adminEstoqueRecebimentoProdutoQuery(row.id)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <PackagePlus className="h-5 w-5" aria-hidden />{labels.reporTitulo}
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${labels.ajusteTitulo} ${row.nome}`}
              title={labels.ajusteTitulo}
              onClick={(e) => {
                e.stopPropagation()
                setAjusteAlvo({
                  produtoId: row.id,
                  produtoNome: row.nome,
                  quantidadeAtual: row.quantidade_atual ?? 0,
                  estoqueMinimo: row.estoque_minimo ?? 0,
                })
              }}
            >
              <SlidersHorizontal className="h-5 w-5" aria-hidden />{labels.ajusteTitulo}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${labels.kardexTitulo} ${row.nome}`}
              title={labels.kardexTitulo}
              onClick={(e) => {
                e.stopPropagation()
                setKardexAlvo({ produtoId: row.id, produtoNome: row.nome })
              }}
            >
              <History className="h-5 w-5" aria-hidden />{labels.kardexTitulo}
            </Button>
          </div>
        )}
      />

      </div>
      <AjusteSaldoModal
        alvo={ajusteAlvo}
        onClose={() => setAjusteAlvo(null)}
        labels={{
          titulo: labels.ajusteTitulo,
          saldoAtual: labels.saldoAtual,
          estoqueMinimo: labels.estoqueMinimo,
          motivo: labels.motivo,
          observacao: labels.observacao,
          cancelar: labels.cancelar,
          salvar: labels.salvarAjuste,
          salvando: labels.salvando,
          motivos: [
            { value: 'ACERTO_INVENTARIO', label: labels.motivoAcertoInventario },
            { value: 'COMPRA', label: labels.motivoEntradaCompra },
            { value: 'PERDA', label: labels.motivoPerda },
            { value: 'QUEBRA', label: labels.motivoQuebra },
            { value: 'OUTRO', label: labels.motivoOutro },
          ],
        }}
      />
      <KardexSheet
        idioma={idioma}
        alvo={kardexAlvo}
        onClose={() => setKardexAlvo(null)}
        labels={{
          titulo: labels.kardexTitulo,
          semMovimentos: labels.semMovimentos,
          semMovimentosSub: labels.semMovimentosSub,
          verAuditoria: labels.kardexVerAuditoria,
          tipoMap: labels.tipoMap,
        }}
      />
    </>
  )
}
