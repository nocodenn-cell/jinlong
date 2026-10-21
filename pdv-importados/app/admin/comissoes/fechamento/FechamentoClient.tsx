'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { transicionarPeriodoComissao, type LinhaVendedorPeriodo, type StatusPeriodo } from '@/app/gerente/comissoes/moduloActions'
import { SeletorMes } from '../_modulo/SeletorMes'
import { StatusPeriodoBadge } from '../_modulo/StatusPeriodoBadge'
import { TabelaVendedores } from '../_modulo/TabelaVendedores'

const ACOES: Record<StatusPeriodo, { para: StatusPeriodo; chave: string; perigo?: boolean }[]> = {
  ABERTO: [{ para: 'EM_REVISAO', chave: 'fech_enviar_revisao' }],
  EM_REVISAO: [{ para: 'ABERTO', chave: 'fech_reabrir' }, { para: 'APROVADO', chave: 'fech_aprovar', perigo: true }],
  APROVADO: [{ para: 'PAGO', chave: 'fech_marcar_pago', perigo: true }],
  PAGO: [],
}

export function FechamentoClient({ competencia, status, linhas, t }: { competencia: string; status: StatusPeriodo; linhas: LinhaVendedorPeriodo[]; t: Record<string, string> }) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const [pendente, start] = useTransition()
  return (
    <div className="admin-v2-stack">
      <div className="admin-v2-panel flex flex-wrap items-center gap-4 p-4">
        <SeletorMes competencia={competencia} rotulo={t.competencia ?? ''} />
        <StatusPeriodoBadge status={status} t={t} />
        <div className="ml-auto flex gap-2">
          {ACOES[status].map((a) => (
            <button
              key={a.para}
              type="button"
              disabled={pendente}
              data-testid={`fech-${a.para.toLowerCase()}`}
              className={'rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ' + (a.perigo ? 'bg-jl-accent text-white' : 'border border-jl-border-1')}
              onClick={() => {
                if (a.perigo && !window.confirm(t[`${a.chave}_confirma`] ?? '')) return
                start(async () => {
                  const r = await transicionarPeriodoComissao(competencia, a.para)
                  setMsg(r.success ? null : r.error)
                  router.refresh()
                })
              }}
            >
              {t[a.chave]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-jl-fg-2">{t.fech_aviso}</p>
      {msg ? <p role="alert" className="text-sm text-red-700">{msg}</p> : null}
      <TabelaVendedores linhas={linhas} t={t} />
    </div>
  )
}
