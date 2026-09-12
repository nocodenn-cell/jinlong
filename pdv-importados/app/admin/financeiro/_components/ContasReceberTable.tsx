'use client'

/**
 * Contas a receber — lista operacional.
 *
 * O que existia antes: uma tabela SOMENTE LEITURA (cliente, vencimento, total,
 * pago, aberto, um pill de dois estados) e, logo abaixo, uma SEGUNDA lista com
 * os formulários de liquidação — limitada a `abertas.slice(0, 8)`. O nono
 * título em aberto não tinha como ser baixado pela interface.
 *
 * Agora é uma lista só, com a mesma experiência de Contas a Pagar: saldo como
 * número dominante, situação derivada de saldo × vencimento, e as ações no menu
 * de três pontos da própria linha. A regra financeira não mudou — nenhuma RPC
 * foi tocada.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandCoins, History, Receipt } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import {
  RowActionsMenu,
  SituacaoTituloBadge,
  type RowAction,
  type SituacaoTituloLabels,
} from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { hrefVendaDetalhe } from '@shared-core/navigation/routes'
import {
  hojeYmd,
  situacaoAtrasada,
  situacaoEmAberto,
  situacaoTitulo,
  type SituacaoTitulo,
} from '@shared-core/src/financial'
import { ReceberTituloModal } from './ReceberTituloModal'
import { HistoricoRecebimentosModal } from './HistoricoRecebimentosModal'

export type ContaLinha = {
  id: string
  cliente_nome: string
  valor_total: number
  valor_aberto: number
  valor_pago: number
  status: string
  vencimento: string | null
  descricao: string | null
  loja_id: string
  /** Venda que originou o título; `null` para lançamento manual. */
  venda_id: string | null
}

export type ContasLabels = {
  vazioTitulo: string
  vazioSub: string
  locale: string
}

type Props = {
  contas: ContaLinha[]
  labels: ContasLabels
  idioma: Idioma
  caixasAbertos: Array<{ id: string; loja_id: string; operador: string }>
  /** Loja do ator — `registrar_liquidacao_receber` recusa liquidação cross-loja. */
  actorLojaId: string | null
}

/**
 * `vencimento` é data pura (YYYY-MM-DD). `new Date('YYYY-MM-DD')` é meia-noite
 * UTC e, em fuso negativo, exibe o dia anterior — o mesmo defeito já corrigido
 * em Contas a Pagar.
 */
function dataLocal(iso: string): Date | null {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  if (!ano || !mes || !dia) return null
  return new Date(ano, mes - 1, dia)
}

function fmtData(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const d = dataLocal(iso)
  if (!d) return '—'
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Distância em DIAS DE CALENDÁRIO, medida da meia-noite de hoje. Medir de
 * `Date.now()` erra até um dia inteiro: às 12h, um vencimento HOJE ficaria a
 * −0,5 dia e seria arredondado para "ontem".
 */
function diasAteVencimento(iso: string): number | null {
  const venc = dataLocal(iso)
  if (!venc) return null
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000)
}

function relativoVenc(iso: string | null, locale: string): string {
  if (!iso) return ''
  const dias = diasAteVencimento(iso)
  if (dias === null) return ''
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dias, 'day')
}

function vencimentoTone(situacao: SituacaoTitulo, vencimento: string | null): string {
  if (!situacaoEmAberto(situacao) || !vencimento) return 'text-fg'
  if (situacaoAtrasada(situacao)) return 'text-[var(--color-danger-strong)] font-semibold'
  if (situacao === 'VENCE_HOJE') return 'text-[var(--color-warning-strong)] font-semibold'
  const dias = diasAteVencimento(vencimento)
  if (dias !== null && dias <= 7) return 'text-[var(--color-warning)]'
  return 'text-fg-muted'
}

