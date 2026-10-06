'use client'

import { useEffect, useState } from 'react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/forms'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Loading } from '@/components/ui/feedback'
import { listarHistoricoEntregas } from './actions'
import { EntregaDetalhe } from './EntregaDetalhe'
import type { RemessaRecenteRow } from './RecebimentoGerentePageClient'

export function HistoricoEntregas({ inicial, columns, zh }: { inicial: RemessaRecenteRow[]; columns: Column<RemessaRecenteRow>[]; zh: boolean }) {
  const [selecionada, setSelecionada] = useState<RemessaRecenteRow | null>(null)
  const [rows, setRows] = useState(inicial)
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(inicial.length)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      setLoading(true)
      void listarHistoricoEntregas(busca, page).then((result) => {
        if (!alive) return
        setErro(result.success ? null : result.error)
        if (result.success) { setRows(result.data.rows); setTotal(result.data.total) }
      }).catch(() => { if (alive) setErro(zh ? '加载失败' : 'Falha ao carregar entregas.') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [busca, page, retry, zh])
  return <div className="space-y-3">
    {selecionada ? <EntregaDetalhe entrega={selecionada} zh={zh} onClose={() => setSelecionada(null)} /> : null}
    <Input aria-label={zh ? '搜索交货' : 'Buscar entregas'} placeholder={zh ? '搜索来源' : 'Buscar origem da entrega'} value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1) }} />
    {erro ? <ErrorState dense description={erro} onRetry={() => setRetry(retry + 1)} /> : loading ? <Loading label="…" /> : <DataTable rowActions={(row) => <Button size="sm" variant="outline" onClick={() => setSelecionada(row)}>{zh ? '查看' : 'Detalhes'}</Button>} columns={columns} data={rows} rowKey={(row) => row.id} compact emptyState={<EmptyState title={zh ? '未找到交货' : 'Nenhuma entrega encontrada'} />} />}
    <div className="flex items-center gap-3">
      <Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>{zh ? '上一页' : 'Anterior'}</Button>
      <span className="text-caption">{page} / {Math.max(1, Math.ceil(total / 20))}</span>
      <Button variant="outline" disabled={loading || page * 20 >= total} onClick={() => setPage(page + 1)}>{zh ? '下一页' : 'Próxima'}</Button>
    </div>
  </div>
}
