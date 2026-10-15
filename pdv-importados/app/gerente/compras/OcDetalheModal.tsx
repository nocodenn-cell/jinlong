'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/lib/navigation/routes'
import { Edit2, AlertTriangle } from 'lucide-react'
import { getMessages } from '@/i18n/getMessages'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { DragonModal } from '@/components/ui/DragonModal'
import { formatBRL } from '@/lib/format/money'
import {
  obterOrdemCompraDetalhe,
  atualizarStatusOC,
  encerrarOrdemCompraComFalta,
  type OcDetalheDTO,
  type StatusOC,
} from './actions'
import {
  fmtQtd,
  ocAceitaRecebimento,
  ocPodeCancelar,
  ocPodeEncerrarComFalta,
  situacaoRecebimento,
} from './ocRecebimento'

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

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function idCurto(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function OcDetalheModal({ idioma, ocId, onClose, onEditar, onStatusChanged }: Props) {
  const m = getMessages(idioma)
  const c = m.compras

  const [oc, setOc] = useState<OcDetalheDTO | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const carregar = useCallback(async (): Promise<OcDetalheDTO | null> => {
    const r = await obterOrdemCompraDetalhe(ocId)
    if (!r.success) return null
    setOc(r.data)
    return r.data
  }, [ocId])

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    obterOrdemCompraDetalhe(ocId).then((r) => {
      if (!ativo) return
      if (r.success) setOc(r.data)
      setCarregando(false)
    })
    return () => {
      ativo = false
    }
  }, [ocId])

  // ESC em dois níveis: com uma confirmação inline aberta, o ESC só sai dela. Fechar a gaveta
  // (ESC/backdrop sem confirmação aberta) é do DragonModal — ver `dismissable` abaixo.
  useEffect(() => {
    if (!confirmandoCancelamento && !encerrando) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isPending) return
      if (confirmandoCancelamento) setConfirmandoCancelamento(false)
      else setEncerrando(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPending, confirmandoCancelamento, encerrando])

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

  function handleEncerrarComFalta() {
    if (!oc || isPending) return
    if (motivo.trim().length < 5) {
      emitGerenteToast({ kind: 'error', message: c.encerrar_motivo_curto })
      return
    }
    startTransition(async () => {
      try {
        const r = await encerrarOrdemCompraComFalta(oc.id, motivo)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: c.toast_encerrada })
        setEncerrando(false)
        setMotivo('')
        await carregar()
        onStatusChanged()
      } catch {
        emitGerenteToast({ kind: 'error', message: m.comum.erro })
      }
    })
  }

  const podeEditar = oc && ['RASCUNHO', 'CONFIRMADA'].includes(oc.status) && oc.recebido_total <= 0
  const podeCancelar = oc ? ocPodeCancelar(oc) : false
  const podeReceber = oc ? ocAceitaRecebimento(oc.status, oc.pendente_total) : false
  const podeEncerrarFalta = oc ? ocPodeEncerrarComFalta(oc) : false
  const situacao = oc ? situacaoRecebimento(oc) : null
  const mostraRecebimento = oc != null && oc.status !== 'RASCUNHO' && oc.status !== 'CANCELADA'

  function textoResumo(o: OcDetalheDTO): string {
    if (o.encerrada_com_falta) return fmtTemplate(c.resumo_encerrado_falta, { n: fmtQtd(o.pendente_total) })
    // Pedido legado encerrado por um único recebimento que ficou abaixo do pedido: não é "completo".
    if (o.status === 'RECEBIDA') {
      return o.pendente_total > 0
        ? fmtTemplate(c.resumo_encerrado_incompleto, { n: fmtQtd(o.pendente_total) })
        : c.resumo_completo
    }
    if (o.recebido_total <= 0) return c.resumo_nada
    return fmtTemplate(c.resumo_faltam, { n: fmtQtd(o.pendente_total) })
  }

  const acoes =
    !carregando && oc ? (
      <div className="flex w-full flex-wrap items-center gap-2">
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
        {podeReceber && (
          <Link href={`${ROUTES.admin.estoqueRecebimento}?modo=pedido&oc=${oc.id}`}
            data-testid="oc-btn-registrar-recebimento"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            {idioma === 'pt' ? 'Receber em Entradas' : '前往入库验收'}
          </Link>
        )}

        <div className="flex-1" />
        {podeEditar && (
          <button
            type="button"
            onClick={() => onEditar(oc)}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-jl-fg-3 transition hover:bg-white/[0.06] hover:text-jl-fg-1 disabled:opacity-40"
          >
            <Edit2 className="h-3.5 w-3.5" aria-hidden />
            {c.btn_editar}
          </button>
        )}

        {podeEncerrarFalta && !encerrando && (
          <button
            type="button"
            onClick={() => setEncerrando(true)}
            disabled={isPending}
            data-testid="oc-btn-encerrar-falta"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10 hover:text-amber-200 disabled:opacity-40"
          >
            {c.btn_encerrar_falta}
          </button>
        )}
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
    ) : undefined

  return (
    <DragonModal
      open
      placement="drawer"
      size="lg"
      title={c.modal_detalhe_titulo}
      // Nada fecha a gaveta enquanto uma ação grava, nem com uma confirmação inline aberta.
      dismissable={!isPending && !confirmandoCancelamento && !encerrando}
      onClose={() => {
        if (!isPending) onClose()
      }}
      footer={acoes}
    >
      <div className="space-y-4">
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

            {/* Situação do recebimento: pedido / recebido / pendente */}
            {mostraRecebimento && (
              <div
                className="rounded-xl border border-jl-border-1 bg-jl-surface-base/60 px-4 py-3"
                data-testid="oc-resumo-recebimento"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-jl-fg-2">{c.col_recebimento}</span>
                  {situacao && situacao !== 'NADA_RECEBIDO' && (
                    <span className="text-[11px] text-jl-fg-3">
                      {c[`situacao_${situacao}` as keyof typeof c]}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm tabular-nums text-jl-fg-1">
                  {fmtTemplate(c.resumo_recebido_de, {
                    recebido: fmtQtd(oc.recebido_total),
                    pedido: fmtQtd(oc.pedido_total),
                  })}
                </div>
                <div
                  className={cn(
                    'text-sm font-medium',
                    oc.pendente_total > 0 && !oc.encerrada_com_falta ? 'text-amber-300' : 'text-emerald-300',
                  )}
                  data-testid="oc-resumo-saldo"
                >
                  {textoResumo(oc)}
                </div>
                {oc.encerrada_com_falta && oc.encerramento_motivo && (
                  <div className="mt-1 text-xs text-jl-fg-3" data-testid="oc-motivo-encerramento">
                    {fmtTemplate(c.encerrada_por_falta_info, { motivo: oc.encerramento_motivo })}
                  </div>
                )}
              </div>
            )}

            {/* Itens */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-jl-fg-2">{c.field_itens_titulo}</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-jl-border-1">
                {oc.itens.map((item, idx) => {
                  return (
                    <div
                      key={item.id}
                      className={cn('px-4 py-3', idx > 0 && 'border-t border-white/[0.06]')}
                      data-testid={`oc-item-${item.id}`}
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
                        <div className="text-right text-xs tabular-nums text-jl-fg-3">
                          {formatBRL(item.quantidade * item.preco_unitario)}
                        </div>
                      </div>

                      {/* Pedido / Recebido / Pendente */}
                      {mostraRecebimento ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
                          <div>
                            <div className="text-[10px] text-jl-fg-3">{c.item_pedido}</div>
                            <div className="text-sm text-jl-fg-1">{fmtQtd(item.quantidade)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-jl-fg-3">{c.item_recebido}</div>
                            <div className="text-sm text-emerald-300">{fmtQtd(item.quantidade_recebida)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-jl-fg-3">{c.item_pendente}</div>
                            <div
                              className={cn(
                                'text-sm',
                                item.saldo_pendente > 0 && !oc.encerrada_com_falta ? 'text-amber-300' : 'text-jl-fg-3',
                              )}
                            >
                              {fmtQtd(item.saldo_pendente)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-sm tabular-nums text-jl-fg-1">
                          {c.item_pedido}: {fmtQtd(item.quantidade)}
                        </div>
                      )}

                    </div>
                  )
                })}
              </div>
            </div>

            {/* Histórico de entradas ligadas ao pedido */}
            {mostraRecebimento && (
              <div data-testid="oc-entradas">
                <div className="mb-2 text-xs font-semibold text-jl-fg-2">{c.entradas_titulo}</div>
                {oc.entradas.length === 0 ? (
                  <div className="text-xs text-jl-fg-3">{c.entradas_vazio}</div>
                ) : (
                  <ul className="space-y-1.5">
                    {oc.entradas.map((e) => (
                      <li
                        key={e.entrada_id}
                        className="rounded-lg border border-white/[0.06] px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-jl-fg-1">
                            {c[`entrada_origem_${e.origem}` as keyof typeof c]}
                          </span>
                          <span className="tabular-nums text-jl-fg-3">
                            {e.legado ? c.entrada_legado : fmtDataHora(e.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-jl-fg-2">
                          {e.itens.map((it) => `${it.nome}: +${fmtQtd(it.quantidade)}`).join(' · ')}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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

            {/* Confirmação de "encerrar com falta" (motivo obrigatório, auditável) */}
            {encerrando && (
              <div
                className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3"
                data-testid="oc-encerrar-falta"
              >
                <p className="text-xs font-semibold text-amber-200">{c.encerrar_titulo}</p>
                <p className="text-xs text-amber-100/90">
                  {fmtTemplate(c.encerrar_texto, { n: fmtQtd(oc.pendente_total) })}
                </p>
                <label htmlFor="oc-motivo-falta" className="block text-[11px] text-amber-100/80">
                  {c.encerrar_motivo_label}
                </label>
                <textarea
                  id="oc-motivo-falta"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={c.encerrar_motivo_placeholder}
                  rows={2}
                  maxLength={500}
                  disabled={isPending}
                  className="app-input w-full rounded-md px-2 py-1.5 text-sm disabled:opacity-60"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleEncerrarComFalta}
                    disabled={isPending || motivo.trim().length < 5}
                    className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                  >
                    {isPending ? m.comum.salvando : c.btn_confirmar_encerramento}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEncerrando(false)}
                    disabled={isPending}
                    className="rounded-md px-3 py-1 text-xs text-amber-100/70 hover:text-amber-50 disabled:opacity-50"
                  >
                    {m.comum.cancelar}
                  </button>
                </div>
              </div>
            )}

            {/* Lançar a mesma mercadoria por outro caminho SEM escolher este pedido credita o
                estoque duas vezes; lançando COM o pedido, o saldo abate (e o banco recusa excesso). */}
            {podeReceber && (
              <p
                className="flex items-start gap-1.5 text-xs text-jl-fg-3"
                data-testid="oc-aviso-recebimento-duplicidade"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{idioma === 'pt' ? 'Registre a entrega em Entradas. Se a nota chegar depois, associe-a à entrega recebida sem lançar estoque novamente.' : '请在入库页面登记交货。发票后到时，关联已收货记录，请勿重复入库。'}</span>
              </p>
            )}

            {oc.status === 'EM_TRANSITO' && oc.recebido_total > 0 && (
              <p className="text-xs text-jl-fg-3" data-testid="oc-cancelar-bloqueado">
                {c.cancelar_bloqueado_recebido}
              </p>
            )}

          </>
        )}
      </div>
    </DragonModal>
  )
}
