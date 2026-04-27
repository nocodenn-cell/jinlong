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

  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'

  return (
    <div className={`mx-auto w-full max-w-7xl space-y-4 px-4 py-6 md:px-6 ${fontClass}`}>
      <GerenteFilterBar
        title={m.produtos.titulo}
        rightSlot={
          <button
            type="button"
            disabled={expLoading || rows.length === 0}
            onClick={() => void exportCsv(null)}
            className="gerente-btn-csv rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {m.gerente.exportar_csv}
          </button>
        }
      />
      <p className="gerente-fin-muted -mt-2 text-xs">
        {idioma === 'pt'
          ? 'Gestão de catálogo com visão densa para operação diária.'
          : '高密度商品管理视图，适合日常运营。'}
      </p>

      <section className="dragon-glass-card overflow-hidden rounded-xl">
        <div className="gerente-fin-divider border-b px-3 py-2.5">
          <h2 className="gerente-section-accent text-sm font-semibold">{m.produtos.cadastro_rapido}</h2>
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
            <input name="nome" placeholder={m.produtos.nome} required className={`${finIn} md:col-span-2`} />
            <input name="codigo_barras" placeholder={m.produtos.codigo_barras} className={finIn} />
            <input
              name="preco_varejo"
              type="number"
              step="0.01"
              min="0"
              placeholder={m.produtos.preco_varejo}
              required
              className={finIn}
            />
            <select name="origem" defaultValue="china_manual" className={finSelect}>
              <option value="china_manual">{m.produtos.origem_china}</option>
              <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
              <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
            </select>
            <button
              type="submit"
              disabled={criarLoading}
              className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
            >
              {criarLoading ? '…' : m.comum.salvar}
            </button>
            <label className="gerente-fin-muted md:col-span-6 inline-flex items-center gap-2 text-xs">
              <input type="checkbox" name="tem_nf" className="h-3.5 w-3.5 rounded app-border app-surface-soft" />
              {m.produtos.tem_nf}
              <span className="opacity-80">· {m.produtos.codigo_barras_opcional}</span>
            </label>
          </form>
        </section>

        <section className="dragon-glass-card overflow-hidden rounded-xl">
          <div className="gerente-fin-divider border-b px-3 py-2.5">
            <h2 className="gerente-section-accent text-sm font-semibold">{m.produtos.lista_produtos}</h2>
          </div>

          <div className="gerente-fin-divider grid grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-4">
            <input disabled placeholder={m.produtos.buscar} className={`${finIn} h-8 cursor-not-allowed opacity-60`} />
            <select disabled className={`${finSelect} h-8 cursor-not-allowed opacity-60`}>
              <option>{m.produtos.origem_label}</option>
            </select>
            <select disabled className={`${finSelect} h-8 cursor-not-allowed opacity-60`}>
              <option>{m.produtos.status}</option>
            </select>
            <select disabled className={`${finSelect} h-8 cursor-not-allowed opacity-60`}>
              <option>{m.produtos.tem_nf}</option>
            </select>
          </div>

          <div className="p-3">
            <GerenteTable
              tone="dragon"
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
                  <td colSpan={8} className="gerente-fin-empty px-3 py-4 text-xs">
                    {m.produtos.nenhum_produto_cadastrado}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className="group gerente-fin-row-hover transition-colors">
                    <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px] opacity-80">
                      {p.id.slice(0, 8)}
                    </td>
                    <td className="gerente-fin-cell px-3 py-2 font-medium leading-relaxed">{p.nome}</td>
                    <td className="gerente-fin-cell px-3 py-2 font-mono">{p.codigo_barras ?? '-'}</td>
                    <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums font-semibold">
                      {formatBRL(Number(p.preco_varejo), locale)}
                    </td>
                    <td className="gerente-fin-cell px-3 py-2">{p.origem}</td>
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
                        className="gerente-chip-action rounded-md border px-2 py-1 text-[11px] font-medium opacity-90 transition group-hover:opacity-100 disabled:opacity-40"
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
  )
}
