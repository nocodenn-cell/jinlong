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
import { hojeYmd, situacaoTitulo } from '@shared-core/src/financial'
import type { ReceivableLiquidacaoRow } from '@shared-core/src/financial'
import {
  estornarLiquidacaoReceber,
  listarLiquidacoesReceber,
} from '@/app/gerente/financeiro/actions'
import type { ContaLinha } from './ContasReceberTable'
import { formaLabel } from './ReceberTituloModal'

/**
 * Histórico de um título a receber — recebimentos, estornos e o saldo resultante.
 *
 * Gêmeo do `HistoricoPagamentosModal` do lado a pagar. O que existia antes era
 * um "Histórico" que expandia dentro da linha, só nos 8 primeiros títulos, e
 * pedia o motivo do estorno por `window.prompt`.
 *
 * O ledger é append-only: estornar insere uma linha de ESTORNO apontando para o
 * recebimento de origem. O recebimento estornado continua visível, riscado —
 * quem audita precisa ver que existiu.
 */

type Props = Readonly<{
  idioma: Idioma
  locale: string
  titulo: ContaLinha
  situacaoLabels: SituacaoTituloLabels
  onClose: () => void
  /** Estorno mexe no saldo do título — a página recarrega para refletir. */
  onEstornado: () => void
}>

export function HistoricoRecebimentosModal({
  idioma,
  locale,
  titulo,
  situacaoLabels,
  onClose,
  onEstornado,
}: Props) {
  const m = getMessages(idioma)
  const t = m.contas_receber

  const [liquidacoes, setLiquidacoes] = useState<ReceivableLiquidacaoRow[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [alvoEstorno, setAlvoEstorno] = useState<ReceivableLiquidacaoRow | null>(null)
  const [pending, startTransition] = useTransition()

  const carregar = useCallback(async () => {
    const r = await listarLiquidacoesReceber(titulo.id)
    if (!r.success) {
      setErro(r.error)
      setLiquidacoes([])
      return
    }
    setErro(null)
    setLiquidacoes(r.data)
  }, [titulo.id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const estornados = new Set(
    (liquidacoes ?? [])
      .filter((l) => l.operacaoTipo === 'ESTORNO' && l.operacaoOrigemId)
      .map((l) => l.operacaoOrigemId as string),
  )

  const situacao = situacaoTitulo({
    valorTotal: titulo.valor_total,
    valorPago: titulo.valor_pago,
    vencimento: titulo.vencimento,
    status: titulo.status,
    hoje: hojeYmd(),
  })

  function confirmarEstorno(motivo: string) {
    const alvo = alvoEstorno
    if (!alvo) return
    startTransition(async () => {
      const r = await estornarLiquidacaoReceber({
        liquidacao_id: alvo.id,
        motivo,
        // Determinística por liquidação: retry de qualquer cliente converge
        // para o mesmo comando em vez de gerar um segundo estorno.
        idempotency_key: `estorno-ar:${alvo.id}`,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setAlvoEstorno(null)
      emitGerenteToast({ kind: 'success', message: t.toast_estornado })
      await carregar()
      onEstornado()
    })
  }

  return (
    <>
      <DragonModal
        open
        onClose={onClose}
        title={t.historico_titulo}
        subtitle={titulo.cliente_nome}
        icon={History}
        size="lg"
        closeLabel={m.comum.fechar}
        data-testid="historico-recebimentos-modal"
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
                {fmtGerenteBRL(titulo.valor_aberto, locale)}
              </p>
              <p className="mt-0.5 text-caption tabular-nums text-fg-subtle">
                {t.saldo_de} {fmtGerenteBRL(titulo.valor_total, locale)} · {t.pago_label}{' '}
                {fmtGerenteBRL(titulo.valor_pago, locale)}
              </p>
            </div>
            <SituacaoTituloBadge situacao={situacao} labels={situacaoLabels} />
          </div>

          {liquidacoes === null ? (
            <p className="py-6 text-center text-small text-fg-muted">{t.historico_carregando}</p>
          ) : erro ? (
            <p role="alert" className="py-6 text-center text-small text-[var(--color-danger-strong)]">
              {erro}
            </p>
          ) : liquidacoes.length === 0 ? (
            <p className="py-6 text-center text-small text-fg-muted">{t.historico_vazio}</p>
          ) : (
            <ul className="space-y-2">
              {liquidacoes.map((l) => {
                const isEstorno = l.operacaoTipo === 'ESTORNO'
                const jaEstornado = estornados.has(l.id)
                return (
                  <li
                    key={l.id}
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
                        {fmtGerenteBRL(l.valor, locale)}
                        <span className="ml-2 font-normal text-fg-muted">
                          {formaLabel(l.formaPagamento, t)}
                        </span>
                        {isEstorno ? (
                          <span className="ml-2 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                            {t.historico_estorno}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-caption text-fg-subtle">
                        {fmtGerenteDateTime(l.createdAt, locale)}
                      </p>
                    </div>

                    {!isEstorno ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={jaEstornado || pending}
                        title={jaEstornado ? t.historico_ja_estornado : undefined}
                        onClick={() => setAlvoEstorno(l)}
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
