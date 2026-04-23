'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { objectsToCsv } from '@/lib/csv'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { formatBRL } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { alternarAtivoProduto, criarProduto } from './actions'

export type ProdutoGerenteRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
}

type Props = Readonly<{
  idioma: Idioma
  rows: ProdutoGerenteRow[]
}>

function downloadCsv(filename: string, columns: { key: string; header: string }[], rows: Record<string, unknown>[]) {
  const csv = objectsToCsv(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ProdutosGerentePageClient({ idioma, rows }: Props) {
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const router = useRouter()
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'
  const refetch = useCallback(() => router.refresh(), [router])

  const exportOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportCsv, loading: expLoading } = useGerenteMutation(
    async (_: null) => {
      downloadCsv(
        'gerente-produtos.csv',
        [
          { key: 'id', header: 'id' },
          { key: 'nome', header: m.produtos.nome },
          { key: 'codigo_barras', header: m.produtos.codigo_barras },
          { key: 'preco_varejo', header: m.produtos.preco_varejo },
          { key: 'origem', header: m.produtos.origem_label },
          { key: 'tem_nf', header: m.produtos.tem_nf },
          { key: 'ativo', header: m.produtos.status },
        ],
        rows.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo_barras: p.codigo_barras ?? '',
          preco_varejo: Number(p.preco_varejo),
          origem: p.origem,
          tem_nf: p.tem_nf ? '1' : '0',
          ativo: p.ativo ? '1' : '0',
        })),
      )
      return null
    },
    exportOpts,
  )

  const { mutate: criar, loading: criarLoading } = useGerenteMutation(
    async (input: {
      nome: string
      codigo_barras: string
      preco_varejo: number
      origem: string
      tem_nf: boolean
    }) => {
      const r = await criarProduto(input)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    { successMessage: m.comum.sucesso },
  )

  const { mutate: toggle, loading: toggleLoading } = useGerenteMutation(
    async (p: { id: string; ativo: boolean }) => {
      const r = await alternarAtivoProduto(p.id, p.ativo)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: m.comum.sucesso },
  )

  return (
    <div className={`min-h-screen bg-slate-50 px-4 py-4 md:px-6 ${fontClass}`}>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <GerenteFilterBar
          title={m.produtos.titulo}
          rightSlot={
            <button
              type="button"
              disabled={expLoading || rows.length === 0}
              onClick={() => void exportCsv(null)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {m.gerente.exportar_csv}
            </button>
          }
        />
        <p className="text-xs text-slate-500 -mt-2">
          {idioma === 'pt'
            ? 'Gestão de catálogo com visão densa para operação diária.'
            : '高密度商品管理视图，适合日常运营。'}
        </p>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-800">{m.produtos.cadastro_rapido}</h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void criar({
                nome: readFormDataString(fd, 'nome'),
                codigo_barras: readFormDataString(fd, 'codigo_barras'),
                preco_varejo: Number(fd.get('preco_varejo')),
                origem: readFormDataString(fd, 'origem'),
                tem_nf: fd.get('tem_nf') === 'on',
              })
              e.currentTarget.reset()
            }}
            className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-6"
          >
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
              disabled={criarLoading}
              className="h-9 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {criarLoading ? '…' : m.comum.salvar}
            </button>
            <label className="md:col-span-6 inline-flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name="tem_nf" className="h-3.5 w-3.5 rounded border-slate-300" />
              {m.produtos.tem_nf}
              <span className="text-slate-400">· {m.produtos.codigo_barras_opcional}</span>
            </label>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-800">{m.produtos.lista_produtos}</h2>
          </div>

          <div className="grid grid-cols-1 gap-2 border-b border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-4">
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

          <div className="p-3">
            <GerenteTable
              columns={[
                { key: 'id', header: 'ID' },
                { key: 'nome', header: m.produtos.nome },
                { key: 'cb', header: m.produtos.codigo_barras },
                { key: 'preco', header: m.produtos.preco_varejo, width: '7rem' },
                { key: 'origem', header: m.produtos.origem_label },
                { key: 'nf', header: m.produtos.tem_nf },
                { key: 'st', header: m.produtos.status },
                { key: 'ac', header: m.produtos.acoes, width: '6rem' },
              ]}
            >
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-xs text-slate-500">
                    {m.produtos.nenhum_produto_cadastrado}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="group border-t border-slate-100 transition-colors hover:bg-blue-50/50">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{p.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 font-medium leading-relaxed text-slate-900">{p.nome}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{p.codigo_barras ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {formatBRL(Number(p.preco_varejo), locale)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.origem}</td>
                    <td className="px-3 py-2">
                      <GerenteStatusBadge status={p.tem_nf ? 'TEM_NF' : 'SEM_NF'} label={p.tem_nf ? m.comum.sim : m.comum.nao} />
                    </td>
                    <td className="px-3 py-2">
                      <GerenteStatusBadge
                        status={p.ativo ? 'ATIVO' : 'INATIVO'}
                        label={p.ativo ? m.produtos.ativo : m.produtos.inativo}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        disabled={toggleLoading}
                        onClick={() => void toggle({ id: p.id, ativo: !p.ativo })}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 opacity-60 transition hover:bg-slate-50 group-hover:opacity-100 disabled:opacity-40"
                      >
                        {p.ativo ? m.produtos.inativar : m.produtos.ativar}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </GerenteTable>
          </div>
        </section>
      </div>
    </div>
  )
}
