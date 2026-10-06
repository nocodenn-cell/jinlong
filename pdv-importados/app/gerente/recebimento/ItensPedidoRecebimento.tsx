'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import type { OcItemDTO } from '../compras/actions'

export type ItemPedidoConferido = { produto_id: string; nome: string; quantidade_esperada: number; quantidade_conferida: number }

export function produtosPendentes(itens: OcItemDTO[]): Array<Omit<ItemPedidoConferido, 'quantidade_conferida'>> {
  const produtos = new Map<string, Omit<ItemPedidoConferido, 'quantidade_conferida'>>()
  for (const item of itens) {
    if (!item.produto_id || item.saldo_pendente <= 0) continue
    const row = produtos.get(item.produto_id)
    produtos.set(item.produto_id, { produto_id: item.produto_id, nome: item.produto_nome ?? item.descricao ?? '—',
      quantidade_esperada: (row?.quantidade_esperada ?? 0) + item.saldo_pendente })
  }
  return [...produtos.values()]
}

export function ItensPedidoRecebimento({ itens, zh, loading }: {
  itens: OcItemDTO[]; zh: boolean; loading: boolean
}) {
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const rows = produtosPendentes(itens)
  const conferidos = rows.map((row) => ({ ...row, quantidade_conferida: Number(quantidades[row.produto_id] ?? '') }))
  const invalidos = conferidos.some((row) => !Number.isFinite(row.quantidade_conferida) || row.quantidade_conferida < 0 || row.quantidade_conferida > row.quantidade_esperada)
  const preenchidos = conferidos.filter((row) => row.quantidade_conferida > 0)
  return <div className="space-y-3 md:col-span-2">
    <p className="text-caption">{zh ? '输入本次实际收货数量。空白或零表示本次未收货。' : 'Informe o que chegou nesta entrega. Deixe vazio ou zero para itens que não chegaram.'}</p>
    <input type="hidden" name="produto_id" value={rows[0]?.produto_id ?? ''} />
    <input type="hidden" name="qtd_esperada" value={rows[0]?.quantidade_esperada ?? 0} />
    {rows.map((row, index) => <label key={row.produto_id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-body">
      <span>{row.nome} · {zh ? '待收' : 'Faltam'} {row.quantidade_esperada}</span>
      <Input name={index === 0 ? 'qtd_conferida' : `qtd_${row.produto_id}`} type="number" min={0} max={row.quantidade_esperada} step="0.001" className="w-28"
        disabled={loading} aria-label={`${zh ? '实收' : 'Conferido'} ${row.nome}`}
        value={quantidades[row.produto_id] ?? ''} onChange={(e) => setQuantidades((prev) => ({ ...prev, [row.produto_id]: e.target.value }))} />
    </label>)}
    {itens.some((item) => !item.produto_id && item.saldo_pendente > 0) ? <p role="status" className="text-caption">
      {zh ? '未关联商品的采购行必须先在采购单中关联，才能入库。' : 'Itens digitados sem produto precisam ser vinculados no pedido antes de entrar no estoque.'}
    </p> : null}
    {invalidos ? <p role="alert">{zh ? '数量必须介于零和待收数量之间。' : 'A quantidade deve ficar entre zero e o saldo pendente.'}</p> : null}
    <Button type="submit" loading={loading} disabled={invalidos || preenchidos.length === 0 || loading}
      >{zh ? '确认本次收货' : 'Confirmar esta entrega'}</Button>
  </div>
}
