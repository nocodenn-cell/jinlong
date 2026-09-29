'use client'

/**
 * S9 (G-01) — histórico de fechamento de caixa. Lista os turnos FECHADOS
 * (valor sistema já vem derivado dos campos persistidos, nunca recalculado
 * — ver `app/gerente/caixas/caixasHistorico.ts`); clicar numa linha abre um
 * Sheet com as movimentações (sangria/suprimento) daquele turno, buscadas
 * sob demanda pelo id — mesmo padrão de `KardexSheet`/`VendaDetailSheet`.
 * O motivo do fechamento fica só no detalhe (não ocupa largura da tabela).
 */

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { listarMovimentacoesCaixa } from '@/app/gerente/caixas/actions'
import {
  normalizarTipoMovimentacao,
  temDiferenca,
  type CaixaHistoricoLinha,
  type CaixaMovimentacaoLinha,
} from '@/app/gerente/caixas/caixasHistorico'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { StatusChip } from '@/components/ui/StatusChip'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'

export type CaixasHistoricoLabels = Readonly<{
  colOperador: string
  colAbertura: string
  colFechamento: string
  colValorSistema: string
  colValorContado: string
  colDiferenca: string
  colMotivo: string
  colStatus: string
  statusFechado: string
  statusDivergencia: string
  statusRetomado: string
  semMotivo: string
  vazioTitulo: string
  vazioSub: string
  detalheTitulo: string
  detalheValorInicial: string
  detalheMovimentacoes: string
  detalheSemMovimentacoes: string
  movTipoSangria: string
  movTipoSuprimento: string
  fecharAria: string
  erroTitulo: string
}>

function rotuloTipoMovimentacao(tipo: string, labels: CaixasHistoricoLabels): string {
  // O banco grava o tipo em minúsculas (`sangria`/`suprimento`/`estorno`).
  const normalizado = normalizarTipoMovimentacao(tipo)
  if (normalizado === 'SANGRIA') return labels.movTipoSangria
  if (normalizado === 'SUPRIMENTO') return labels.movTipoSuprimento
  return tipo
}

export function CaixasHistoricoTable({
  linhas,
  erro,
  locale,
  labels,
}: {
  linhas: CaixaHistoricoLinha[]
  erro: string | null
  locale: string
  labels: CaixasHistoricoLabels
}) {
  const [alvo, setAlvo] = useState<CaixaHistoricoLinha | null>(null)
  const fecharDetalhe = useCallback(() => setAlvo(null), [])

  if (erro) {
    return <ErrorState title={labels.erroTitulo} description={erro} />
  }

  const columns: Column<CaixaHistoricoLinha>[] = [
    {
      key: 'operador',
      header: labels.colOperador,
      priority: 'primary',
      cell: (r) => <span className="font-medium text-fg">{r.operadorNome}</span>,
    },
    {
      key: 'abertura',
      header: labels.colAbertura,
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-body">
          {formatDateTimeOrDash(r.dataAbertura, locale, 'short')}
        </span>
      ),
    },
    {
      key: 'fechamento',
      header: labels.colFechamento,
      priority: 'primary',
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-body">
          {formatDateTimeOrDash(r.dataFechamento, locale, 'short')}
        </span>
      ),
    },
    {
      key: 'valorSistema',
      header: labels.colValorSistema,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatBRL(r.valorSistema)}</span>,
    },
    {
      key: 'valorContado',
      header: labels.colValorContado,
      align: 'right',
      priority: 'primary',
      cell: (r) => <span className="tabular-nums">{formatBRL(r.valorContado)}</span>,
    },
    {
      key: 'diferenca',
      header: labels.colDiferenca,
      align: 'right',
      cell: (r) => (
        <span
          className={
            temDiferenca(r.diferenca)
              ? 'font-medium tabular-nums text-[var(--color-warning-strong)]'
              : 'tabular-nums text-fg-subtle'
          }
        >
          {r.diferenca > 0 ? '+' : ''}
          {formatBRL(r.diferenca)}
        </span>
      ),
    },
    {
      key: 'status',
      header: labels.colStatus,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {temDiferenca(r.diferenca) ? (
            <StatusChip status="ALERTA" label={`⚠ ${labels.statusDivergencia}`} />
          ) : (
            <StatusChip status="FECHADO" label={labels.statusFechado} />
          )}
          {r.retomado ? <StatusChip status="PROCESSANDO" label={`↻ ${labels.statusRetomado}`} /> : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <DataTable
        data={linhas}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setAlvo(r)}
        emptyState={<EmptyState title={labels.vazioTitulo} description={labels.vazioSub} />}
      />
      <CaixaDetalheSheet alvo={alvo} onClose={fecharDetalhe} locale={locale} labels={labels} />
    </>
  )
}

