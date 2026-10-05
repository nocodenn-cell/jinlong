'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import { formatBRL, parseBRL } from '@/lib/format/money'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { getMessages } from '@/i18n/getMessages'
import { previewNotaManualNfe, type LinhaPreviewNfe } from './actions'
import type { NfeParsed } from '@/lib/nfe/nfeParser'

type Mi = ReturnType<typeof getMessages>['estoque']['import_nfe']

type ItemForm = {
  nome: string
  ref: string
  gtin: string
  ncm: string
  un: string
  qtd: string
  valor: string
}

type ParcelaForm = { venc: string; valor: string }

const itemVazio = (): ItemForm => ({ nome: '', ref: '', gtin: '', ncm: '', un: 'UN', qtd: '1', valor: '' })

function toNumber(raw: string): number {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

type Props = Readonly<{
  mi: Mi
  onPreview: (data: { parsed: NfeParsed; linhas: LinhaPreviewNfe[] }) => void
}>

/** Nota de chegada digitada à mão. Entrega o mesmo `{ parsed, linhas }` que o XML. */
export function NotaManualForm({ mi, onPreview }: Props) {
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [fornecedor, setFornecedor] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [numero, setNumero] = useState('')
  const [serie, setSerie] = useState('')
  const [chave, setChave] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()])
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])

  const setItem = (idx: number, patch: Partial<ItemForm>) =>
    setItens((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const setParcela = (idx: number, patch: Partial<ParcelaForm>) =>
    setParcelas((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const totalItens = itens.reduce((s, i) => s + toNumber(i.qtd) * (parseBRL(i.valor) ?? 0), 0)
  const totalParcelas = parcelas.reduce((s, p) => s + (parseBRL(p.valor) ?? 0), 0)
  const parcelasDiferem = parcelas.length > 0 && Math.abs(totalParcelas - totalItens) > 0.01

  if (!aberto) {
    return (
      <div className="mt-3 text-center">
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          {mi.manual_abrir}
        </Button>
      </div>
    )
  }

  async function continuar() {
    setCarregando(true)
    try {
      const r = await previewNotaManualNfe({
        emitente_nome: fornecedor,
        emitente_cnpj: cnpj,
        numero_nf: numero,
        serie,
        chave_acesso: chave,
        itens: itens.map((i) => ({
          nome_produto: i.nome,
          ref_fornecedor: i.ref,
          gtin: i.gtin,
          ncm: i.ncm,
          u_com: i.un,
          q_com: toNumber(i.qtd),
          v_un_com: parseBRL(i.valor) ?? 0,
        })),
        duplicatas: parcelas
          .filter((p) => p.venc || p.valor.trim())
          .map((p, idx) => ({
            numero: String(idx + 1).padStart(3, '0'),
            data_vencimento: p.venc,
            valor: parseBRL(p.valor) ?? 0,
          })),
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setAberto(false)
      onPreview(r.data)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-[var(--color-border)] p-4" data-testid="nota-manual">
      <div>
        <p className="text-body font-semibold">{mi.manual_titulo}</p>
        <p className="text-caption text-fg-muted">{mi.manual_ajuda}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-caption md:col-span-2">
          {mi.manual_fornecedor}
          <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
        </label>
        <label className="text-caption md:col-span-2">
          {mi.manual_cnpj}
          <Input value={cnpj} inputMode="numeric" onChange={(e) => setCnpj(e.target.value)} />
        </label>
        <label className="text-caption">
          {mi.manual_numero}
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
        </label>
        <label className="text-caption">
          {mi.manual_serie}
          <Input value={serie} onChange={(e) => setSerie(e.target.value)} />
        </label>
        <label className="text-caption md:col-span-2">
          {mi.manual_chave}
          <Input value={chave} inputMode="numeric" onChange={(e) => setChave(e.target.value)} />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-caption font-semibold text-fg-muted">{mi.manual_itens}</p>
        {itens.map((it, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--color-surface-soft)] p-2 md:grid-cols-12">
            <label className="col-span-2 text-caption md:col-span-4">
              {mi.manual_item_desc}
              <Input value={it.nome} onChange={(e) => setItem(idx, { nome: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_ref}
              <Input value={it.ref} onChange={(e) => setItem(idx, { ref: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_gtin}
              <Input value={it.gtin} inputMode="numeric" onChange={(e) => setItem(idx, { gtin: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_ncm}
              <Input value={it.ncm} inputMode="numeric" onChange={(e) => setItem(idx, { ncm: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_un}
              <Input value={it.un} maxLength={6} onChange={(e) => setItem(idx, { un: e.target.value.toUpperCase() })} />
            </label>
            <label className="text-caption md:col-span-3">
              {mi.manual_item_qtd}
              <Input value={it.qtd} inputMode="decimal" onChange={(e) => setItem(idx, { qtd: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-3">
              {mi.manual_item_valor}
              <Input value={it.valor} inputMode="decimal" placeholder="0,00" onChange={(e) => setItem(idx, { valor: e.target.value })} />
            </label>
            <div className="col-span-2 flex items-end justify-between gap-2 md:col-span-6">
              <span className="text-caption tabular-nums text-fg-muted">
                {formatBRL(toNumber(it.qtd) * (parseBRL(it.valor) ?? 0))}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={itens.length === 1}
                onClick={() => setItens((rows) => rows.filter((_, i) => i !== idx))}
              >
                {mi.manual_remover}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setItens((r) => [...r, itemVazio()])}>
            {mi.manual_add_item}
          </Button>
          <span className="text-caption font-semibold tabular-nums">
            {mi.manual_total_itens}: {formatBRL(totalItens)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-caption font-semibold text-fg-muted">{mi.manual_parcelas}</p>
        {parcelas.map((p, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="text-caption">
              {mi.manual_parcela_venc}
              <Input type="date" value={p.venc} onChange={(e) => setParcela(idx, { venc: e.target.value })} />
            </label>
            <label className="text-caption">
              {mi.manual_parcela_valor}
              <Input value={p.valor} inputMode="decimal" placeholder="0,00" onChange={(e) => setParcela(idx, { valor: e.target.value })} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setParcelas((r) => r.filter((_, i) => i !== idx))}>
              {mi.manual_remover}
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setParcelas((r) => [...r, { venc: '', valor: '' }])}>
            {mi.manual_add_parcela}
          </Button>
          {parcelas.length > 0 ? (
            <span className="text-caption font-semibold tabular-nums">
              {mi.manual_total_parcelas}: {formatBRL(totalParcelas)}
            </span>
          ) : null}
        </div>
        {parcelasDiferem ? (
          <p className="text-caption text-[var(--color-warning-strong)]" role="status">
            {mi.manual_parcelas_diferem}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          {mi.manual_fechar}
        </Button>
        <Button type="button" variant="primary" size="sm" loading={carregando} onClick={() => void continuar()}>
          {mi.manual_continuar}
        </Button>
      </div>
    </div>
  )
}
