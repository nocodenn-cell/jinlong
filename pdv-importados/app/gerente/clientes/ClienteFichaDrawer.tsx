'use client'

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Receipt, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'
import type { ClienteListRow } from '@/app/admin/clientes/actions'
import { resumoFinanceiroClienteAction } from '@/app/admin/clientes/actions'
import { limiteDisponivel } from '@/app/admin/clientes/clienteFinanceiroResumo'
import { maskDocumentoDisplay, maskTelefoneDisplay } from './clienteDisplayFormat'

type Aba = 'resumo' | 'compras' | 'financeiro'

type Props = {
  cliente: ClienteListRow
  locale: string
  messages: Mensagens
  onClose: () => void
  onEditar: () => void
}

export function ClienteFichaDrawer({ cliente, locale, messages, onClose, onEditar }: Props) {
  const m = messages.clientes
  const [aba, setAba] = useState<Aba>('resumo')
  const tituloId = useId()
  const painelRef = useRef<HTMLDivElement>(null)
  useFecharComEsc(onClose, painelRef)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex justify-end" role="dialog" aria-modal="true" aria-labelledby={tituloId}>
      <button type="button" className="absolute inset-0 bg-black/30" aria-label={messages.comum.cancelar} onClick={onClose} />
      <div
        ref={painelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--color-surface)] shadow-xl outline-none"
      >
        <Cabecalho cliente={cliente} tituloId={tituloId} editarLabel={m.drawer_editar} fecharLabel={messages.comum.cancelar} onClose={onClose} onEditar={onEditar} />
        <Abas aba={aba} onChange={setAba} rotulo={m.drawer_abas} resumo={m.drawer_resumo} compras={m.drawer_compras} financeiro={m.drawer_financeiro} />
        <div className="flex flex-col gap-3 px-4 py-4" role="tabpanel">
          {aba === 'resumo' ? <PainelResumo cliente={cliente} locale={locale} m={m} /> : null}
          {aba === 'compras' ? <PainelCompras cliente={cliente} locale={locale} m={m} /> : null}
          {aba === 'financeiro' ? (
            <PainelFinanceiro cliente={cliente} locale={locale} m={m} carregando={messages.comum.carregando} />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function useFecharComEsc(onClose: () => void, painelRef: RefObject<HTMLDivElement | null>) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    painelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      anterior?.focus?.()
    }
  }, [painelRef])
}

