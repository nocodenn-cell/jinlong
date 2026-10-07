'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import { associarDocumentoEntrada, listarEntregasParaDocumento } from './actions'

type Entrega = { id: string; origem_descricao: string; created_at: string }
type Props = { importacaoId: string; entregaId?: string | null; zh: boolean; podeAssociar: boolean;
  onSelecionarModo: (active: boolean) => void; onAssociada: () => void }

export function DocumentoEntregaLink({ importacaoId, entregaId, zh, podeAssociar, onSelecionarModo, onAssociada }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [selecionada, setSelecionada] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!aberto || entregaId) return
    let alive = true
    const timer = setTimeout(() => {
      setLoading(true)
      void listarEntregasParaDocumento(busca, pagina).then((result) => {
        if (!alive) return
        setErro(result.success ? null : result.error)
        setEntregas(result.success ? result.data : [])
      }).catch(() => { if (alive) setErro(zh ? '加载失败' : 'Falha ao consultar entregas.') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [aberto, entregaId, busca, pagina, zh])

  const associar = async () => {
    setLoading(true)
    try {
      const result = await associarDocumentoEntrada(importacaoId, selecionada)
      setErro(result.success ? null : result.error)
      if (result.success) onAssociada()
    } catch { setErro(zh ? '关联失败' : 'Falha ao associar entrega.') }
    finally { setLoading(false) }
  }
  if (entregaId) return <p role="status" className="rounded border p-3 text-body">
    {zh ? '已关联收货：仅处理单据、成本及应付款，不再增加库存。' : 'Entrega já recebida: esta confirmação processa documento, custo e contas a pagar, sem creditar estoque novamente.'} {entregaId.slice(0, 8)}
  </p>
  return <section className="my-3 rounded border border-[var(--color-border)] p-3">
    <Button type="button" variant="outline" disabled={loading} onClick={() => {
      setAberto(!aberto); onSelecionarModo(!aberto)
    }}>{zh ? '商品已经入库？关联原收货' : 'Mercadoria já entrou? Associar à entrega existente'}</Button>
    {aberto ? <div className="mt-3 space-y-2">
      <p className="text-caption">{zh ? '先登记核对数量，再选择相同商品和数量的收货。关联不会增加库存。' : 'Registre a conferência e selecione a entrega com os mesmos produtos e quantidades. A associação não movimenta estoque.'}</p>
      <Input placeholder={zh ? '搜索来源' : 'Buscar origem da entrega'} value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); setSelecionada('') }} />
      <select aria-label={zh ? '原收货' : 'Entrega já recebida'} className="w-full rounded border bg-[var(--color-surface)] p-2" value={selecionada} onChange={(e) => setSelecionada(e.target.value)}>
        <option value="">{zh ? '选择收货' : 'Selecione a entrega'}</option>
        {entregas.map((item) => <option key={item.id} value={item.id}>{item.origem_descricao} · {item.created_at.slice(0, 10)} · {item.id.slice(0, 8)}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={loading || pagina <= 1} onClick={() => { setPagina(pagina - 1); setSelecionada('') }}>{zh ? '上一页' : 'Anterior'}</Button>
        <Button type="button" variant="outline" disabled={loading || entregas.length < 20} onClick={() => { setPagina(pagina + 1); setSelecionada('') }}>{zh ? '下一页' : 'Próxima'}</Button>
        <Button type="button" disabled={loading || !selecionada || !podeAssociar} onClick={() => void associar()}>{zh ? '关联，不增加库存' : 'Associar sem movimentar estoque'}</Button>
      </div>
      {erro ? <p role="alert">{erro}</p> : null}
    </div> : null}
  </section>
}
