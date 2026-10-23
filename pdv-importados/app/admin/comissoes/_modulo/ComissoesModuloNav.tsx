import Link from 'next/link'

export type AbaComissao = 'resumo' | 'regras' | 'fechamento' | 'relatorio' | 'metas' | 'falhas'

const ROTAS: Record<AbaComissao, string> = {
  resumo: '/admin/comissoes',
  regras: '/admin/comissoes/regras',
  fechamento: '/admin/comissoes/fechamento',
  relatorio: '/admin/comissoes/relatorio',
  metas: '/admin/comissoes/metas',
  falhas: '/admin/comissoes/falhas',
}

/** Abas do módulo Comissão. Só exibe as abas cujo rótulo foi passado (permite liberar por fase). */
export function ComissoesModuloNav({ ativa, rotulos }: { ativa: AbaComissao; rotulos: Partial<Record<AbaComissao, string>> }) {
  const abas = (Object.keys(ROTAS) as AbaComissao[]).filter((a) => rotulos[a])
  return (
    <nav aria-label="Comissões" className="flex flex-wrap gap-2 border-b border-jl-border-1 pb-2" data-testid="comissoes-modulo-nav">
      {abas.map((a) => (
        <Link
          key={a}
          href={ROTAS[a]}
          aria-current={a === ativa ? 'page' : undefined}
          className={
            'rounded-md px-3 py-1.5 text-sm font-semibold ' +
            (a === ativa ? 'bg-jl-accent text-white' : 'text-jl-fg-2 hover:bg-jl-surface-soft')
          }
        >
          {rotulos[a]}
        </Link>
      ))}
    </nav>
  )
}
