'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { X, Edit2, AlertTriangle, FileText } from 'lucide-react'
import { ROUTES, hrefFinanceiroPagar, hrefImportacaoNfe } from '@shared-core/navigation/routes'
import { ConsequenciaOperacao, type EfeitoOperacao } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import {
  obterOrdemCompraDetalhe,
  atualizarStatusOC,
  registrarRecebimentoOC,
  type OcDetalheDTO,
  type StatusOC,
} from './actions'

type Props = Readonly<{
  idioma: Idioma
  ocId: string
  onClose: () => void
  onEditar: (oc: OcDetalheDTO) => void
  onStatusChanged: () => void
}>

const STATUS_CORES: Record<StatusOC, string> = {
  RASCUNHO: 'bg-white/[0.09] text-jl-fg-3',
  CONFIRMADA: 'bg-blue-500/20 text-blue-300',
  EM_TRANSITO: 'bg-amber-400/20 text-amber-300',
  RECEBIDA: 'bg-emerald-500/20 text-emerald-300',
  CANCELADA: 'bg-red-500/20 text-red-300',
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function idCurto(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

type ComprasLabels = ReturnType<typeof getMessages>['compras']

/**
 * O que o recebimento desta ordem vai fazer — incluindo, quando for o caso,
 * por que o título financeiro NÃO vai nascer. A regra é a do backend
 * (`receber_ordem_compra`): só gera conta a pagar com fornecedor cadastrado
 * e prazo acordado na ordem.
 */
function efeitosRecebimentoOc(
  c: ComprasLabels,
  oc: OcDetalheDTO,
  totalConferido: string,
): readonly EfeitoOperacao[] {
  const efeitos: EfeitoOperacao[] = [
    { tom: 'estoque', texto: c.consequencia_estoque },
    { tom: 'documento', texto: c.consequencia_status },
  ]

  if (!oc.fornecedor_id) {
    efeitos.push({ tom: 'alerta', texto: c.consequencia_sem_fornecedor })
  } else if (!oc.data_vencimento) {
    efeitos.push({ tom: 'alerta', texto: c.consequencia_sem_vencimento })
  } else {
    efeitos.push({
      tom: 'financeiro',
      texto: c.consequencia_financeiro
        .replace('{{total}}', totalConferido)
        .replace('{{data}}', fmtData(oc.data_vencimento)),
    })
  }

  return efeitos
}

/**
 * Valor que virará título: quantidade conferida × preço — a mesma conta que
 * `receber_ordem_compra` faz. Enquanto a ordem está em trânsito, a quantidade
 * é a que o operador está digitando agora.
 */
function totalConferidoOc(oc: OcDetalheDTO, qtds: Record<string, string>): number {
  return oc.itens.reduce((soma, item) => {
    const digitado = Number(qtds[item.id])
    const qtd = Number.isFinite(digitado) ? digitado : item.quantidade_recebida
    return soma + qtd * item.preco_unitario
  }, 0)
}

export function OcDetalheModal({ idioma, ocId, onClose, onEditar, onStatusChanged }: Props) {
  const m = getMessages(idioma)
  const c = m.compras

  const [oc, setOc] = useState<OcDetalheDTO | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [qtdsRecebidas, setQtdsRecebidas] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    obterOrdemCompraDetalhe(ocId).then((r) => {
      if (!ativo) return
      if (r.success) {
        setOc(r.data)
        const qtds: Record<string, string> = {}
        r.data.itens.forEach((i) => {
          qtds[i.id] = String(i.quantidade_recebida)
        })
        setQtdsRecebidas(qtds)
      }
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [ocId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) {
        if (confirmandoCancelamento) {
          setConfirmandoCancelamento(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPending, onClose, confirmandoCancelamento])

  function handleAvancarStatus(novoStatus: StatusOC) {
    if (!oc || isPending) return
    startTransition(async () => {
      try {
        const r = await atualizarStatusOC(oc.id, novoStatus)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: c.toast_status })
        onStatusChanged()
        onClose()
      } catch {
        emitGerenteToast({ kind: 'error', message: m.comum.erro })
      }
    })
  }

  function handleCancelar() {
    handleAvancarStatus('CANCELADA')
    setConfirmandoCancelamento(false)
  }

  function handleRecebimento() {
    if (!oc || isPending) return
    const itensRecebidos = oc.itens.map((i) => ({
      item_id: i.id,
      quantidade_recebida: parseFloat(qtdsRecebidas[i.id] ?? '0') || 0,
    }))
    startTransition(async () => {
      try {
        const r = await registrarRecebimentoOC(oc.id, itensRecebidos)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: c.toast_recebimento })
        onStatusChanged()
        onClose()
      } catch {
        emitGerenteToast({ kind: 'error', message: m.comum.erro })
      }
    })
  }

  /**
   * A nota vinculada, uma vez CONCLUIDA, já creditou o estoque desta compra.
   * `receber_ordem_compra` recusa com `OC_NFE_JA_CREDITADA` — a tela deixa de
   * oferecer a ação em vez de deixar o operador esbarrar no erro.
   */
  const nfeJaCreditou = Boolean(oc?.nfe_id) && String(oc?.nfe_status ?? '').toUpperCase() === 'CONCLUIDA'
  const podeEditar = oc && ['RASCUNHO', 'CONFIRMADA'].includes(oc.status)
  const podeCancelar = oc && ['RASCUNHO', 'CONFIRMADA', 'EM_TRANSITO'].includes(oc.status)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-8"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/60"
        onClick={isPending ? undefined : onClose}
        aria-hidden
      />
      <div className="dragon-elev-2 relative z-10 w-full max-w-xl overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-3.5">
          <h2 className="text-base font-semibold app-surface-text">{c.modal_detalhe_titulo}</h2>
          <div className="flex items-center gap-2">
            {podeEditar && (
              <button
                type="button"
                onClick={() => oc && onEditar(oc)}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-jl-fg-3 transition hover:bg-white/[0.06] hover:text-jl-fg-1 disabled:opacity-40"
              >
                <Edit2 className="h-3.5 w-3.5" aria-hidden />
                {c.btn_editar}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              aria-label="Fechar"
              className="rounded-md p-1 text-jl-fg-3 transition hover:bg-white/[0.06] hover:text-jl-fg-1 disabled:opacity-40"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          {carregando && (
            <div className="py-12 text-center text-sm text-jl-fg-3">{m.comum.carregando}</div>
          )}

          {!carregando && !oc && (
            <div className="py-12 text-center text-sm text-jl-fg-3">{m.comum.erro}</div>
          )}

          {!carregando && oc && (
            <>
              {/* Metadados */}
              <div className="rounded-xl border border-jl-border-1 bg-jl-surface-base/60 px-4 py-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-xs text-jl-fg-3">{idCurto(oc.id)}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', STATUS_CORES[oc.status])}>
                    {c[`status_${oc.status}` as keyof typeof c]}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-xs text-jl-fg-3">{c.field_fornecedor}</dt>
                  <dd className="text-right text-sm text-jl-fg-1">{oc.fornecedor_nome ?? '—'}</dd>
                  <dt className="text-xs text-jl-fg-3">{c.col_emissao}</dt>
                  <dd className="text-right text-sm tabular-nums text-jl-fg-1">{fmtData(oc.data_emissao)}</dd>
                  <dt className="text-xs text-jl-fg-3">{c.col_previsto}</dt>
                  <dd className="text-right text-sm tabular-nums text-jl-fg-1">{fmtData(oc.data_prevista_chegada)}</dd>
                  <dt className="text-xs text-jl-fg-3">{c.field_data_vencimento_curto}</dt>
                  <dd className="text-right text-sm tabular-nums text-jl-fg-1">{fmtData(oc.data_vencimento)}</dd>
                  <dt className="text-xs text-jl-fg-3">{c.col_total}</dt>
                  <dd className="text-right text-sm font-semibold tabular-nums text-jl-fg-1">{formatBRL(oc.valor_total)}</dd>
                  {oc.observacao && (
                    <>
                      <dt className="text-xs text-jl-fg-3">{c.field_observacao}</dt>
                      <dd className="text-right text-xs text-jl-fg-2">{oc.observacao}</dd>
                    </>
                  )}
                </dl>
              </div>

              {/* Itens */}
              <div>
                <div className="mb-2 text-xs font-semibold text-jl-fg-2">{c.field_itens_titulo}</div>
                <div className="overflow-hidden rounded-xl border border-jl-border-1">
                  {oc.itens.map((item, idx) => (
                    <div
                      key={item.id}
                      className={cn('px-4 py-3', idx > 0 && 'border-t border-white/[0.06]')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-jl-fg-1">
                            {item.produto_nome ?? item.descricao ?? '—'}
                          </div>
                          <div className="mt-0.5 text-xs text-jl-fg-3">
                            {item.unidade_medida} · {formatBRL(item.preco_unitario)}/un
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm tabular-nums text-jl-fg-1">
                            {item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                          </div>
                          <div className="text-xs tabular-nums text-jl-fg-3">
                            {formatBRL(item.quantidade * item.preco_unitario)}
                          </div>
                        </div>
                      </div>

                      {/* Recebimento inline para EM_TRANSITO */}
                      {oc.status === 'EM_TRANSITO' && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-jl-fg-3">{c.field_qtd_recebida}:</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            max={item.quantidade}
                            value={qtdsRecebidas[item.id] ?? '0'}
                            onChange={(e) =>
                              setQtdsRecebidas((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            disabled={isPending}
                            aria-label={`${c.field_qtd_recebida} — ${item.produto_nome ?? item.descricao ?? ''}`}
                            className="app-input w-24 rounded-md px-2 py-1 text-right text-sm tabular-nums disabled:opacity-60"
                          />
                          <span className="text-[10px] text-jl-fg-3">/ {item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span>
                        </div>
                      )}

                      {/* Progresso de recebimento para status terminal */}
                      {(oc.status === 'RECEBIDA' || oc.status === 'CANCELADA') && item.quantidade_recebida > 0 && (
                        <div className="mt-1.5 text-xs text-emerald-400">
                          {c.field_qtd_recebida}: {item.quantidade_recebida.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Vínculo com NF-e: o banco já barra o duplo crédito
                  (`OC_NFE_JA_CREDITADA`), mas o operador só descobria isso ao
                  clicar em Receber e tomar o erro. Agora a tela diz ANTES. */}
              {oc.nfe_id ? (
                <div
                  className={cn(
                    'flex gap-2.5 rounded-xl border px-4 py-3',
                    nfeJaCreditou
                      ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-soft)]',
                  )}
                  role="note"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-strong)]" aria-hidden />
                  <div className="flex-1 space-y-1.5 text-xs">
                    <p className="font-semibold text-jl-fg-1">
                      {nfeJaCreditou ? c.nfe_ja_creditou_titulo : c.nfe_vinculada_titulo}
                    </p>
                    <p className="text-jl-fg-2">
                      {nfeJaCreditou
                        ? c.nfe_ja_creditou_texto.replace(
                            '{numero}',
                            oc.nfe_numero ? `#${oc.nfe_numero}` : '',
                          )
                        : c.nfe_vinculada_texto}
                    </p>
                    <Link
                      href={hrefImportacaoNfe(oc.nfe_id)}
                      className="inline-block font-medium text-[var(--color-warning-strong)] hover:underline"
                    >
                      {c.acao_ver_nfe}
                    </Link>
                  </div>
                </div>
              ) : null}

              {/* Consequência declarada antes de executar — inclusive quando o
                  título NÃO vai nascer (sem fornecedor cadastrado ou sem prazo
                  na ordem), que é exatamente a regra de `receber_ordem_compra`. */}
              {/* Com a nota já confirmada não existe recebimento a fazer; descrever
                  "o que acontece ao registrar o recebimento" logo abaixo do aviso
                  de bloqueio contradizia a própria tela. */}
              {oc.status === 'EM_TRANSITO' && !nfeJaCreditou ? (
                <ConsequenciaOperacao
                  titulo={c.consequencia_titulo}
                  efeitos={efeitosRecebimentoOc(c, oc, formatBRL(totalConferidoOc(oc, qtdsRecebidas)))}
                />
              ) : null}

              {oc.status === 'RECEBIDA' ? (
                <ConsequenciaOperacao
                  titulo={c.consequencia_titulo_concluida}
                  efeitos={[
                    {
                      tom: 'documento',
                      texto: oc.data_vencimento && oc.fornecedor_id
                        ? c.consequencia_recebida_com_titulo
                        : c.consequencia_recebida_sem_titulo,
                    },
                  ]}
                  acoes={
                    <>
                      <Link
                        href={ROUTES.admin.estoque}
                        className="rounded-lg border border-jl-border-1 px-3 py-1.5 text-xs font-medium text-jl-fg-2 transition hover:bg-white/[0.06]"
                      >
                        {c.ir_estoque}
                      </Link>
                      <Link
                        href={hrefFinanceiroPagar()}
                        className="rounded-lg border border-jl-border-1 px-3 py-1.5 text-xs font-medium text-jl-fg-2 transition hover:bg-white/[0.06]"
                      >
                        {c.ir_contas_pagar}
                      </Link>
                    </>
                  }
                />
              ) : null}

              {/* Confirmação de cancelamento */}
              {confirmandoCancelamento && (
                <div className="flex gap-2.5 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
                  <div className="flex-1 space-y-2 text-xs text-red-100/90">
                    <p className="font-semibold text-red-200">{c.btn_cancelar_oc}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCancelar}
                        disabled={isPending}
                        className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {isPending ? m.comum.salvando : m.comum.confirmar}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoCancelamento(false)}
                        disabled={isPending}
                        className="rounded-md px-3 py-1 text-xs text-red-200/70 hover:text-red-100 disabled:opacity-50"
                      >
                        {m.comum.cancelar}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="flex flex-wrap items-center gap-2 border-t border-jl-border-1 pt-4">
                {oc.status === 'RASCUNHO' && (
                  <button
                    type="button"
                    onClick={() => handleAvancarStatus('CONFIRMADA')}
                    disabled={isPending}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isPending ? m.comum.salvando : c.btn_confirmar_oc}
                  </button>
                )}
                {oc.status === 'CONFIRMADA' && (
                  <button
                    type="button"
                    onClick={() => handleAvancarStatus('EM_TRANSITO')}
                    disabled={isPending}
                    className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
                  >
                    {isPending ? m.comum.salvando : c.btn_em_transito}
                  </button>
                )}
                {oc.status === 'EM_TRANSITO' && !nfeJaCreditou && (
                  <button
                    type="button"
                    onClick={handleRecebimento}
                    disabled={isPending}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isPending ? m.comum.salvando : c.btn_registrar_recebimento}
                  </button>
                )}

                <div className="flex-1" />

                {podeCancelar && !confirmandoCancelamento && (
                  <button
                    type="button"
                    onClick={() => setConfirmandoCancelamento(true)}
                    disabled={isPending}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                  >
                    {c.btn_cancelar_oc}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
