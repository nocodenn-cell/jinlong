'use client'

import { useEffect, useMemo, useState } from 'react'
import { CaixaReciboModal } from '@/app/caixa/CaixaReciboModal'
import { obterNomeLojaAtual } from '@/app/caixa/actions'
import { useThermalPrinter } from '@/hooks/useThermalPrinter'
import { vendaAdminParaRecibo } from '@/lib/caixa/reciboVendaAdmin'
import type { Mensagens } from '@/i18n/getMessages'
import type { VendaDetalhe } from '../actions'

/** 2ª via do cupom de uma venda concluída, aberta a partir do detalhe da venda no admin. */
export function VendaReimpressaoModal({
  venda,
  m,
  onClose,
}: Readonly<{ venda: VendaDetalhe; m: Mensagens; onClose: () => void }>) {
  const thermal = useThermalPrinter()
  const [lojaNome, setLojaNome] = useState<string | null>(null)
  const recibo = useMemo(() => vendaAdminParaRecibo(venda, m.caixa.moeda_prefixo), [venda, m])

  useEffect(() => {
    let cancelado = false
    void obterNomeLojaAtual()
      .then((r) => {
        if (!cancelado && r.ok) setLojaNome(r.nome)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [])

  return (
    <CaixaReciboModal
      venda={recibo}
      lojaNome={lojaNome}
      segundaVia
      m={m}
      onClose={onClose}
      thermal={thermal}
    />
  )
}
