'use client'

/**
 * Ordens de compra — lista operacional.
 *
 * O que mudou nesta passagem:
 * - **Filtros e detalhe na URL.** Situação, busca, página e a ordem aberta eram
 *   estado local. Voltar do detalhe, atualizar a página ou mandar o link para
 *   alguém perdia o contexto, e não havia como apontar para UMA ordem.
 * - **Ações na própria linha**, no menu de três pontos, em vez de só clicar e
 *   descobrir o que dá para fazer dentro do modal.
 * - **Vínculo visível.** `importacoes_nfe.ordem_compra_id` e
 *   `contas_pagar.ordem_compra_id` existiam no banco desde as migrations da
 *   frente de entrada e NÃO apareciam em lugar nenhum de Compras: o operador só
 *   descobria a nota vinculada ao clicar em Receber e tomar
 *   `OC_NFE_JA_CREDITADA` como erro cru.
 *
 * Nenhuma regra mudou: conferência física, guardas de dupla entrada e geração
 * do título continuam onde sempre estiveram — no banco.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus, FilterX, FileText, Receipt, Eye, PackageCheck, Truck, CheckCircle2, XCircle, Pencil } from 'lucide-react'
import {
  MetricCard,
  PageHeader,
  RowActionsMenu,
  SectionCard,
  type RowAction,
} from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import { hrefFinanceiroPagar, hrefImportacaoNfe } from '@shared-core/navigation/routes'
import {
  atualizarStatusOC,
  listarOrdensCompra,
  type OcDetalheDTO,
  type OcKpisDTO,
  type OcListaDTO,
  type OcListaResult,
  type StatusOC,
} from '@/app/gerente/compras/actions'
import { OcFormModal } from '@/app/gerente/compras/OcFormModal'
import { OcDetalheModal } from '@/app/gerente/compras/OcDetalheModal'
import { CancelarOcModal } from './CancelarOcModal'

const LIMITE_PAG = 20

type Props = Readonly<{
  idioma: Idioma
  kpisIniciais: OcKpisDTO
  inicial: OcListaResult
  fornecedores: Array<{ id: string; nome: string }>
  produtos: Array<{ id: string; nome: string; unidade_medida: string }>
  /** Filtro vindo da URL (`?status=`) — usado pelos atalhos do hub de Entrada. */
  statusInicial?: StatusOC | ''
  /** Busca vinda da URL (`?q=`). */
  buscaInicial?: string
  /** Página vinda da URL (`?page=`), 1-based. */
  paginaInicial?: number
  /** Ordem a abrir já no carregamento (`?oc=<id>`). */
  ocInicial?: string | null
}>

const STATUS_CORES: Record<StatusOC, string> = {
  RASCUNHO: 'bg-[var(--color-surface-soft)] text-fg-muted',
  CONFIRMADA: 'bg-blue-500/20 text-blue-300',
  EM_TRANSITO: 'bg-amber-400/20 text-amber-300',
  RECEBIDA: 'bg-emerald-500/20 text-emerald-300',
  CANCELADA: 'bg-red-500/20 text-red-300',
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  // Data pura: `new Date('YYYY-MM-DD')` é UTC e exibiria o dia anterior em fuso
  // negativo — o mesmo defeito já corrigido no financeiro.
  const [ano, mes, dia] = d.slice(0, 10).split('-').map(Number)
  if (!ano || !mes || !dia) return '—'
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR')
}

