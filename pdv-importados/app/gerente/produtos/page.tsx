import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { criarProduto, alternarAtivoProduto } from './actions'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

type ProdutoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
}

export default async function ProdutosPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = idioma === 'zh' ? 'zh-CN' : idioma === 'zh-HK' ? 'zh-HK' : 'pt-BR'
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'

  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, origem, tem_nf, ativo')
    .order('nome', { ascending: true })

  async function handleSubmit(formData: FormData) {
    'use server'
    const input = {
      nome: formData.get('nome'),
      codigo_barras: formData.get('codigo_barras'),
      preco_varejo: formData.get('preco_varejo'),
      origem: formData.get('origem'),
      tem_nf: formData.get('tem_nf') === 'on',
    }
    await criarProduto(input)
  }

  async function handleToggleAtivo(id: string, ativo: boolean) {
    'use server'
    await alternarAtivoProduto(id, !ativo)
  }

  const rows = (produtos as ProdutoRow[] | null) ?? []

  return (
    <div className={`min-h-screen bg-slate-50 px-4 py-4 md:px-6 ${fontClass}`}>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-slate-900">{m.produtos.titulo}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {idioma === 'pt'
                ? 'Gestão de catálogo com visão densa para operação diária.'
                : '高密度商品管理视图，适合日常运营。'}
            </p>
          </div>
          <ExportCsvButton
            label={m.gerente.exportar_csv}
            filename="gerente-produtos.csv"
            columns={[
              { key: 'id', header: 'id' },
              { key: 'nome', header: m.produtos.nome },
              { key: 'codigo_barras', header: m.produtos.codigo_barras },
              { key: 'preco_varejo', header: m.produtos.preco_varejo },
              { key: 'origem', header: m.produtos.origem_label },
              { key: 'tem_nf', header: m.produtos.tem_nf },
              { key: 'ativo', header: m.produtos.status },
            ]}
            rows={rows.map((p) => ({
              id: p.id,
              nome: p.nome,
              codigo_barras: p.codigo_barras ?? '',
              preco_varejo: Number(p.preco_varejo),
              origem: p.origem,
              tem_nf: p.tem_nf ? '1' : '0',
              ativo: p.ativo ? '1' : '0',
            }))}
          />
        </header>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-800">{m.produtos.cadastro_rapido}</h2>
          </div>
          <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-2.5 p-3">
            <input
              name="nome"
              placeholder={m.produtos.nome}
              required
              className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 md:col-span-2"
            />
            <input
              name="codigo_barras"
              placeholder={m.produtos.codigo_barras}
              className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <input
              name="preco_varejo"
              type="number"
              step="0.01"
              min="0"
              placeholder={m.produtos.preco_varejo}
              required
              className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <select
              name="origem"
              defaultValue="china_manual"
              className="h-9 rounded-md border border-slate-300 px-3 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="china_manual">{m.produtos.origem_china}</option>
              <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
              <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
            </select>
            <button
              type="submit"
              className="h-9 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
            >
              {m.comum.salvar}
            </button>
            <label className="md:col-span-6 inline-flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name="tem_nf" className="h-3.5 w-3.5 rounded border-slate-300" />
              {m.produtos.tem_nf}
              <span className="text-slate-400">· {m.produtos.codigo_barras_opcional}</span>
            </label>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-800">{m.produtos.lista_produtos}</h2>
          </div>

          <div className="border-b border-slate-200 bg-slate-50/80 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input
              disabled
              placeholder={m.produtos.buscar}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-500"
            />
            <select disabled className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-500">
              <option>{m.produtos.origem_label}</option>
            </select>
            <select disabled className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-500">
              <option>{m.produtos.status}</option>
            </select>
            <select disabled className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-500">
              <option>{m.produtos.tem_nf}</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">{m.produtos.nome}</th>
                  <th className="px-3 py-2 font-medium">{m.produtos.codigo_barras}</th>
                  <th className="px-3 py-2 font-medium text-right">{m.produtos.preco_varejo}</th>
                  <th className="px-3 py-2 font-medium">{m.produtos.origem_label}</th>
                  <th className="px-3 py-2 font-medium">{m.produtos.tem_nf}</th>
                  <th className="px-3 py-2 font-medium">{m.produtos.status}</th>
                  <th className="px-3 py-2 font-medium text-center">{m.produtos.acoes}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{p.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-slate-900 font-medium leading-relaxed">{p.nome}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{p.codigo_barras ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {Number(p.preco_varejo).toLocaleString(locale, {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.origem}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.tem_nf
                            ? 'inline-flex rounded border px-2 py-0.5 text-[11px] border-blue-200 bg-blue-50 text-blue-700'
                            : 'inline-flex rounded border px-2 py-0.5 text-[11px] border-amber-200 bg-amber-50 text-amber-700'
                        }
                      >
                        {p.tem_nf ? m.comum.sim : m.comum.nao}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          p.ativo
                            ? 'inline-flex rounded border px-2 py-0.5 text-[11px] border-blue-200 bg-blue-50 text-blue-700'
                            : 'inline-flex rounded border px-2 py-0.5 text-[11px] border-slate-200 bg-slate-100 text-slate-600'
                        }
                      >
                        {p.ativo ? m.produtos.ativo : m.produtos.inativo}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <form action={async () => handleToggleAtivo(p.id, p.ativo)}>
                        <button
                          type="submit"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 opacity-60 group-hover:opacity-100 transition"
                        >
                          {p.ativo ? m.produtos.inativar : m.produtos.ativar}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-xs text-slate-500">
                      {m.produtos.nenhum_produto_cadastrado}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
