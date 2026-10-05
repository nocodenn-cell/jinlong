'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { adminImportNfeImportacaoQuery } from '@/lib/navigation/routes'
import { listarPagamentosContaAction, type ContaPagarRow, type PagamentoContaRow } from './actions'

type Props = {
  conta: ContaPagarRow; idioma: Idioma; locale: string
  podePagar: boolean; onClose: () => void; onPagamento: () => void
}

function HistoricoPagamentos({ contaId, locale }: { contaId: string; locale: string }) {
  const [pagamentos, setPagamentos] = useState<PagamentoContaRow[]>([])
  const [aviso, setAviso] = useState('Carregando pagamentos…')
  useEffect(() => {
    let ativo = true
    void listarPagamentosContaAction(contaId).then((r) => {
      if (!ativo) return
      if (r.ok) { setPagamentos(r.pagamentos); setAviso(r.pagamentos.length ? '' : 'Nenhum pagamento registrado.') }
      else setAviso(r.error)
    }).catch(() => {
      if (ativo) setAviso('Não foi possível carregar os pagamentos. Reabra o título para tentar novamente.')
    })
    return () => { ativo = false }
  }, [contaId])
  return <section className="mt-6 border-t border-[var(--color-border)] pt-4">
    <h3 className="text-body font-semibold">Histórico de pagamentos</h3>
    {aviso ? <p role="status" className="mt-2 text-caption">{aviso}</p> : null}
    <ul className="mt-3 space-y-3">{pagamentos.map(p => <li key={p.id} className="flex flex-wrap justify-between gap-2 text-body">
      <span>{new Intl.DateTimeFormat(locale, { timeZone: 'America/Sao_Paulo' }).format(new Date(p.data))} · {p.forma} · {p.tipo}</span>
      <strong className="tabular-nums">{fmtGerenteBRL(p.valor, locale)}</strong>
    </li>)}</ul>
  </section>
}

export function ContaPagarDetalhe({ conta, idioma, locale, podePagar, onClose, onPagamento }: Props) {
  const m = getMessages(idioma)
  const labels = m.contas_pagar
  const status = labels[`status_${conta.status.toLowerCase()}` as keyof typeof labels] ?? conta.status
  const campos = [
    [labels.col_fornecedor, conta.fornecedor_nome ?? '—'],
    [labels.col_descricao, conta.descricao || '—'],
    [labels.modal_total, fmtGerenteBRL(conta.valor_total, locale)],
    [labels.modal_pago, fmtGerenteBRL(conta.valor_pago, locale)],
    [labels.modal_aberto, fmtGerenteBRL(conta.valor_total - conta.valor_pago, locale)],
    [labels.col_vencimento, conta.vencimento ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(new Date(`${conta.vencimento}T12:00:00Z`)) : '—'],
    [labels.col_status, `${status} (${conta.status})`],
  ]
  return <DragonModal open size="lg" sheet title={conta.descricao || conta.fornecedor_nome || labels.col_descricao}
    onClose={onClose} closeLabel={m.comum.fechar} footer={<>
      <Button type="button" variant="secondary" onClick={onClose}>{m.comum.fechar}</Button>
      {podePagar ? <Button type="button" onClick={onPagamento}>{labels.registrar_pagamento}</Button> : null}
    </>}>
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {campos.map(([label, value]) => <div key={label}><dt className="text-caption text-fg-muted">{label}</dt>
        <dd className="mt-1 text-body font-semibold">{value}</dd></div>)}
    </dl>
    {conta.nfe_importacao_id ? <Link className="mt-4 inline-block underline" href={adminImportNfeImportacaoQuery(conta.nfe_importacao_id)}>
      NF-e {conta.nfe_numero ? `#${conta.nfe_numero}` : ''}
    </Link> : null}
    <HistoricoPagamentos contaId={conta.id} locale={locale} />
  </DragonModal>
}
