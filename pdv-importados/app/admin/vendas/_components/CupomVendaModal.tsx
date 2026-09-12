'use client'

import { useEffect, useRef, useState } from 'react'
import { Printer } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { CUPOM_PRINT_CSS, printNode } from '@/lib/print/printNode'
import { obterDetalheVenda, type VendaDetalhe } from '../actions'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'

/**
 * Reimpressão de cupom no back-office.
 *
 * O buraco que fecha: o PDV reimprime (F12 e histórico de caixa), mas quem
 * administra a loja não conseguia reimprimir venda nenhuma — `/admin/vendas` só
 * oferecia *Detalhes* e *Cancelar*. Cliente que volta pedindo a via do cupom
 * dependia de o caixa daquele terminal ainda ter a venda em memória.
 *
 * **Não é um segundo sistema de impressão.** Usa `printNode` — o mesmo
 * mecanismo de iframe oculto do `CaixaReciboModal` — com a mesma folha de
 * estilo, para o papel sair igual ao do PDV.
 *
 * Diferenças deliberadas em relação ao cupom do PDV:
 * - **Sem impressora térmica.** A térmica é conectada ao terminal de caixa
 *   (`useThermalPrinter` fala com o hardware daquela estação). No Admin, que
 *   roda em qualquer máquina, oferecer o botão prometeria o que não se cumpre.
 * - **Marcado como 2ª via**, e venda cancelada sai com o aviso no papel — um
 *   cupom reimpresso não pode passar por comprovante original de uma venda que
 *   não existe mais.
 */

type Props = Readonly<{
  vendaId: string | null
  idioma: Idioma
  locale: string
  onClose: () => void
}>

function formatMoney(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(v)
}

export function CupomVendaModal({ vendaId, idioma, locale, onClose }: Props) {
  const m = getMessages(idioma)
  const c = m.admin_ui
  const printRef = useRef<HTMLDivElement>(null)
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!vendaId) {
      setVenda(null)
      setErro(null)
      return
    }
    let vivo = true
    setCarregando(true)
    setErro(null)
    obterDetalheVenda(vendaId)
      .then((d) => {
        if (!vivo) return
        if (d) setVenda(d)
        else setErro(c.cupom_erro)
      })
      .catch(() => {
        if (vivo) setErro(c.cupom_erro)
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [vendaId, c.cupom_erro])

  if (!vendaId) return null

  const cancelada = String(venda?.status ?? '').toUpperCase() === 'CANCELADA'

  return (
    <DragonModal
      open
      onClose={onClose}
      title={c.cupom_titulo}
      subtitle={venda ? `#${venda.id.slice(0, 8).toUpperCase()}` : undefined}
      icon={Printer}
      size="sm"
      closeLabel={m.comum.fechar}
      data-testid="cupom-venda-modal"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {m.comum.fechar}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!venda}
            onClick={() => printNode(printRef.current, CUPOM_PRINT_CSS)}
          >
            {c.cupom_imprimir}
          </Button>
        </>
      }
    >
      {carregando ? <p className="py-6 text-center text-caption text-jl-fg-3">{m.comum.carregando}</p> : null}
      {erro ? <p className="py-6 text-center text-caption text-destructive">{erro}</p> : null}

      {venda ? (
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
          {/*
           * Este bloco é o que vai para o papel — as classes casam com
           * `CUPOM_PRINT_CSS`. A prévia usa tokens do tema, e não cor sólida
           * fixa, porque a tela do admin acompanha claro/escuro; quem garante
           * papel branco com tinta preta é a folha de impressão.
           */}
          <div ref={printRef} className="mx-auto w-[300px] font-mono text-[12px] text-jl-fg-1">
            <div className="recibo-header">
              <h1>{c.cupom_titulo}</h1>
              <p className="recibo-id">
                #{venda.id.slice(0, 8).toUpperCase()}
                {venda.numero_nf ? ` · NF ${venda.numero_nf}` : ''}
              </p>
              <p>
                {venda.data ? new Date(venda.data).toLocaleString(locale) : '—'}
                {venda.operador_nome ? ` · ${venda.operador_nome}` : ''}
              </p>
            </div>

            <p className="recibo-aviso">{c.cupom_segunda_via}</p>
            {cancelada ? <p className="recibo-aviso">{c.cupom_cancelada}</p> : null}

            <div className="recibo-itens">
              {venda.itens.map((it) => (
                <div className="recibo-item" key={it.id}>
                  <div className="recibo-item-nome">{it.nome}</div>
                  <div className="recibo-item-detalhe">
                    <span>
                      {it.quantidade} × {formatMoney(it.preco_unitario, locale)}
                    </span>
                    <span>{formatMoney(it.subtotal, locale)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="recibo-totais">
              <div className="recibo-linha">
                <span>{c.cupom_bruto}</span>
                <span>{formatMoney(venda.total_bruto, locale)}</span>
              </div>
              {venda.total_desconto > 0 ? (
                <div className="recibo-linha">
                  <span>{c.cupom_desconto}</span>
                  <span>- {formatMoney(venda.total_desconto, locale)}</span>
                </div>
              ) : null}
              <div className="recibo-linha total">
                <span>{c.cupom_total}</span>
                <span>{formatMoney(venda.total_liquido, locale)}</span>
              </div>
            </div>

            <div className="recibo-pgto">
              <div className="recibo-linha">
                <span>{c.cupom_pagamento}</span>
                <span>{venda.forma_pagamento ?? '—'}</span>
              </div>
            </div>

            <div className="recibo-footer">{c.cupom_rodape}</div>
          </div>
        </div>
      ) : null}
    </DragonModal>
  )
}