export function ContasReceberTable({
  contas,
  labels,
  idioma,
  caixasAbertos,
  actorLojaId,
}: Props) {
  const router = useRouter()
  const m = getMessages(idioma)
  const t = m.contas_receber
  const locale = labels.locale

  // Guarda o ID, não a linha. A linha é DERIVADA de `contas` a cada render:
  // depois de um recebimento ou estorno, `router.refresh()` traz os valores
  // novos do servidor e o modal aberto acompanha. Guardando o objeto, o
  // cabeçalho do histórico continuava exibindo o saldo anterior ao estorno.
  const [recebimentoId, setRecebimentoId] = useState<string | null>(null)
  const [historicoId, setHistoricoId] = useState<string | null>(null)

  const emRecebimento = contas.find((c) => c.id === recebimentoId) ?? null
  const emHistorico = contas.find((c) => c.id === historicoId) ?? null

  const situacaoLabels: SituacaoTituloLabels = useMemo(
    () => ({
      EM_ABERTO: t.situacao_em_aberto,
      VENCE_HOJE: t.situacao_vence_hoje,
      ATRASADO: t.situacao_atrasado,
      QUITADO: t.situacao_quitado,
      PARCIAL_EM_DIA: t.situacao_parcial_em_dia,
      PARCIAL_ATRASADO: t.situacao_parcial_atrasado,
      CANCELADO: t.situacao_cancelado,
    }),
    [t],
  )

  function situacaoDe(c: ContaLinha): SituacaoTitulo {
    return situacaoTitulo({
      valorTotal: c.valor_total,
      valorPago: c.valor_pago,
      vencimento: c.vencimento,
      status: c.status,
      hoje: hojeYmd(),
    })
  }

  const columns: Column<ContaLinha>[] = [
    {
      key: 'cliente',
      header: t.col_cliente,
      sticky: true,
      priority: 'primary',
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-small font-medium text-fg">{r.cliente_nome}</p>
          {r.descricao ? (
            <p className="max-w-[240px] truncate text-caption text-fg-subtle">{r.descricao}</p>
          ) : null}
          <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-fg-subtle">
            <Receipt className="h-3 w-3" aria-hidden />
            {r.venda_id ? `${t.origem_venda} ${r.venda_id.slice(0, 8).toUpperCase()}` : t.origem_manual}
          </p>
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: t.col_vencimento,
      width: '140px',
      sortValue: (r) => r.vencimento ?? '',
      cell: (r) => {
        const situacao = situacaoDe(r)
        return (
          <div className={cn('tabular-nums', vencimentoTone(situacao, r.vencimento))}>
            {fmtData(r.vencimento, locale)}
            {situacaoEmAberto(situacao) && r.vencimento ? (
              <div className="mt-0.5 text-caption uppercase tracking-wide opacity-85">
                {relativoVenc(r.vencimento, locale)}
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'aberto',
      header: t.col_em_aberto,
      align: 'right',
      priority: 'primary',
      sortValue: (r) => r.valor_aberto,
      cell: (r) => {
        // O número dominante é o que o cliente AINDA DEVE. O total original e o
        // já recebido ficam abaixo, como contexto.
        const situacao = situacaoDe(r)
        const quitado = situacao === 'QUITADO'
        const cancelado = situacao === 'CANCELADO'
        const parcial = r.valor_pago > 0 && !quitado && !cancelado
        const pct = r.valor_total > 0 ? (r.valor_pago / r.valor_total) * 100 : 0

        return (
          <div className="text-right">
            {/*
              A cor NÃO pode entrar no mesmo `cn` que `text-body`: o
              tailwind-merge trata as duas como o grupo `text-*` e descarta a
              primeira, fazendo o número perder o tamanho que o torna dominante.
            */}
            <div
              className={`text-body font-bold tabular-nums ${
                cancelado
                  ? 'text-fg-subtle line-through'
                  : quitado
                    ? 'text-[var(--color-success-strong)]'
                    : situacaoAtrasada(situacao)
                      ? 'text-[var(--color-danger-strong)]'
                      : 'text-fg'
              }`}
            >
              {quitado ? t.saldo_quitado : formatBRL(r.valor_aberto)}
              {!quitado && !cancelado ? (
                <span className="ml-1 text-caption font-medium uppercase tracking-wide opacity-75">
                  {t.saldo_pendente}
                </span>
              ) : null}
            </div>

            <div className="mt-0.5 text-caption tabular-nums text-fg-subtle">
              {t.saldo_de} {formatBRL(r.valor_total)}
              {parcial ? (
                <>
                  {' · '}
                  {t.pago_label} {formatBRL(r.valor_pago)}
                </>
              ) : null}
            </div>

            {parcial ? (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                <div
                  className={cn(
                    'h-full transition-[width] duration-200',
                    situacaoAtrasada(situacao)
                      ? 'bg-gradient-to-r from-red-400 to-red-700'
                      : 'bg-gradient-to-r from-amber-400 to-amber-700',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'situacao',
      header: t.col_situacao,
      align: 'center',
      width: '140px',
      cell: (r) => <SituacaoTituloBadge situacao={situacaoDe(r)} labels={situacaoLabels} />,
    },
  ]

  return (
    <>
      <DataTable
        data={contas}
        columns={columns}
        rowKey={(r) => r.id}
        compact
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-fg-subtle" aria-hidden>
              📋
            </span>
            <p className="text-body font-medium text-fg-muted">{labels.vazioTitulo}</p>
            <p className="text-small text-fg-subtle">{labels.vazioSub}</p>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(r) => {
          const situacao = situacaoDe(r)
          const emAberto = situacaoEmAberto(situacao)
          // `registrar_liquidacao_receber` recusa liquidação de outra loja para
          // TODOS os perfis. A ação continua visível e explicada; o histórico
          // permanece disponível, porque ler não é escrever.
          const foraDaLoja = actorLojaId != null && r.loja_id !== actorLojaId

          const acoes: RowAction[] = []
          if (emAberto) {
            acoes.push({
              id: 'receber',
              label: t.acao_receber,
              icon: HandCoins,
              onSelect: () => setRecebimentoId(r.id),
              disabled: foraDaLoja,
              disabledHint: t.outra_loja_hint,
            })
          }
          acoes.push({
            id: 'historico',
            label: t.acao_historico,
            icon: History,
            onSelect: () => setHistoricoId(r.id),
          })
          if (r.venda_id) {
            acoes.push({
              id: 'venda',
              label: t.acao_ver_venda,
              icon: Receipt,
              href: hrefVendaDetalhe(r.venda_id),
            })
          }

          return (
            <div className="flex items-center justify-end gap-1">
              {foraDaLoja ? (
                <span className="text-caption text-fg-subtle" title={t.outra_loja_hint}>
                  {t.outra_loja}
                </span>
              ) : null}
              <RowActionsMenu
                actions={acoes}
                ariaLabel={t.acoes_aria.replace('{cliente}', r.cliente_nome)}
              />
            </div>
          )
        }}
      />

      {emRecebimento ? (
        <ReceberTituloModal
          key={emRecebimento.id}
          idioma={idioma}
          locale={locale}
          titulo={emRecebimento}
          caixasAbertos={caixasAbertos}
          onClose={() => setRecebimentoId(null)}
          onRecebido={() => {
            setRecebimentoId(null)
            router.refresh()
          }}
        />
      ) : null}

      {emHistorico ? (
        <HistoricoRecebimentosModal
          key={emHistorico.id}
          idioma={idioma}
          locale={locale}
          titulo={emHistorico}
          situacaoLabels={situacaoLabels}
          onClose={() => setHistoricoId(null)}
          onEstornado={() => router.refresh()}
        />
      ) : null}
    </>
  )
}