function CaixaDetalheSheet({
  alvo,
  onClose,
  locale,
  labels,
}: {
  alvo: CaixaHistoricoLinha | null
  onClose: () => void
  locale: string
  labels: CaixasHistoricoLabels
}) {
  const [movimentacoes, setMovimentacoes] = useState<CaixaMovimentacaoLinha[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erroMov, setErroMov] = useState<string | null>(null)

  // Mesmo padrão do `VendaDetailSheet`: Escape fecha e o scroll do body fica
  // travado enquanto o painel está aberto.
  useEffect(() => {
    if (!alvo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [alvo, onClose])

  useEffect(() => {
    if (!alvo) return
    let vivo = true
    setCarregando(true)
    setMovimentacoes([])
    setErroMov(null)
    listarMovimentacoesCaixa(alvo.id)
      .then((res) => {
        if (!vivo) return
        if (res.ok) setMovimentacoes(res.data)
        else setErroMov(res.error)
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [alvo])

  if (!alvo) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="caixa-detalhe-titulo">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside className="admin-v2-sheet relative z-10 flex h-full w-full max-w-md flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-secondary)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="caixa-detalhe-titulo" className="text-[15px] font-semibold text-jl-fg-1">
              {labels.detalheTitulo}
            </h2>
            <p className="mt-0.5 text-[12px] text-jl-fg-2">
              {alvo.operadorNome} · {formatDateTimeOrDash(alvo.dataFechamento, locale, 'short')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.fecharAria}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <dl className="admin-v2-panel grid grid-cols-2 gap-3 rounded-[10px] p-3 text-[12px]">
            <div>
              <dt className="text-jl-fg-3">{labels.detalheValorInicial}</dt>
              <dd className="tabular-nums text-jl-fg-1">{formatBRL(alvo.valorInicial)}</dd>
            </div>
            <div>
              <dt className="text-jl-fg-3">{labels.colValorSistema}</dt>
              <dd className="tabular-nums text-jl-fg-1">{formatBRL(alvo.valorSistema)}</dd>
            </div>
            <div>
              <dt className="text-jl-fg-3">{labels.colValorContado}</dt>
              <dd className="tabular-nums text-jl-fg-1">{formatBRL(alvo.valorContado)}</dd>
            </div>
            <div>
              <dt className="text-jl-fg-3">{labels.colDiferenca}</dt>
              <dd className="tabular-nums text-jl-fg-1">
                {alvo.diferenca > 0 ? '+' : ''}
                {formatBRL(alvo.diferenca)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-jl-fg-3">{labels.colMotivo}</dt>
              <dd className="text-jl-fg-1">{alvo.motivo ?? labels.semMotivo}</dd>
            </div>
          </dl>

          <h3 className="mb-2 mt-5 text-caption font-semibold uppercase tracking-[0.06em] text-jl-fg-3">
            {labels.detalheMovimentacoes}
          </h3>

          {carregando ? (
            <Loading />
          ) : erroMov ? (
            <ErrorState title={labels.erroTitulo} description={erroMov} />
          ) : movimentacoes.length === 0 ? (
            <p className="text-caption text-fg-subtle">{labels.detalheSemMovimentacoes}</p>
          ) : (
            <ul className="space-y-2">
              {movimentacoes.map((mv) => (
                <li
                  key={mv.id}
                  className="admin-v2-panel flex items-center justify-between rounded-[10px] p-2.5 text-[12px]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-jl-fg-1">{rotuloTipoMovimentacao(mv.tipo, labels)}</p>
                    <p className="truncate text-jl-fg-3" title={mv.motivo}>
                      {mv.motivo}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-jl-fg-1">{formatBRL(mv.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
