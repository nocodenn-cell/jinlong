'use client'
import type { LinhaVendedorPeriodo, StatusPeriodo } from '@/app/gerente/comissoes/moduloActions'
import { gerarCsvRelatorio, gerarPdfRelatorio, type CabecalhoRelatorio } from '@/lib/comissao/relatorio'
import { SeletorMes } from '../_modulo/SeletorMes'
import { StatusPeriodoBadge } from '../_modulo/StatusPeriodoBadge'
import { TabelaVendedores } from '../_modulo/TabelaVendedores'

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function RelatorioClient({ competencia, status, linhas, t }: { competencia: string; status: StatusPeriodo; linhas: LinhaVendedorPeriodo[]; t: Record<string, string> }) {
  const h: CabecalhoRelatorio = {
    vendedor: t.rel_col_vendedor, vendas: t.rel_col_vendas, base: t.rel_col_base, comissao: t.rel_col_comissao,
    ajustes: t.rel_col_ajustes, bonus: t.rel_col_bonus, total: t.rel_col_total,
  }
  return (
    <div className="admin-v2-stack">
      <div className="admin-v2-panel flex flex-wrap items-center gap-4 p-4">
        <SeletorMes competencia={competencia} rotulo={t.competencia ?? ''} />
        <StatusPeriodoBadge status={status} t={t} />
        <div className="ml-auto flex gap-2">
          <button type="button" data-testid="rel-csv" disabled={!linhas.length} className="rounded-md border border-jl-border-1 px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            onClick={() => baixar(new Blob([gerarCsvRelatorio(linhas, h, t.rel_total_geral)], { type: 'text/csv;charset=utf-8' }), `comissoes-${competencia}.csv`)}>
            CSV
          </button>
          <button type="button" data-testid="rel-pdf" disabled={!linhas.length} className="rounded-md bg-jl-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => baixar(await gerarPdfRelatorio(linhas, h, `${t.relatorio_titulo} — ${competencia}`, t.rel_total_geral), `comissoes-${competencia}.pdf`)}>
            PDF
          </button>
        </div>
      </div>
      {status === 'ABERTO' || status === 'EM_REVISAO' ? <p className="text-xs text-jl-fg-2">{t.rel_aviso_parcial}</p> : null}
      <TabelaVendedores linhas={linhas} t={t} />
    </div>
  )
}
