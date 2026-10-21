import type { LinhaVendedorPeriodo } from '@/app/gerente/comissoes/moduloActions'
import { totaisRelatorio } from '@/lib/comissao/relatorio'

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function TabelaVendedores({ linhas, t }: { linhas: LinhaVendedorPeriodo[]; t: Record<string, string> }) {
  if (linhas.length === 0) return <p className="admin-v2-panel p-4 text-sm text-jl-fg-2">{t.rel_vazio}</p>
  const tot = totaisRelatorio(linhas)
  return (
    <div className="admin-v2-panel overflow-x-auto">
      <table className="w-full text-sm" data-testid="comissao-tabela-vendedores">
        <thead>
          <tr className="text-left text-jl-fg-2">
            <th className="p-2">{t.rel_col_vendedor}</th><th className="p-2 text-right">{t.rel_col_vendas}</th>
            <th className="p-2 text-right">{t.rel_col_base}</th><th className="p-2 text-right">{t.rel_col_comissao}</th>
            <th className="p-2 text-right">{t.rel_col_ajustes}</th><th className="p-2 text-right">{t.rel_col_bonus}</th>
            <th className="p-2 text-right">{t.rel_col_total}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.operadorId} className="border-t border-jl-border-1">
              <td className="p-2">{l.nome}</td><td className="p-2 text-right">{l.vendas}</td>
              <td className="p-2 text-right">{fmt(l.base)}</td><td className="p-2 text-right">{fmt(l.comissao)}</td>
              <td className="p-2 text-right">{fmt(l.ajustes)}</td><td className="p-2 text-right">{fmt(l.bonusMeta)}</td>
              <td className="p-2 text-right font-semibold">{fmt(l.total)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-jl-border-1 font-semibold">
            <td className="p-2">{t.rel_total_geral}</td><td className="p-2 text-right">{tot.vendas}</td>
            <td className="p-2 text-right">{fmt(tot.base)}</td><td className="p-2 text-right">{fmt(tot.comissao)}</td>
            <td className="p-2 text-right">{fmt(tot.ajustes)}</td><td className="p-2 text-right">{fmt(tot.bonusMeta)}</td>
            <td className="p-2 text-right">{fmt(tot.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
