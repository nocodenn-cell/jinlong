import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { createClient } from '@/lib/supabase/server'
import { minhasComissoes } from '@/app/gerente/comissoes/moduloActions'

/** Autoatendimento do vendedor: só as próprias comissões (filtro por auth.uid() no banco). */
export default async function MinhasComissoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fcaixa%2Fminhas-comissoes')
  const { idioma } = await getUsuarioIdioma()
  const c = getMessages(idioma).caixa as unknown as Record<string, string>
  const res = await minhasComissoes(6)
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <main className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{c.minhas_comissoes_titulo}</h1>
        <Link href="/caixa" className="text-sm underline">{c.minhas_comissoes_voltar}</Link>
      </div>
      <p className="mb-3 text-sm text-jl-fg-2">{c.minhas_comissoes_sub}</p>
      {!res.success ? <p role="alert">{res.error}</p> : res.data.length === 0 ? <p data-testid="minhas-vazio">{c.minhas_comissoes_vazio}</p> : (
        <table className="w-full text-sm" data-testid="minhas-comissoes">
          <thead><tr className="text-left text-jl-fg-2">
            <th className="p-2">{c.minhas_comissoes_mes}</th><th className="p-2">{c.minhas_comissoes_loja}</th><th className="p-2">{c.minhas_comissoes_status}</th>
            <th className="p-2 text-right">{c.minhas_comissoes_vendas}</th><th className="p-2 text-right">{c.minhas_comissoes_comissao}</th>
            <th className="p-2 text-right">{c.minhas_comissoes_ajustes}</th><th className="p-2 text-right">{c.minhas_comissoes_bonus}</th><th className="p-2 text-right">{c.minhas_comissoes_total}</th>
          </tr></thead>
          <tbody>
            {res.data.map((r) => (
              <tr key={`${r.lojaNome}-${r.competencia}`} className="border-t border-jl-border-1">
                <td className="p-2">{r.competencia}</td><td className="p-2">{r.lojaNome}</td>
                <td className="p-2">{c[`minhas_comissoes_status_${r.status.toLowerCase()}`] ?? r.status}</td>
                <td className="p-2 text-right">{r.vendas}</td><td className="p-2 text-right">{brl(r.comissao)}</td>
                <td className="p-2 text-right">{brl(r.ajustes)}</td><td className="p-2 text-right">{brl(r.bonusMeta)}</td>
                <td className="p-2 text-right font-semibold">{brl(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
