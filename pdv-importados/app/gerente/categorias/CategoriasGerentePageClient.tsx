'use client'

import { ChevronDown, Filter, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { GerenteCadastroBreadcrumb } from '@/components/gerente/GerenteCadastroBreadcrumb'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { objectsToCsv } from '@/lib/csv'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { atualizarCategoria, criarCategoria, excluirCategoria } from './actions'
import { CategoriaEditDialog } from './CategoriaEditDialog'
import type { CategoriaRow } from './categoriasTypes'

export type { CategoriaRow } from './categoriasTypes'

type Props = Readonly<{
  idioma: Idioma
  rows: CategoriaRow[]
}>

type FiltroSituacao = Readonly<{
  situacao: 'all' | 'ativo' | 'inativo'
}>

const FILTRO_INICIAL: FiltroSituacao = { situacao: 'all' }

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''))
}

function downloadCsv(filename: string, columns: { key: string; header: string }[], data: Record<string, unknown>[]) {
  const csv = objectsToCsv(columns, data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function passaSituacao(row: CategoriaRow, f: FiltroSituacao): boolean {
  if (f.situacao === 'ativo' && !row.ativo) return false
  if (f.situacao === 'inativo' && row.ativo) return false
  return true
}

function FiltroCategoriaCampos({
  m,
  draft,
  setDraft,
  finSelect,
  onAplicar,
  onLimpar,
}: Readonly<{
  m: Mensagens
  draft: FiltroSituacao
  setDraft: React.Dispatch<React.SetStateAction<FiltroSituacao>>
  finSelect: string
  onAplicar: () => void
  onLimpar: () => void
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="cat-sit" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.categorias.filtro_situacao_label}
        </label>
        <select
          id="cat-sit"
          value={draft.situacao}
          onChange={(e) => setDraft((d) => ({ ...d, situacao: e.target.value as FiltroSituacao['situacao'] }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.categorias.situacao_todos}</option>
          <option value="ativo">{m.categorias.situacao_ativos}</option>
          <option value="inativo">{m.categorias.situacao_inativas}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onAplicar}
        className="mt-1 h-10 w-full rounded-lg border text-xs font-semibold shadow-sm transition-opacity app-border app-btn-neutral hover:opacity-95"
      >
        {m.categorias.filtrar}
      </button>
      <button type="button" onClick={onLimpar} className="text-center text-xs font-medium app-accent-text underline-offset-2 hover:underline">
        {m.categorias.limpar_filtros}
      </button>
    </div>
  )
}

export function CategoriasGerentePageClient({ idioma, rows }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const fontClass = idioma === 'pt' ? '' : 'font-chinese'

  const mutSucessoRefreshOpts = useMemo(
    () => ({
      successMessage: m.comum.sucesso,
      onSuccess: () => {
        router.refresh()
      },
    }),
    [m.comum.sucesso, router],
  )

  const [busca, setBusca] = useState('')
  const [draftFiltro, setDraftFiltro] = useState<FiltroSituacao>(() => ({ ...FILTRO_INICIAL }))
  const [appliedFiltro, setAppliedFiltro] = useState<FiltroSituacao>(() => ({ ...FILTRO_INICIAL }))
  const [showFormNovo, setShowFormNovo] = useState(true)
  const [editRow, setEditRow] = useState<CategoriaRow | null>(null)

  const aplicarFiltros = useCallback(() => {
    setAppliedFiltro({ ...draftFiltro })
  }, [draftFiltro])

  const limparFiltros = useCallback(() => {
    setDraftFiltro({ ...FILTRO_INICIAL })
    setAppliedFiltro({ ...FILTRO_INICIAL })
  }, [])

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    return rows.filter((row) => {
      if (!passaSituacao(row, appliedFiltro)) return false
      if (!termo) return true
      const nome = row.nome.toLowerCase()
      return nome.includes(termo)
    })
  }, [rows, appliedFiltro, busca])

  const exportOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportCsv, loading: expLoading } = useGerenteMutation(
    async () => {
      downloadCsv(
        'gerente-categorias.csv',
        [
          { key: 'nome', header: m.categorias.col_nome },
          { key: 'pai', header: m.categorias.col_categoria_pai },
          { key: 'ativo', header: m.categorias.col_situacao },
        ],
        filtrados.map((r) => ({
          nome: r.nome,
          pai: r.categoria_pai_id ?? '',
          ativo: r.ativo ? m.categorias.badge_ativo : m.categorias.badge_inativo,
        })),
      )
      return null
    },
    exportOpts,
  )

  const { mutate: salvarEdit, loading: salvando } = useGerenteMutation(
    async (input: { id: string; nome: string; categoria_pai_id: string; ativo: boolean }) => {
      const r = await atualizarCategoria({
        id: input.id,
        nome: input.nome,
        categoria_pai_id: input.categoria_pai_id || null,
        ativo: input.ativo,
      })
      if (!r.success) throw new Error(r.error)
      setEditRow(null)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const { mutate: criar, loading: criando } = useGerenteMutation(
    async (input: { nome: string; categoria_pai_id: string }) => {
      const r = await criarCategoria({
        nome: input.nome,
        categoria_pai_id: input.categoria_pai_id || undefined,
      })
      if (!r.success) throw new Error(r.error)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const { mutate: excluir, loading: excluindo } = useGerenteMutation(
    async (id: string) => {
      const r = await excluirCategoria(id)
      if (!r.success) throw new Error(r.error)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'

  return (
    <div className={`mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 ${fontClass}`}>
      <CategoriaEditDialog
        open={editRow !== null}
        row={editRow}
        m={m}
        saving={salvando}
        onClose={() => setEditRow(null)}
        onSave={async (input) => {
          await salvarEdit(input)
        }}
      />

      <div className="mb-3 space-y-2">
        <GerenteCadastroBreadcrumb m={m} tituloPagina={m.categorias.titulo} />
        <GerenteFilterBar title={m.categorias.titulo} />
        <p className="gerente-fin-muted text-xs">{m.categorias.subtitulo}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:block">
          <div className="dragon-glass-card sticky top-4 rounded-xl p-4">
            <div className="gerente-fin-divider mb-4 flex items-center gap-2 border-b pb-3">
              <Filter className="h-4 w-4 shrink-0 app-accent-text" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wide">{m.categorias.painel_filtrar}</span>
            </div>
            <FiltroCategoriaCampos
              m={m}
              draft={draftFiltro}
              setDraft={setDraftFiltro}
              finSelect={finSelect}
              onAplicar={aplicarFiltros}
              onLimpar={limparFiltros}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <details className="group dragon-glass-card overflow-hidden rounded-xl lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm">
                <Filter className="h-4 w-4 app-accent-text" aria-hidden />
                {m.categorias.painel_filtrar}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="gerente-fin-divider border-t p-4">
              <FiltroCategoriaCampos
                m={m}
                draft={draftFiltro}
                setDraft={setDraftFiltro}
                finSelect={finSelect}
                onAplicar={aplicarFiltros}
                onLimpar={limparFiltros}
              />
            </div>
          </details>

          {showFormNovo ? (
            <section className="dragon-glass-card overflow-hidden rounded-xl">
              <div className="gerente-fin-divider border-b px-3 py-2.5">
                <h2 className="gerente-section-accent text-sm font-semibold">{m.categorias.cadastro_rapido}</h2>
              </div>
              <form
                className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-6"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const nome = readFormDataString(fd, 'nome').trim()
                  if (!nome) {
                    return
                  }
                  const ok = await criar({
                    nome,
                    categoria_pai_id: readFormDataString(fd, 'categoria_pai_id'),
                  })
                  if (ok) {
                    e.currentTarget.reset()
                  }
                }}
              >
                <input name="nome" placeholder={m.categorias.label_nome} className={`${finIn} md:col-span-3`} required />
                <input
                  name="categoria_pai_id"
                  placeholder={m.categorias.placeholder_categoria_pai}
                  className={`${finIn} md:col-span-2`}
                />
                <button
                  type="submit"
                  disabled={criando}
                  className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent"
                >
                  {criando ? '…' : m.comum.salvar}
                </button>
              </form>
            </section>
          ) : null}

          <section className="dragon-glass-card overflow-hidden rounded-xl">
            <div className="gerente-fin-divider flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <h2 className="gerente-section-accent text-sm font-semibold">{m.categorias.lista_titulo}</h2>
              <p className="gerente-fin-muted text-xs font-medium">
                {interpolate(m.categorias.contador_encontrados, { count: filtrados.length })}
              </p>
            </div>

            <div className="gerente-fin-divider flex flex-wrap items-center gap-2 border-b p-3">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={m.categorias.buscar_placeholder}
                className={`${finIn} h-9 min-h-[2.25rem] min-w-[min(100%,12rem)] flex-1`}
                aria-label={m.categorias.buscar_placeholder}
              />
              <button
                type="button"
                disabled={expLoading || filtrados.length === 0}
                onClick={() => void exportCsv(null)}
                className="gerente-btn-csv shrink-0 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                onClick={() => setShowFormNovo((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold shadow-sm transition-opacity app-btn-accent"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {m.categorias.incluir}
              </button>
            </div>

            <div className="p-3">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'nome', header: m.categorias.col_nome },
                  { key: 'pai', header: m.categorias.col_categoria_pai },
                  { key: 'sit', header: m.categorias.col_situacao },
                  { key: 'ac', header: m.categorias.col_acoes, width: '6rem' },
                ]}
              >
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="gerente-fin-empty px-3 py-4 text-xs">
                      {m.categorias.nenhum_registro}
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="gerente-fin-empty px-3 py-4 text-xs">
                      {m.categorias.nenhum_resultado_filtro}
                    </td>
                  </tr>
                ) : (
                  filtrados.map((r) => (
                    <tr key={r.id} className="group gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-2 font-medium">{r.nome}</td>
                      <td className="gerente-fin-cell px-3 py-2 text-xs">
                        {r.categoria_pai_id ? r.categoria_pai_id : <span className="app-muted">{m.categorias.sem_categoria_pai}</span>}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2">
                        <GerenteStatusBadge
                          status={r.ativo ? 'ATIVO' : 'INATIVO'}
                          label={r.ativo ? m.categorias.badge_ativo : m.categorias.badge_inativo}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="inline-flex rounded-md p-1.5 text-[color:var(--color-brand-primary)] opacity-90 transition hover:opacity-100"
                            aria-label={m.categorias.btn_editar_aria}
                            onClick={() => setEditRow(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={excluindo}
                            className="inline-flex rounded-md p-1.5 text-slate-500 opacity-90 transition hover:opacity-100 disabled:opacity-40"
                            aria-label={m.categorias.btn_excluir_aria}
                            onClick={() => {
                              if (!window.confirm(m.categorias.confirmar_excluir)) return
                              void excluir(r.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </GerenteTable>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

