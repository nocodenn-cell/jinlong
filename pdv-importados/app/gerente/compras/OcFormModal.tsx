'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { formatBRL, formatDecimalBRL, parseBRL } from '@/lib/format/money'
import {
  criarOrdemCompra,
  atualizarOrdemCompra,
  type OcDetalheDTO,
} from './actions'

type ItemLocal = {
  produto_id: string
  useLivre: boolean
  descricao: string
  quantidade: string
  preco_unitario: string
  unidade_medida: string
}

type Props = Readonly<{
  idioma: Idioma
  ocInicial: OcDetalheDTO | null
  fornecedores: Array<{ id: string; nome: string }>
  produtos: Array<{ id: string; nome: string; unidade_medida: string }>
  onClose: () => void
  onSaved: () => void
}>

function filterMoney(raw: string): string {
  let v = raw.replace(/[^\d,]/g, '')
  const parts = v.split(',')
  if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('')
  if (parts.length === 2 && parts[1].length > 2) v = parts[0] + ',' + parts[1].slice(0, 2)
  return v
}

function itemVazio(): ItemLocal {
  return { produto_id: '', useLivre: false, descricao: '', quantidade: '1', preco_unitario: '0', unidade_medida: 'UN' }
}

function fmtTotal(itens: ItemLocal[]): string {
  const total = itens.reduce((s, i) => {
    const q = parseFloat(i.quantidade) || 0
    const p = parseBRL(i.preco_unitario) ?? 0
    return s + q * p
  }, 0)
  return formatBRL(total)
}

