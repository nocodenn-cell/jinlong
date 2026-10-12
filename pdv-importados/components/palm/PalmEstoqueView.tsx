'use client'

import type { Mensagens } from '@/i18n/getMessages'
import { caixaFmt } from '@/app/caixa/caixaI18n'
import type { ProdutoPalm } from '@/app/palm/domain/tiposPalm'

type Props = {
  m: Mensagens
  busca: string
  onBusca: (valor: string) => void
  onBuscar: () => void
  onAbrirCamera: () => void
  produtos: ProdutoPalm[]
  erro: string | null
}

export function PalmEstoqueView({ m, busca, onBusca, onBuscar, onAbrirCamera, produtos, erro }: Props) {
  return (
    <div data-testid="palm-estoque">
      <h1 className="text-base font-semibold">{m.palm.estoque_titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{m.palm.somente_consulta}</p>
      <form className="mt-3 flex flex-col gap-2" onSubmit={(evento) => { evento.preventDefault(); onBuscar() }}>
        <label className="text-sm" htmlFor="palm-estoque-busca">{m.palm.busca_placeholder}</label>
        <input id="palm-estoque-busca" value={busca} onChange={(evento) => onBusca(evento.target.value)} className="min-h-11 w-full rounded-md border border-border px-3" />
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" className="min-h-11 rounded-md bg-primary px-3 text-primary-foreground">{m.palm.buscar}</button>
          <button type="button" className="min-h-11 rounded-md border border-border px-3" onClick={onAbrirCamera}>{m.palm.ler_camera}</button>
        </div>
      </form>
      {erro ? <p className="mt-3 text-sm text-destructive" role="alert">{erro}</p> : null}
      {produtos.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{m.palm.sem_resultado}</p> : null}
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {produtos.map((produto) => (
          <li key={produto.id} className="rounded-xl border border-border p-3" data-testid="estoque-saldo">
            <p className="font-medium">{produto.nome}</p>
            <p className="text-sm text-muted-foreground">{produto.descricao}</p>
            <p className="text-sm">{m.palm.codigo}: {produto.codigo ?? '—'}</p>
            <p className="text-sm">{m.palm.localizacao}: {produto.localizacao ?? m.palm.sem_localizacao}</p>
            <p className={`text-sm ${produto.baixo ? 'font-semibold text-destructive' : ''}`}>
              {produto.estoque == null ? m.palm.sem_saldo : caixaFmt(m.palm.disponivel, { n: produto.estoque })}
              {produto.baixo ? ` · ${m.palm.estoque_baixo}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