function idCurto(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

function statusLabel(c: ReturnType<typeof getMessages>['compras'], status: StatusOC): string {
  const key = `status_${status}` as keyof typeof c
  const v = c[key]
  return typeof v === 'string' ? v : status
}

/** A nota vinculada já confirmada é quem creditou o estoque desta compra. */
function nfeJaCreditou(oc: OcListaDTO): boolean {
  return oc.nfe_id != null && String(oc.nfe_status ?? '').toUpperCase() === 'CONCLUIDA'
}

export function ComprasContent({
  idioma,
  kpisIniciais,
  inicial,
  fornecedores,
  produtos,
  statusInicial = '',
  buscaInicial = '',
  paginaInicial = 1,
  ocInicial = null,
}: Props) {
  const m = getMessages(idioma)
  const c = m.compras
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const statusFiltro = (searchParams.get('status') ?? statusInicial) as StatusOC | ''
  const buscaUrl = searchParams.get('q') ?? buscaInicial
  const paginaUrl = Math.max(1, Number.parseInt(searchParams.get('page') ?? String(paginaInicial), 10) || 1)
  const detalheId = searchParams.get('oc') ?? ocInicial

  const [busca, setBusca] = useState(buscaUrl)
  const [dados, setDados] = useState<OcListaResult>(inicial)
  const [loading, setLoading] = useState(false)
  const [pendingStatus, startStatus] = useTransition()

  const [formAberto, setFormAberto] = useState(false)
  const [ocParaEditar, setOcParaEditar] = useState<OcDetalheDTO | null>(null)
  const [cancelando, setCancelando] = useState<OcListaDTO | null>(null)

  /** Escreve os filtros na URL — é ela que guarda o contexto da lista. */
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') p.delete(k)
        else p.set(k, v)
      }
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  // A busca só entra na URL depois que o operador para de digitar — senão cada
  // tecla vira uma entrada no histórico do navegador.
  useEffect(() => {
    if (busca === buscaUrl) return
    const timer = setTimeout(() => setParams({ q: busca || null, page: null }), 320)
    return () => clearTimeout(timer)
  }, [busca, buscaUrl, setParams])

  useEffect(() => {
    setBusca(buscaUrl)
  }, [buscaUrl])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await listarOrdensCompra({
        status: statusFiltro || null,
        busca: buscaUrl,
        limite: LIMITE_PAG,
        offset: (paginaUrl - 1) * LIMITE_PAG,
      })
      setDados(r)
    } catch {
      emitGerenteToast({ kind: 'error', message: m.comum.erro })
    } finally {
      setLoading(false)
    }
  }, [statusFiltro, buscaUrl, paginaUrl, m])

  const primeiraCarga = useMemo(() => ({ feita: false }), [])
  useEffect(() => {
    // A primeira renderização já vem com os dados do servidor; refazer a
    // consulta aqui só piscaria a tabela sem mudar nada.
    if (!primeiraCarga.feita) {
      primeiraCarga.feita = true
      return
    }
    void carregar()
  }, [carregar, primeiraCarga])

  const totalPages = Math.max(1, Math.ceil(dados.total / LIMITE_PAG))

  function abrirDetalhe(id: string | null) {
    setParams({ oc: id })
  }

  function abrirNova() {
    setOcParaEditar(null)
    setFormAberto(true)
  }

  function abrirEditar(oc: OcDetalheDTO) {
    setOcParaEditar(oc)
    setFormAberto(true)
    abrirDetalhe(null)
  }

  function fecharForm() {
    setFormAberto(false)
    setOcParaEditar(null)
  }

  function aposMutacao() {
    void carregar()
    // Os KPIs vêm do servidor; sem isto ficavam parados depois de um
    // recebimento ou cancelamento.
    router.refresh()
  }

  function avancarStatus(oc: OcListaDTO, novo: StatusOC) {
    startStatus(async () => {
      const r = await atualizarStatusOC(oc.id, novo)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: c.toast_status })
      setCancelando(null)
      aposMutacao()
    })
  }

  const chipBase =
    'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]'
  const chipActive = 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
  const chipInactive =
    'border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg-muted hover:bg-[var(--color-surface)]'

  const statusOpcoes: Array<{ value: StatusOC | ''; label: string }> = [
    { value: '', label: c.filtro_todos_status },
    { value: 'RASCUNHO', label: c.status_RASCUNHO },
    { value: 'CONFIRMADA', label: c.status_CONFIRMADA },
    { value: 'EM_TRANSITO', label: c.status_EM_TRANSITO },
    { value: 'RECEBIDA', label: c.status_RECEBIDA },
    { value: 'CANCELADA', label: c.status_CANCELADA },
  ]

  const algumFiltroAtivo = Boolean(statusFiltro) || Boolean(buscaUrl)

  const columns: Column<OcListaDTO>[] = useMemo(
    () => [
      {
        key: 'id',
        header: c.col_id,
        cell: (row) => <span className="font-mono text-caption text-fg-muted">{idCurto(row.id)}</span>,
      },
      {
        key: 'fornecedor',
        header: c.col_fornecedor,
        priority: 'primary',
        cell: (row) => <span className="font-medium">{row.fornecedor_nome ?? '—'}</span>,
      },
      {
        key: 'status',
        header: c.col_status,
        cell: (row) => (
          <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium', STATUS_CORES[row.status])}>
            {statusLabel(c, row.status)}
          </span>
        ),
      },
      {
        key: 'emissao',
        header: c.col_emissao,
        priority: 'contextual',
        cell: (row) => <span className="tabular-nums text-caption">{fmtData(row.data_emissao)}</span>,
      },
      {
        key: 'vencimento',
        header: c.col_vencimento,
        priority: 'contextual',
        cell: (row) => (
          // É este campo que decide se o recebimento gera conta a pagar. Ele
          // existia só no detalhe — quem olhava a lista não sabia quais ordens
          // iam virar obrigação financeira.
          <span
            className={cn(
              'tabular-nums text-caption',
              row.data_vencimento ? 'text-fg' : 'text-fg-subtle italic',
            )}
          >
            {row.data_vencimento ? fmtData(row.data_vencimento) : c.sem_vencimento}
          </span>
        ),
      },
      {
        key: 'vinculo',
        header: c.col_origem,
        cell: (row) => {
          if (!row.nfe_id && !row.titulo_id) {
            return <span className="text-caption text-fg-subtle">{c.vinculo_nenhum}</span>
          }
          return (
            <div className="flex flex-col gap-0.5">
              {row.nfe_id ? (
                <span className="inline-flex items-center gap-1 text-caption text-[var(--color-warning-strong)]">
                  <FileText className="h-3 w-3" aria-hidden />
                  {row.nfe_numero
                    ? c.vinculo_nfe.replace('{numero}', `#${row.nfe_numero}`)
                    : c.vinculo_nfe_sem_numero}
                </span>
              ) : null}
              {row.titulo_id ? (
                <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
                  <Receipt className="h-3 w-3" aria-hidden />
                  {c.vinculo_titulo}
                  {row.titulo_valor != null ? ` · ${formatBRL(row.titulo_valor)}` : ''}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'itens',
        header: c.col_itens,
        align: 'right',
        priority: 'contextual',
        cell: (row) => <span className="tabular-nums">{row.total_itens}</span>,
      },
      {
        key: 'total',
        header: c.col_total,
        align: 'right',
        priority: 'primary',
        cell: (row) => <span className="tabular-nums">{formatBRL(row.valor_total)}</span>,
      },
    ],
    [c],
  )

  const emptyState = (
    <div className="py-12 text-center">
      <div className="text-5xl text-[var(--color-brand)]/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
        購
      </div>
      <div className="mt-3 text-body font-semibold">{c.vazio_titulo}</div>
      <div className="mt-1 text-caption text-fg-muted">{c.vazio_sub}</div>
    </div>
  )

  return (
    <>
      <PageHeader title={c.titulo} subtitle={c.subtitulo} />

      <div className="admin-v2-grid-kpi mb-5">
        <MetricCard label={c.kpi_rascunho} value={String(kpisIniciais.total_rascunho)} icon="list-filter" tone="gold" />
        <MetricCard
          label={c.kpi_confirmadas}
          value={String(kpisIniciais.total_confirmadas)}
          icon="file-check-2"
          tone="success"
        />
        <MetricCard
          label={c.kpi_em_transito}
          value={String(kpisIniciais.total_em_transito)}
          icon="package"
          tone={kpisIniciais.total_em_transito > 0 ? 'warning' : 'gold'}
        />
        <MetricCard
          label={c.kpi_valor_transito}
          value={formatBRL(kpisIniciais.valor_em_transito)}
          icon="dollar-sign"
          tone={kpisIniciais.valor_em_transito > 0 ? 'warning' : 'gold'}
        />
      </div>

      <SectionCard className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={c.filtro_status_aria}>
            {statusOpcoes.map((op) => (
              <button
                key={op.value}
                type="button"
                aria-pressed={statusFiltro === op.value}
                onClick={() => setParams({ status: op.value || null, page: null })}
                className={cn(chipBase, statusFiltro === op.value ? chipActive : chipInactive)}
              >
                {op.label}
              </button>
            ))}
          </div>

          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={c.busca_placeholder}
            aria-label={c.busca_placeholder}
            className="h-9 w-48 text-body sm:w-56"
          />

          {algumFiltroAtivo ? (
            <button
              type="button"
              onClick={() => setParams({ status: null, q: null, page: null })}
              className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-fg"
            >
              <FilterX className="h-3 w-3" aria-hidden />
              {c.limpar_filtros}
            </button>
          ) : null}

          <div className="flex-1" />

          <Button type="button" variant="primary" size="sm" onClick={abrirNova}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {c.nova_oc}
          </Button>
        </div>
      </SectionCard>

      <DataTable
        columns={columns}
        data={dados.rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => abrirDetalhe(row.id)}
        loading={loading}
        compact
        emptyState={emptyState}
        rowActions={(row) => {
          const bloqueadaPorNfe = nfeJaCreditou(row)
          const acoes: RowAction[] = [
            { id: 'detalhe', label: c.acao_detalhe, icon: Eye, onSelect: () => abrirDetalhe(row.id) },
          ]

          if (row.status === 'RASCUNHO') {
            acoes.push({
              id: 'confirmar',
              label: c.acao_confirmar,
              icon: CheckCircle2,
              onSelect: () => avancarStatus(row, 'CONFIRMADA'),
            })
          }
          if (row.status === 'CONFIRMADA') {
            acoes.push({
              id: 'transito',
              label: c.acao_em_transito,
              icon: Truck,
              onSelect: () => avancarStatus(row, 'EM_TRANSITO'),
            })
          }
          if (row.status === 'EM_TRANSITO') {
            acoes.push({
              id: 'receber',
              label: c.acao_receber,
              icon: PackageCheck,
              // A conferência item a item é obrigatória e vive no detalhe; a
              // ação de linha leva até lá em vez de receber de atalho.
              onSelect: () => abrirDetalhe(row.id),
              disabled: bloqueadaPorNfe,
              disabledHint: c.nfe_ja_creditou_titulo,
            })
          }
          if (['RASCUNHO', 'CONFIRMADA'].includes(row.status)) {
            acoes.push({
              id: 'editar',
              label: c.acao_editar,
              icon: Pencil,
              onSelect: () => abrirDetalhe(row.id),
            })
          }
          if (row.nfe_id) {
            acoes.push({
              id: 'nfe',
              label: c.acao_ver_nfe,
              icon: FileText,
              href: hrefImportacaoNfe(row.nfe_id),
            })
          }
          if (row.titulo_id) {
            acoes.push({
              id: 'titulo',
              label: c.acao_ver_titulo,
              icon: Receipt,
              href: hrefFinanceiroPagar(),
            })
          }
          if (['RASCUNHO', 'CONFIRMADA', 'EM_TRANSITO'].includes(row.status)) {
            acoes.push({
              id: 'cancelar',
              label: c.acao_cancelar,
              icon: XCircle,
              destructive: true,
              onSelect: () => setCancelando(row),
            })
          }

          return (
            <RowActionsMenu actions={acoes} ariaLabel={c.acoes_aria.replace('{id}', idCurto(row.id))} />
          )
        }}
      />

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={paginaUrl <= 1}
            onClick={() => setParams({ page: paginaUrl <= 2 ? null : String(paginaUrl - 1) })}
          >
            {c.pag_prev}
          </Button>
          <span className="text-caption text-fg-muted">
            {paginaUrl} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={paginaUrl >= totalPages}
            onClick={() => setParams({ page: String(paginaUrl + 1) })}
          >
            {c.pag_next}
          </Button>
        </div>
      ) : null}

      {formAberto ? (
        <OcFormModal
          idioma={idioma}
          ocInicial={ocParaEditar}
          fornecedores={fornecedores}
          produtos={produtos}
          onClose={fecharForm}
          onSaved={() => {
            fecharForm()
            aposMutacao()
          }}
        />
      ) : null}

      {detalheId ? (
        <OcDetalheModal
          idioma={idioma}
          ocId={detalheId}
          onClose={() => abrirDetalhe(null)}
          onEditar={abrirEditar}
          onStatusChanged={() => {
            abrirDetalhe(null)
            aposMutacao()
          }}
        />
      ) : null}

      {cancelando ? (
        <CancelarOcModal
          idioma={idioma}
          identificacao={`${idCurto(cancelando.id)} · ${cancelando.fornecedor_nome ?? '—'}`}
          pending={pendingStatus}
          onCancel={() => setCancelando(null)}
          onConfirm={() => avancarStatus(cancelando, 'CANCELADA')}
        />
      ) : null}
    </>
  )
}
