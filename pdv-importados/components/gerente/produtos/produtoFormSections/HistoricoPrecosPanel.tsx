'use client'

import { useEffect, useState } from 'react'
import {
  listarHistoricoPrecoProduto,
  type HistoricoPrecoProduto,
} from '@/app/gerente/produtos/historicoPrecosActions'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { formatBRL } from '@/lib/format/money'

type Props = Readonly<{
  produtoId: string
  p: Mensagens['produtos']
}>

function Variacao({ anterior, novo }: { anterior: number | null; novo: number | null }) {
  if (novo === null && anterior === null) return <span className="text-jl-fg-3">—</span>
  if (anterior === null) return <span className="text-jl-fg-1">{formatBRL(novo ?? 0)}</span>
  if (novo === anterior) return <span className="text-jl-fg-3">{formatBRL(novo ?? 0)}</span>
  return (
    <span className="text-jl-fg-1">
      <span className="text-jl-fg-3 line-through">{formatBRL(anterior)}</span>{' '}
      → {novo !== null ? formatBRL(novo) : '—'}
    </span>
  )
}

export function HistoricoPrecosPanel({ produtoId, p }: Props) {
  const [linhas, setLinhas] = useState<HistoricoPrecoProduto[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    void listarHistoricoPrecoProduto(produtoId).then((r) => {
      if (!ativo) return
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        setCarregando(false)
        return
      }
      setLinhas(r.data)
      setCarregando(false)
    })
    return () => {
      ativo = false
    }
  }, [produtoId])

  if (carregando) {
    return <p className="px-1 text-xs text-jl-fg-3">{p.historico_precos_carregando}</p>
  }

  if (linhas.length === 0) {
    return <p className="px-1 text-xs text-jl-fg-3">{p.historico_precos_vazio}</p>
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
        <span />
        <span>{p.historico_precos_varejo}</span>
        <span>{p.historico_precos_atacado}</span>
        <span>{p.historico_precos_custo}</span>
      </div>
      {linhas.map((l) => (
        <div
          key={l.id}
          className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 rounded-md border border-[var(--color-border-secondary)] p-2 text-xs"
        >
          <span className="whitespace-nowrap text-jl-fg-3">
            {new Date(l.alterado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          <Variacao anterior={l.preco_varejo_anterior} novo={l.preco_varejo_novo} />
          <Variacao anterior={l.preco_atacado_anterior} novo={l.preco_atacado_novo} />
          <Variacao anterior={l.preco_custo_anterior} novo={l.preco_custo_novo} />
        </div>
      ))}
    </div>
  )
}
