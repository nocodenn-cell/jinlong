'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { History, RotateCcw } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { MotivoOperacaoModal, SituacaoTituloBadge } from '@/components/ui/admin-v2'
import type { SituacaoTituloLabels } from '@/components/ui/admin-v2'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL, fmtGerenteDateTime } from '@/lib/format/gerenteValues'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { hojeYmd, saldoTitulo, situacaoTitulo } from '@shared-core/src/financial'
import type { PayablePagamentoRow } from '@shared-core/src/financial'
import {
  estornarPagamentoContaPagarAction,
  listarPagamentosContaPagarAction,
  type ContaPagarRow,
} from './actions'

/**
 * Histórico de um título a pagar — pagamentos, estornos e o saldo resultante.
 *
 * A tabela `contas_pagar_pagamentos` e a RPC `estornar_pagamento_contas_pagar`
 * existiam desde o P1-4 **sem nenhum caminho de UI**: corrigir um pagamento
 * lançado errado exigia SQL. Este modal só dá porta a elas.
 *
 * O ledger é append-only: estornar não apaga o pagamento, insere uma linha de
 * ESTORNO apontando para ele. Por isso o pagamento estornado continua visível,
 * riscado — quem audita precisa ver que existiu.
 */

type Props = Readonly<{
  idioma: Idioma
  locale: string
  conta: ContaPagarRow
  situacaoLabels: SituacaoTituloLabels
  onClose: () => void
  /** Propaga o novo estado do título para a lista, sem refetch da página. */
  onEstornado: (patch: { status: string; valor_pago: number }) => void
}>

