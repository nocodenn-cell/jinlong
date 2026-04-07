import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { criarProduto, alternarAtivoProduto } from './actions'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { fmtTemplate } from '@/src/lib/i18n/fmtTemplate'

type ProdutoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
}

const PAGE_SIZE = 20
const EXPORT_MAX = 5000

type OrigemFiltro = '' | 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

type FiltrosLista = {
  q: string
  codigo: string
  origem: OrigemFiltro
  ativo: '' | '1' | '0'
  nf: '' | '1' | '0'
  page: number
}

function getParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = sp[key]
  const raw = Array.isArray(v) ? v[0] : v
  return typeof raw === 'string' ? raw : ''
}

function parseOrigem(v: string): OrigemFiltro {
  if (v === 'china_manual' || v === 'brasil_nf' || v === 'brasil_sem_nf') return v
  return ''
}

function parseBinario(v: string): '' | '1' | '0' {
  if (v === '1' || v === '0') return v
  return ''
}

function parseFiltros(
  sp: Record<string, string | string[] | undefined>,
): FiltrosLista {
  const pageRaw = parseInt(getParam(sp, 'page'), 10)
  return {
    q: getParam(sp, 'q').trim(),
    codigo: getParam(sp, 'codigo').trim(),
    origem: parseOrigem(getParam(sp, 'origem')),
    ativo: parseBinario(getParam(sp, 'ativo')),
    nf: parseBinario(getParam(sp, 'nf')),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
  }
}

type FiltroProd = Omit<FiltrosLista, 'page'>

/** Encadeia filtros PostgREST (builder do Supabase). */
function applyFiltrosProdutos(query: any, f: FiltroProd) {
  let q = query
  if (f.q) q = q.ilike('nome', `%${f.q.replace(/%/g, '')}%`)
  if (f.codigo) q = q.ilike('codigo_barras', `%${f.codigo.replace(/%/g, '')}%`)
  if (f.origem) q = q.eq('origem', f.origem)
  if (f.ativo === '1') q = q.eq('ativo', true)
  if (f.ativo === '0') q = q.eq('ativo', false)
  if (f.nf === '1') q = q.eq('tem_nf', true)
  if (f.nf === '0') q = q.eq('tem_nf', false)
  return q
}

function queryString(f: FiltrosLista, overrides: Partial<FiltrosLista> = {}) {
  const m = { ...f, ...overrides }
  const p = new URLSearchParams()
  if (m.q) p.set('q', m.q)
  if (m.codigo) p.set('codigo', m.codigo)
  if (m.origem) p.set('origem', m.origem)
  if (m.ativo === '1' || m.ativo === '0') p.set('ativo', m.ativo)
  if (m.nf === '1' || m.nf === '0') p.set('nf', m.nf)
  if (m.page > 1) p.set('page', String(m.page))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const filtros = parseFiltros(sp)
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = idioma === 'zh' ? 'zh-CN' : idioma === 'zh-HK' ? 'zh-HK' : 'pt-BR'
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'

  const supabase = await createClient()
  const { q, codigo, origem, ativo, nf, page: reqPage } = filtros
  const baseFiltros = { q, codigo, origem, ativo, nf }

  let qCount = supabase.from('produtos').select('id', { count: 'exact', head: true })
  qCount = applyFiltrosProdutos(qCount, baseFiltros)
  const { count: totalMatch } = await qCount
  const total = totalMatch ?? 0

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, reqPage), totalPages)

  if (page !== reqPage) {
    redirect(`/gerente/produtos${queryString({ ...filtros, page })}`)
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let qList = supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, origem, tem_nf, ativo')
  qList = applyFiltrosProdutos(qList, baseFiltros)
  const { data: produtos } = await qList
    .order('nome', { ascending: true })
    .range(from, to)

  const rows = (produtos as ProdutoRow[] | null) ?? []

  let qExport = supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, origem, tem_nf, ativo')
  qExport = applyFiltrosProdutos(qExport, baseFiltros)
  const { data: exportRowsRaw } = await qExport
    .order('nome', { ascending: true })
    .range(0, EXPORT_MAX - 1)
  const exportRows = (exportRowsRaw as ProdutoRow[] | null) ?? []

  const temFiltro =
    Boolean(q) ||
    Boolean(codigo) ||
    Boolean(origem) ||
    ativo !== '' ||
    nf !== ''

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

  const filtrosComPagina = (p: number): FiltrosLista => ({ ...filtros, page: p })

  return (
    <div className={`min-h-screen bg-slate-50 px-4 py-4 md:px-6 ${fontClass}`}>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <div className="text-xs">
          <Link href="/gerente" className="text-blue-600 hover:text-blue-700">
            ← {m.gerente.inicio}
          </Link>
        </div>

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
            rows={exportRows.map((p) => ({
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
          <div className="border-b border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{m.produtos.lista_produtos}</h2>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {fmtTemplate(m.produtos.lista_total, { total })}
              {exportRows.length >= EXPORT_MAX ? ` · ≤${EXPORT_MAX}` : ''}
            </span>
          </div>

          <form
            method="get"
            action="/gerente/produtos"
            className="border-b border-slate-200 bg-slate-50/80 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2"
          >
            <input
              name="q"
              defaultValue={q}
              placeholder={m.produtos.busca_nome}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 lg:col-span-2"
            />
            <input
              name="codigo"
              defaultValue={codigo}
              placeholder={m.produtos.busca_codigo}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <select
              name="origem"
              defaultValue={origem}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{m.produtos.filtro_todas_origens}</option>
              <option value="china_manual">{m.produtos.origem_china}</option>
              <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
              <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
            </select>
            <select
              name="ativo"
              defaultValue={ativo}
              className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{m.produtos.filtro_todos_status}</option>
              <option value="1">{m.produtos.ativo}</option>
              <option value="0">{m.produtos.inativo}</option>
            </select>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <select
                name="nf"
                defaultValue={nf}
                className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{m.produtos.filtro_todas_nf}</option>
                <option value="1">{m.produtos.filtro_nf_sim}</option>
                <option value="0">{m.produtos.filtro_nf_nao}</option>
              </select>
              <button
                type="submit"
                className="h-8 shrink-0 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
              >
                {m.produtos.filtrar}
              </button>
            </div>
          </form>

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
                      {temFiltro || page > 1
                        ? m.produtos.nenhum_resultado_filtro
                        : m.produtos.nenhum_produto_cadastrado}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
            <span className="tabular-nums">
              {fmtTemplate(m.produtos.pag_info, { atual: page, total: totalPages })}
            </span>
            <div className="flex items-center gap-1">
              <Link
                href={`/gerente/produtos${queryString(filtrosComPagina(Math.max(1, page - 1)))}`}
                className={
                  page <= 1
                    ? 'pointer-events-none rounded border border-slate-200 px-2 py-1 text-slate-400'
                    : 'rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50'
                }
                aria-disabled={page <= 1}
              >
                {m.produtos.pag_prev}
              </Link>
              <span className="px-1.5 tabular-nums text-slate-800 font-medium">{page}</span>
              <Link
                href={`/gerente/produtos${queryString(filtrosComPagina(Math.min(totalPages, page + 1)))}`}
                className={
                  page >= totalPages
                    ? 'pointer-events-none rounded border border-slate-200 px-2 py-1 text-slate-400'
                    : 'rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50'
                }
                aria-disabled={page >= totalPages}
              >
                {m.produtos.pag_next}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
