'use client'
import { useEffect, useState } from 'react'
import { DragonModal } from '@/components/ui/DragonModal'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { obterItensEntrega, type EntregaItemHistorico } from './actions'
import type { RemessaRecenteRow } from './RecebimentoGerentePageClient'

export function EntregaDetalhe({ entrega, zh, onClose }: { entrega: RemessaRecenteRow; zh: boolean; onClose: () => void }) {
  const [itens, setItens] = useState<EntregaItemHistorico[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    void obterItensEntrega(entrega.id).then((result) => {
      if (!alive) return
      setErro(result.success ? null : result.error)
      if (result.success) setItens(result.data)
    }).catch(() => { if (alive) setErro(zh ? '加载失败' : 'Falha ao carregar itens.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [entrega.id, zh])
  return <DragonModal open onClose={onClose} title={zh ? '交货明细' : 'Detalhes da entrega'} subtitle={entrega.origem_descricao} closeLabel={zh ? '关闭' : 'Fechar'}>
    {erro ? <ErrorState dense description={erro} /> : loading ? <Loading label="…" /> : <div className="space-y-3">
      <p className="text-caption font-mono">{entrega.id}</p>
      <p className="text-body">{zh ? '交货状态：' : 'Status da entrega: '}{entrega.status}</p>
      {itens.length === 0 ? <EmptyState title={zh ? '没有商品' : 'Nenhum item registrado'} /> : itens.map((item) => <article key={item.id} className="rounded border p-3">
        <p className="break-words font-semibold">{item.nome}</p>
        <p>{zh ? '预计 / 实收：' : 'Esperada / conferida: '}{item.esperada} / {item.conferida}</p>
      </article>)}
      <p className="text-caption text-fg-muted">{zh ? '已完成的实收数量已计入库存。此交货本身不产生应付款。' : 'Em entregas concluídas, a quantidade conferida já foi creditada ao estoque. Esta entrega física, por si só, não gera contas a pagar.'}</p>
    </div>}
  </DragonModal>
}