export function HistoricoPagamentosModal({
  idioma,
  locale,
  conta,
  situacaoLabels,
  onClose,
  onEstornado,
}: Props) {
  const m = getMessages(idioma)
  const t = m.contas_pagar

  const [pagamentos, setPagamentos] = useState<PayablePagamentoRow[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [alvoEstorno, setAlvoEstorno] = useState<PayablePagamentoRow | null>(null)
  const [pending, startTransition] = useTransition()

  const carregar = useCallback(async () => {
    const r = await listarPagamentosContaPagarAction(conta.id)
    if (!r.ok) {
      setErro(r.error)
      setPagamentos([])
      return
    }
    setErro(null)
    setPagamentos(r.pagamentos)
  }, [conta.id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Um pagamento só pode ser estornado uma vez. O vínculo é `operacao_origem_id`
  // na linha de ESTORNO — a mesma leitura que o lado a receber já faz.
  const estornados = new Set(
    (pagamentos ?? [])
      .filter((p) => p.operacaoTipo === 'ESTORNO' && p.operacaoOrigemId)
      .map((p) => p.operacaoOrigemId as string),
  )

  const saldo = saldoTitulo(conta.valor_total, conta.valor_pago)
  const situacao = situacaoTitulo({
    valorTotal: conta.valor_total,
    valorPago: conta.valor_pago,
    vencimento: conta.vencimento,
    status: conta.status,
    hoje: hojeYmd(),
  })

  function confirmarEstorno(motivo: string) {
    const alvo = alvoEstorno
    if (!alvo) return
    startTransition(async () => {
      const r = await estornarPagamentoContaPagarAction({
        pagamento_id: alvo.id,
        motivo,
        // Determinística por pagamento: um retry de qualquer cliente converge
        // para o mesmo comando em vez de gerar um segundo estorno.
        idempotency_key: `estorno-ap:${alvo.id}`,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setAlvoEstorno(null)
      emitGerenteToast({ kind: 'success', message: t.toast_estornado })
      onEstornado({ status: r.status, valor_pago: r.valor_pago })
      await carregar()
    })
  }

  return (
    <>
      <DragonModal
        open
        onClose={onClose}
        title={t.historico_titulo}
        subtitle={conta.descricao}
        icon={History}
        size="lg"
        closeLabel={m.comum.fechar}
        data-testid="historico-pagamentos-modal"
        footer={
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {m.comum.fechar}
          </Button>
        }
      >
        <div className="admin-v2-stack">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-surface-soft)] px-4 py-3">
            <div>
              <p className="text-caption uppercase tracking-wide text-fg-subtle">
                {t.saldo_pendente}
              </p>
              <p className="text-title font-bold tabular-nums text-fg">
                {fmtGerenteBRL(saldo, locale)}
              </p>
              <p className="mt-0.5 text-caption tabular-nums text-fg-subtle">
                {t.saldo_de} {fmtGerenteBRL(conta.valor_total, locale)} · {t.pago_label}{' '}
                {fmtGerenteBRL(conta.valor_pago, locale)}
              </p>
            </div>
            <SituacaoTituloBadge situacao={situacao} labels={situacaoLabels} />
          </div>

          {pagamentos === null ? (
            <p className="py-6 text-center text-small text-fg-muted">{t.historico_carregando}</p>
          ) : erro ? (
            <p role="alert" className="py-6 text-center text-small text-[var(--color-danger-strong)]">
              {erro}
            </p>
          ) : pagamentos.length === 0 ? (
            <p className="py-6 text-center text-small text-fg-muted">{t.historico_vazio}</p>
          ) : (
            <ul className="space-y-2">
              {pagamentos.map((p) => {
                const isEstorno = p.operacaoTipo === 'ESTORNO'
                const jaEstornado = estornados.has(p.id)
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2',
                      isEstorno
                        ? 'border-dashed border-[var(--color-border-secondary)] bg-transparent'
                        : 'border-[var(--color-border-secondary)] bg-[var(--color-surface-soft)]',
                    )}
                  >
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-small font-medium tabular-nums',
                          isEstorno ? 'text-fg-subtle line-through' : 'text-fg',
                        )}
                      >
                        {fmtGerenteBRL(p.valor, locale)}
                        <span className="ml-2 font-normal text-fg-muted">
                          {formaLabel(p.formaPagamento, t)}
                        </span>
                        {isEstorno ? (
                          <span className="ml-2 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                            {t.historico_estorno}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-caption text-fg-subtle">
                        {fmtGerenteDateTime(p.createdAt, locale)}
                        {' · '}
                        {p.observacao?.trim() || t.historico_sem_observacao}
                      </p>
                    </div>

                    {!isEstorno ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={jaEstornado || pending}
                        title={jaEstornado ? t.historico_ja_estornado : undefined}
                        onClick={() => setAlvoEstorno(p)}
                        className="gap-1.5 text-[var(--color-danger-strong)]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        {t.historico_estornar}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DragonModal>

      <MotivoOperacaoModal
        open={alvoEstorno !== null}
        pending={pending}
        labels={{
          titulo: t.estorno_titulo,
          subtitulo: t.estorno_subtitulo,
          consequenciaTitulo: t.estorno_consequencia,
          campoLabel: t.estorno_campo,
          campoPlaceholder: t.estorno_placeholder,
          erroObrigatorio: t.motivo_min,
          confirmar: t.estorno_confirmar,
          cancelar: m.comum.cancelar,
          fechar: m.comum.fechar,
          enviando: t.enviando,
        }}
        efeitos={[
          { tom: 'financeiro', texto: t.estorno_efeito_saldo },
          { tom: 'alerta', texto: t.estorno_efeito_caixa },
          { tom: 'documento', texto: t.estorno_efeito_auditoria },
        ]}
        onCancel={() => setAlvoEstorno(null)}
        onConfirm={confirmarEstorno}
      />
    </>
  )
}

function formaLabel(forma: string, t: ReturnType<typeof getMessages>['contas_pagar']): string {
  const chave = `forma_${forma.toLowerCase()}` as keyof typeof t
  const rotulo = t[chave]
  return typeof rotulo === 'string' ? rotulo : forma
}