export function OcFormModal({ idioma, ocInicial, fornecedores, produtos, onClose, onSaved }: Props) {
  const m = getMessages(idioma)
  const c = m.compras
  const editando = ocInicial !== null

  const [fornecedorId, setFornecedorId] = useState(ocInicial?.fornecedor_id ?? '')
  const [useFornecedorLivre, setUseFornecedorLivre] = useState(
    !!(ocInicial && !ocInicial.fornecedor_id && ocInicial.fornecedor_nome),
  )
  const [fornecedorNome, setFornecedorNome] = useState(
    ocInicial?.fornecedor_nome ?? '',
  )
  const [dataEmissao, setDataEmissao] = useState(
    ocInicial?.data_emissao ?? new Date().toISOString().slice(0, 10),
  )
  const [dataPrevista, setDataPrevista] = useState(ocInicial?.data_prevista_chegada ?? '')
  const [observacao, setObservacao] = useState(ocInicial?.observacao ?? '')
  const [itens, setItens] = useState<ItemLocal[]>(() => {
    if (ocInicial?.itens.length) {
      return ocInicial.itens.map((i) => ({
        produto_id: i.produto_id ?? '',
        useLivre: !i.produto_id,
        descricao: i.descricao ?? '',
        quantidade: String(i.quantidade),
        preco_unitario: formatDecimalBRL(Number(i.preco_unitario) || 0),
        unidade_medida: i.unidade_medida,
      }))
    }
    return [itemVazio()]
  })

  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPending, onClose])

  function addItem() {
    setItens((prev) => [...prev, itemVazio()])
  }

  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  function setItemField<K extends keyof ItemLocal>(idx: number, key: K, value: ItemLocal[K]) {
    setItens((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        const updated = { ...it, [key]: value }
        if (key === 'produto_id' && value) {
          const prod = produtos.find((p) => p.id === value)
          if (prod) updated.unidade_medida = prod.unidade_medida
        }
        return updated
      }),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending) return

    const itensValidos = itens.filter((i) => {
      const q = parseFloat(i.quantidade)
      return q > 0 && (i.produto_id || i.descricao.trim())
    })

    if (!itensValidos.length) {
      emitToast({ kind: 'error', message: c.erro_sem_itens })
      return
    }

    const payload = {
      fornecedor_id: useFornecedorLivre ? null : fornecedorId || null,
      fornecedor_nome: useFornecedorLivre ? fornecedorNome.trim() || null : null,
      data_emissao: dataEmissao,
      data_prevista_chegada: dataPrevista || null,
      observacao: observacao.trim() || null,
      itens: itensValidos.map((i) => ({
        produto_id: i.produto_id || null,
        descricao: i.descricao.trim() || null,
        quantidade: parseFloat(i.quantidade),
        preco_unitario: parseBRL(i.preco_unitario) ?? 0,
        unidade_medida: i.unidade_medida,
      })),
    }

    startTransition(async () => {
      try {
        const result = editando
          ? await atualizarOrdemCompra({ ...payload, id: ocInicial!.id })
          : await criarOrdemCompra(payload)

        if (!result.success) {
          emitToast({ kind: 'error', message: result.error })
          return
        }
        emitToast({ kind: 'success', message: editando ? c.toast_atualizada : c.toast_criada })
        onSaved()
      } catch {
        emitToast({ kind: 'error', message: m.comum.erro })
      }
    })
  }

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
      <div className="dragon-elev-2 relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-3.5">
          <h2 className="text-base font-semibold app-surface-text">
            {editando ? c.modal_editar_titulo : c.modal_nova_titulo}
          </h2>
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

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          {/* Cabeçalho da OC */}
          <div className="grid grid-cols-2 gap-4">
            {/* Fornecedor */}
            <div className="col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-jl-fg-3">{c.field_fornecedor}</label>
                <button
                  type="button"
                  onClick={() => setUseFornecedorLivre((v) => !v)}
                  className="text-[10px] text-jl-fg-3 underline underline-offset-2 hover:text-jl-fg-1"
                >
                  {useFornecedorLivre ? 'Selecionar da lista' : c.field_fornecedor_livre}
                </button>
              </div>
              {useFornecedorLivre ? (
                <input
                  type="text"
                  value={fornecedorNome}
                  onChange={(e) => setFornecedorNome(e.target.value)}
                  placeholder={c.field_fornecedor_livre}
                  disabled={isPending}
                  className="app-input w-full rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                />
              ) : (
                <select
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  disabled={isPending}
                  className="app-select w-full rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">— opcional —</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Data de emissão */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-jl-fg-3">{c.field_data_emissao}</label>
              <input
                type="date"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(e.target.value)}
                required
                disabled={isPending}
                className="app-input w-full rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            {/* Previsão de chegada */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-jl-fg-3">{c.field_data_prevista}</label>
              <input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                disabled={isPending}
                className="app-input w-full rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            {/* Observação */}
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-jl-fg-3">{c.field_observacao}</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                disabled={isPending}
                className="w-full resize-none rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-jl-fg-2">{c.field_itens_titulo}</span>
              <span className="text-xs font-semibold tabular-nums text-amber-300">{fmtTotal(itens)}</span>
            </div>

            <div className="space-y-2">
              {itens.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-jl-border-1 bg-white/[0.03] p-3">
                  {/* Produto ou livre */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    {item.useLivre ? (
                      <input
                        type="text"
                        value={item.descricao}
                        onChange={(e) => setItemField(idx, 'descricao', e.target.value)}
                        placeholder={c.field_descricao_item}
                        disabled={isPending}
                        className="app-input flex-1 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-60"
                      />
                    ) : (
                      <select
                        value={item.produto_id}
                        onChange={(e) => setItemField(idx, 'produto_id', e.target.value)}
                        disabled={isPending}
                        className="app-select flex-1 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-60"
                      >
                        <option value="">— {c.field_produto} —</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setItemField(idx, 'useLivre', !item.useLivre)}
                      className="whitespace-nowrap text-[10px] text-jl-fg-3 underline underline-offset-2 hover:text-jl-fg-1"
                    >
                      {item.useLivre ? c.field_produto : c.field_fornecedor_livre}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={itens.length === 1 || isPending}
                      className="rounded p-1 text-jl-fg-3 hover:text-red-400 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>

                  {/* Qtd / Preço / Unidade */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-jl-fg-3">{c.field_quantidade}</label>
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={item.quantidade}
                        onChange={(e) => setItemField(idx, 'quantidade', e.target.value)}
                        required
                        disabled={isPending}
                        className="app-input w-full rounded-md px-2 py-1.5 text-right text-sm tabular-nums disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-jl-fg-3">{c.field_preco_unitario}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.preco_unitario}
                        onChange={(e) => setItemField(idx, 'preco_unitario', filterMoney(e.target.value))}
                        required
                        disabled={isPending}
                        placeholder="0,00"
                        className="app-input w-full rounded-md px-2 py-1.5 text-right text-sm tabular-nums disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-jl-fg-3">{c.field_unidade}</label>
                      <input
                        type="text"
                        value={item.unidade_medida}
                        onChange={(e) => setItemField(idx, 'unidade_medida', e.target.value.toUpperCase())}
                        maxLength={10}
                        required
                        disabled={isPending}
                        className="app-input w-full rounded-md px-2 py-1.5 text-sm uppercase disabled:opacity-60"
                      />
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="mt-1.5 text-right text-[11px] tabular-nums text-jl-fg-3">
                    {formatBRL((parseFloat(item.quantidade) || 0) * (parseBRL(item.preco_unitario) ?? 0))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              disabled={isPending}
              className={cn(
                'mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed',
                'border-jl-border-1 py-2 text-xs text-jl-fg-3 transition hover:border-amber-400/50 hover:text-jl-fg-1',
                'disabled:opacity-40',
              )}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {c.btn_adicionar_item}
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-jl-border-1 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:text-jl-fg-1 disabled:opacity-40"
            >
              {m.comum.cancelar}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-w-[140px] items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? m.comum.salvando : m.comum.salvar}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
