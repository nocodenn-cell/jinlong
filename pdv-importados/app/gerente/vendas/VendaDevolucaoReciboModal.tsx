'use client'

import { useRef } from 'react'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import type { DevolverVendaItemResult } from './devolverOuTrocarVenda.impl'
import { imprimirNoIframe } from '@/lib/print/imprimirNoIframe'
import type { Mensagens } from '@/i18n/getMessages'
import { Button } from '@/components/ui/button'

export type ComprovanteDevolucao = Readonly<{
  operacaoId: string
  vendaId: string
  tipo: string
  dataOperacao: Date
  itens: DevolverVendaItemResult[]
  valorEstornado: number
  formaEstornoLabel: string
  motivo: string
  operadorNome: string
}>

type Props = Readonly<{
  comprovante: ComprovanteDevolucao
  locale: string
  m: Mensagens
  onClose: () => void
}>

/** Comprovante impresso de devolução/troca — impressão via janela do navegador. */
export function VendaDevolucaoReciboModal({ comprovante: c, locale, m, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const t = m.gerente.comprovante_venda
  const titulo = c.tipo === 'TROCA' ? t.troca_titulo : t.devolucao_titulo

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return

    const PRINT_CSS = [
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      "body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 8px; width: 300px; }",
      '.comp-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }',
      '.comp-header h1 { font-size: 14px; font-weight: bold; }',
      '.comp-header p { font-size: 11px; color: #555; }',
      '.comp-item { margin-bottom: 4px; }',
      '.comp-item-nome { font-weight: bold; }',
      '.comp-item-detalhe { display: flex; justify-content: space-between; font-size: 11px; color: #444; }',
      '.comp-linha { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }',
      '.comp-linha.total { font-weight: bold; font-size: 14px; border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }',
      '.comp-footer { text-align: center; font-size: 10px; color: #888; border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }',
    ].join('\n')

    imprimirNoIframe(el, PRINT_CSS)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      data-testid="venda-devolucao-recibo-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-jl-border-1 bg-jl-surface-base shadow-xl">
        <div className="flex items-center justify-between border-b border-jl-border-1 px-4 py-3">
          <span className="text-sm font-semibold text-jl-fg-1">{titulo}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" onClick={handlePrint}>
              {m.caixa.btn_imprimir_comprovante}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              {m.caixa.btn_fechar_comprovante}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="flex flex-col gap-3 font-mono text-xs text-jl-fg-1">
            <div className="comp-header text-center border-b border-dashed border-jl-border-1 pb-3">
              <h1 className="text-sm font-bold">{titulo}</h1>
              <p className="text-jl-fg-3">{fmtGerenteDateTime(c.dataOperacao.toISOString(), locale)}</p>
              <p className="text-jl-fg-3 text-[10px]">
                {t.venda} #{fmtGerenteIdCurto(c.vendaId)} · {t.operacao_abrev} #{fmtGerenteIdCurto(c.operacaoId)}
              </p>
            </div>

            {c.itens.length > 0 && (
              <div className="comp-itens border-b border-dashed border-jl-border-1 pb-3">
                {c.itens.map((item, i) => (
                  <div key={i} className="comp-item mb-2">
                    <p className="comp-item-nome font-semibold leading-tight">{item.nome}</p>
                    <div className="comp-item-detalhe flex justify-between text-jl-fg-3">
                      <span>{item.quantidade} × {fmtGerenteBRL(item.precoUnitario, locale)}</span>
                      <span className="font-semibold text-jl-fg-1">
                        {fmtGerenteBRL(item.subtotal, locale)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="comp-linha total flex justify-between border-t border-dashed border-jl-border-1 pt-2 mt-1 font-bold text-sm">
                <span>{t.total_estornado}</span>
                <span>{fmtGerenteBRL(c.valorEstornado, locale)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-jl-fg-3">{t.forma_estorno}</span>
                <span>{c.formaEstornoLabel}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-jl-fg-3">{t.motivo}</span>
                <span className="text-right">{c.motivo}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-jl-fg-3">{t.operador}</span>
                <span>{c.operadorNome}</span>
              </div>
            </div>

            <div className="comp-footer border-t border-dashed border-jl-border-1 pt-3 text-center text-jl-fg-3">
              <p>{m.caixa.recibo.rodape_nao_fiscal}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
