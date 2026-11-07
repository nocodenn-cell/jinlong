'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reprocessarComissaoVenda, type FalhaComissao } from '@/app/gerente/comissoes/moduloActions'

type Labels = {
  vazio: string; venda: string; etapa: string; motivo: string; tentativas: string; quando: string
  reprocessar: string; reprocessado: string; aindaFalha: string
}

export function FalhasComissaoTable({ falhas, erro, labels }: { falhas: FalhaComissao[]; erro: string | null; labels: Labels }) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(erro)
  const [pendente, startTransition] = useTransition()
  if (falhas.length === 0) return <p className="admin-v2-panel p-4 text-sm text-jl-fg-2" data-testid="falhas-vazio">{msg ?? labels.vazio}</p>
  return (
    <div className="admin-v2-panel overflow-x-auto">
      {msg ? <p role="status" className="p-3 text-sm">{msg}</p> : null}
      <table className="w-full text-sm" data-testid="falhas-tabela">
        <thead>
          <tr className="text-left text-jl-fg-2">
            <th className="p-2">{labels.venda}</th><th className="p-2">{labels.etapa}</th><th className="p-2">{labels.motivo}</th>
            <th className="p-2 text-right">{labels.tentativas}</th><th className="p-2">{labels.quando}</th><th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {falhas.map((f) => (
            <tr key={f.id} className="border-t border-jl-border-1">
              <td className="p-2 font-mono">{f.vendaId.slice(0, 8)}</td>
              <td className="p-2">{f.etapa}</td>
              <td className="p-2">{f.motivo}</td>
              <td className="p-2 text-right">{f.tentativas}</td>
              <td className="p-2">{new Date(f.ultimaTentativaEm).toLocaleString()}</td>
              <td className="p-2 text-right">
                <button
                  type="button"
                  className="rounded-md bg-jl-accent px-3 py-1 font-semibold text-white disabled:opacity-50"
                  disabled={pendente}
                  onClick={() => startTransition(async () => {
                    const r = await reprocessarComissaoVenda(f.vendaId)
                    if (!r.success) setMsg(r.error)
                    else setMsg(r.data.ok ? labels.reprocessado : labels.aindaFalha.replace('{{motivo}}', r.data.falha ?? '?'))
                    router.refresh()
                  })}
                >
                  {labels.reprocessar}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