function Cabecalho({
  cliente,
  tituloId,
  editarLabel,
  fecharLabel,
  onClose,
  onEditar,
}: {
  cliente: ClienteListRow
  tituloId: string
  editarLabel: string
  fecharLabel: string
  onClose: () => void
  onEditar: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4">
      <div className="min-w-0">
        <h2 id={tituloId} className="truncate text-lg font-semibold text-fg">{cliente.nome}</h2>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={onEditar}>
          {editarLabel}
        </Button>
      </div>
      <button type="button" onClick={onClose} aria-label={fecharLabel} className="rounded-lg p-1.5 text-fg-muted">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function Abas({
  aba,
  onChange,
  rotulo,
  resumo,
  compras,
  financeiro,
}: {
  aba: Aba
  onChange: (aba: Aba) => void
  rotulo: string
  resumo: string
  compras: string
  financeiro: string
}) {
  const itens: { id: Aba; label: string }[] = [
    { id: 'resumo', label: resumo },
    { id: 'compras', label: compras },
    { id: 'financeiro', label: financeiro },
  ]
  return (
    <div role="tablist" aria-label={rotulo} className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] px-2">
      {itens.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={aba === item.id}
          className={cn(
            'min-h-10 shrink-0 px-3 text-caption font-medium',
            aba === item.id ? 'border-b-2 border-brand text-brand' : 'text-fg-muted',
          )}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function PainelResumo({ cliente, locale, m }: { cliente: ClienteListRow; locale: string; m: Mensagens['clientes'] }) {
  return (
    <dl className="grid grid-cols-1 gap-2 text-caption">
      <Linha rotulo={m.tipo_label} valor={cliente.tipo === 'PJ' ? m.tipo_empresa : m.tipo_pessoa_fisica} />
      <Linha rotulo={cliente.tipo === 'PJ' ? m.field_cnpj : m.field_cpf} valor={maskDocumentoDisplay(cliente.documento)} />
      <Linha rotulo={m.field_telefone} valor={maskTelefoneDisplay(cliente.telefone)} />
      <Linha rotulo={m.field_email} valor={cliente.email || '—'} />
      <Linha rotulo={m.field_endereco} valor={cliente.endereco || '—'} />
      <Linha rotulo={m.compras_ultima} valor={formatarData(cliente.ultima_compra, locale)} />
    </dl>
  )
}

function PainelCompras({ cliente, locale, m }: { cliente: ClienteListRow; locale: string; m: Mensagens['clientes'] }) {
  const quando = formatarData(cliente.ultima_compra, locale)
  return (
    <div className="flex flex-col gap-2 text-caption">
      <p className="font-medium text-fg">{m.compras_ultima}</p>
      <p className="text-fg">{cliente.ultima_compra ? quando : m.compras_sem}</p>
      <p className="text-fg-muted">{m.compras_sem_lista}</p>
    </div>
  )
}

function PainelFinanceiro({
  cliente,
  locale,
  m,
  carregando,
}: {
  cliente: ClienteListRow
  locale: string
  m: Mensagens['clientes']
  carregando: string
}) {
  const saldo = Number(cliente.saldo_crediario)
  const limite = Number(cliente.limite_crediario)
  const disponivel = limiteDisponivel(limite, saldo)
  return (
    <div className="flex flex-col gap-3 text-caption">
      <Valor rotulo={m.fin_em_aberto} valor={fmtGerenteBRL(saldo, locale)} />
      <Vencido clienteId={cliente.id} locale={locale} m={m} carregando={carregando} />
      <Valor rotulo={m.fin_limite_disponivel} valor={fmtGerenteBRL(disponivel, locale)} />
      <p className="text-fg-muted">{m.limite_label}: {fmtGerenteBRL(limite, locale)}</p>
      {limite === 0 ? <p className="text-fg-muted">{m.hint_limite_zero}</p> : null}
      <Link
        href={pathWithQuery(ROUTES.admin.financeiro, new URLSearchParams({ tab: 'receber', cliente_id: cliente.id, cliente: cliente.nome }))}
        className="inline-flex items-center gap-1 text-[var(--color-info)] hover:underline"
      >
        <Receipt size={12} aria-hidden />
        {m.ver_financeiro}
      </Link>
    </div>
  )
}

function Vencido({
  clienteId,
  locale,
  m,
  carregando,
}: {
  clienteId: string
  locale: string
  m: Mensagens['clientes']
  carregando: string
}) {
  const [texto, setTexto] = useState(carregando)
  useEffect(() => {
    let cancelado = false
    resumoFinanceiroClienteAction(clienteId).then((r) => {
      if (cancelado) return
      setTexto(textoVencido(r, locale, m))
    })
    return () => {
      cancelado = true
    }
  }, [clienteId, locale, m])
  return (
    <div>
      <Valor rotulo={m.fin_vencido} valor={texto} />
    </div>
  )
}

function textoVencido(
  r: Awaited<ReturnType<typeof resumoFinanceiroClienteAction>>,
  locale: string,
  m: Mensagens['clientes'],
): string {
  if (!r.ok) return m.fin_vencido_falha
  if (r.totalTitulos > 0 && r.comVencimento === 0) return m.fin_sem_vencimento
  const valor = fmtGerenteBRL(r.vencido, locale)
  return r.capped ? `${valor}. ${m.fin_capped}` : valor
}

function Valor({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p>
      <span className="text-fg-muted">{rotulo}</span>
      <strong className="mt-0.5 block text-body text-fg">{valor}</strong>
    </p>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-fg-muted">{rotulo}</dt>
      <dd className="text-fg">{valor}</dd>
    </div>
  )
}

function formatarData(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(data)
}
