'use client'

import { useCallback, useState } from 'react'
import {
  listarHistoricoPrecos,
  type HistoricoPrecoEntry,
} from '@/app/gerente/produtos/historicoPrecosActions'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { formatBRL } from '@/lib/format/money'

const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

type Props = Readonly<{
  produtoId: string
  p: Mensagens['produtos']
}>

/** Linha "Rótulo: R$ X → R$ Y" — omite campos que não mudaram nesse registro
 *  (a trigger grava a linha se QUALQUER um dos três preços mudou, não
 *  necessariamente todos). */
function linhaMudanca(label: string, anterior: number | null, novo: number | null): string | null {
  if (anterior === novo) return null
  const de = anterior != null ? formatBRL(anterior) : '—'
  const para = novo != null ? formatBRL(novo) : '—'
  return `${label}: ${de} → ${para}`
}

/**
 * Histórico de preços (tabela `historico_precos_produto`, migração 259) —
 * dado já existia no banco desde sempre, mas não tinha nenhuma tela. Carrega
 * sob demanda (só ao expandir) — é informação de consulta ocasional, não
 * precisa pesar em toda abertura do formulário de edição.
 */
export function HistoricoPrecosSection({ produtoId, p }: Props) {
  const [entradas, setEntradas] = useState<HistoricoPrecoEntry[]>([])
  const [carregando, setCarregando] = useState(false)
  const [carregouUmaVez, setCarregouUmaVez] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await listarHistoricoPrecos(produtoId)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setEntradas(r.data)
      setCarregouUmaVez(true)
    } finally {
      setCarregando(false)
    }
  }, [produtoId])

  return (
    <details
      className="mt-3 rounded-md border border-[var(--color-border-secondary)] p-3"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !carregouUmaVez) void carregar()
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-jl-fg-2">
        {p.historico_precos_resumo}
      </summary>
      <div className="mt-3 space-y-2">
        {carregando ? (
          <p className="text-xs text-jl-fg-3">{p.historico_precos_carregando}</p>
        ) : carregouUmaVez && entradas.length === 0 ? (
          <p className="text-xs text-jl-fg-3">{p.historico_precos_vazio}</p>
        ) : (
          entradas.map((entry) => {
            const linhas = [
              linhaMudanca(p.historico_precos_varejo, entry.precoVarejoAnterior, entry.precoVarejoNovo),
              linhaMudanca(
                p.historico_precos_atacado,
                entry.precoAtacadoAnterior,
                entry.precoAtacadoNovo,
              ),
              linhaMudanca(p.historico_precos_custo, entry.precoCustoAnterior, entry.precoCustoNovo),
            ].filter((l): l is string => l !== null)

            return (
              <div
                key={entry.id}
                className="rounded-md border border-[var(--color-border-secondary)] p-2 text-xs"
              >
                <p className="font-medium text-jl-fg-2">
                  {dtFmt.format(new Date(entry.alteradoEm))} ·{' '}
                  {entry.alteradoPorNome ?? p.historico_precos_autor_desconhecido}
                </p>
                {linhas.map((l) => (
                  <p key={l} className="mt-0.5 font-mono text-jl-fg-3">
                    {l}
                  </p>
                ))}
              </div>
            )
          })
        )}
      </div>
    </details>
  )
}
