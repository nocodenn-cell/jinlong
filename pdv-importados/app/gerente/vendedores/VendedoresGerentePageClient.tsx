'use client'

import { ChevronDown, Filter, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
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
import { atualizarVendedor, criarVendedor, excluirVendedor } from './actions'
import { VendedorEditDialog } from './VendedorEditDialog'
import type { VendedorGerenteRow } from './vendedoresTypes'

export type { VendedorGerenteRow } from './vendedoresTypes'

type Props = Readonly<{
  idioma: Idioma
  rows: VendedorGerenteRow[]
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

function passaSituacao(row: VendedorGerenteRow, f: FiltroSituacao): boolean {
  if (f.situacao === 'ativo' && !row.ativo) return false
  if (f.situacao === 'inativo' && row.ativo) return false
  return true
}

function FiltroVendedorCampos({
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
        <label htmlFor="ven-sit" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.vendedores.filtro_situacao_label}
        </label>
        <select
          id="ven-sit"
          value={draft.situacao}
          onChange={(e) => setDraft((d) => ({ ...d, situacao: e.target.value as FiltroSituacao['situacao'] }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.vendedores.situacao_todos}</option>
          <option value="ativo">{m.vendedores.situacao_ativos}</option>
          <option value="inativo">{m.vendedores.situacao_inativos}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onAplicar}
        className="mt-1 h-10 w-full rounded-lg border text-xs font-semibold shadow-sm transition-opacity app-border app-btn-neutral hover:opacity-95"
      >
        {m.vendedores.filtrar}
      </button>
      <button type="button" onClick={onLimpar} className="text-center text-xs font-medium app-accent-text underline-offset-2 hover:underline">
        {m.vendedores.limpar_filtros}
      </button>
    </div>
  )
}

export function VendedoresGerentePageClient({ idioma, rows }: Props) {
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
  const [editRow, setEditRow] = useState<VendedorGerenteRow | null>(null)

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
      const cod = row.codigo.toLowerCase()
      const cpf = (row.cpf ?? '').toLowerCase()
      return nome.includes(termo) || cod.includes(termo) || cpf.includes(termo)
    })
  }, [rows, appliedFiltro, busca])

  const exportOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportCsv, loading: expLoading } = useGerenteMutation(
    async () => {
      downloadCsv(
        'gerente-vendedores.csv',
        [
          { key: 'codigo', header: m.vendedores.col_codigo },
          { key: 'nome', header: m.vendedores.col_nome },
          { key: 'cpf', header: m.vendedores.col_cpf },
          { key: 'celular', header: m.vendedores.col_celular },
          { key: 'ativo', header: m.vendedores.col_situacao },
        ],
        filtrados.map((r) => ({
          codigo: r.codigo,
          nome: r.nome,
          cpf: r.cpf ?? '',
          celular: r.celular ?? '',
          ativo: r.ativo ? m.vendedores.badge_ativo : m.vendedores.badge_inativo,
        })),
      )
      return null
    },
    exportOpts,
  )

  const { mutate: salvarEdicao, loading: salvaEdicao } = useGerenteMutation(
    async (input: { id: string; codigo: string; nome: string; cpf: string; celular: string; ativo: boolean }) => {
      const r = await atualizarVendedor(input)
      if (!r.success) throw new Error(r.error)
      setEditRow(null)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const { mutate: criar, loading: criarLoading } = useGerenteMutation(
    async (input: { codigo: string; nome: string; cpf: string; celular: string }) => {
      const r = await criarVendedor(input)
      if (!r.success) throw new Error(r.error)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const { mutate: excluir, loading: excluirLoading } = useGerenteMutation(
    async (id: string) => {
      const r = await excluirVendedor(id)
      if (!r.success) throw new Error(r.error)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'

  const fmt = (v: string | null) => (v && v.trim() !== '' ? v : null)

  return (
    <div className={`mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 ${fontClass}`}>
      <VendedorEditDialog
        open={editRow !== null}
        row={editRow}
        m={m}
        saving={salvaEdicao}
        onClose={() => setEditRow(null)}
        onSave={async (input) => {
          await salvarEdicao(input)
        }}
      />

      <div className="mb-3 space-y-2">
        <GerenteCadastroBreadcrumb m={m} tituloPagina={m.vendedores.titulo} />
        <GerenteFilterBar title={m.vendedores.titulo} />
        <p className="gerente-fin-muted text-xs">{m.vendedores.subtitulo}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start lg:gap-8">
        <aside className="hidden print:hidden lg:block">
          <div className="dragon-glass-card sticky top-4 rounded-xl p-4">
            <div className="gerente-fin-divider mb-4 flex items-center gap-2 border-b pb-3">
              <Filter className="h-4 w-4 shrink-0 app-accent-text" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wide">{m.vendedores.painel_filtrar}</span>
            </div>
            <FiltroVendedorCampos
              m={m}
              draft={draftFiltro}
              setDraft={setDraftFiltro}
              finSelect={finSelect}
              onAplicar={aplicarFiltros}
              onLimpar={limparFiltros}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-4 print:col-span-full">
          <details className="group dragon-glass-card overflow-hidden rounded-xl print:hidden lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm">
                <Filter className="h-4 w-4 app-accent-text" aria-hidden />
                {m.vendedores.painel_filtrar}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="gerente-fin-divider border-t p-4">
              <FiltroVendedorCampos
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
            <section className="dragon-glass-card overflow-hidden rounded-xl print:hidden">
              <div className="gerente-fin-divider border-b px-3 py-2.5">
                <h2 className="gerente-section-accent text-sm font-semibold">{m.vendedores.cadastro_rapido}</h2>
              </div>
              <form
                className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-6"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const ok = await criar({
                    codigo: readFormDataString(fd, 'codigo'),
                    nome: readFormDataString(fd, 'nome'),
                    cpf: readFormDataString(fd, 'cpf'),
                    celular: readFormDataString(fd, 'celular'),
                  })
                  if (ok) {
                    e.currentTarget.reset()
                  }
                }}
              >
                <input name="codigo" placeholder={m.vendedores.placeholder_codigo} className={`${finIn} md:col-span-1`} required />
                <input name="nome" placeholder={m.vendedores.col_nome} className={`${finIn} md:col-span-2`} required />
                <input name="cpf" placeholder={m.vendedores.col_cpf} className={finIn} />
                <input name="celular" placeholder={m.vendedores.col_celular} className={finIn} />
                <button
                  type="submit"
                  disabled={criarLoading}
                  className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent md:col-span-2"
                >
                  {criarLoading ? '…' : m.comum.salvar}
                </button>
              </form>
            </section>
          ) : null}

          <section className="dragon-glass-card overflow-hidden rounded-xl">
            <div className="gerente-fin-divider flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <h2 className="gerente-section-accent text-sm font-semibold">{m.vendedores.lista_titulo}</h2>
              <p className="gerente-fin-muted text-xs font-medium">
                {interpolate(m.vendedores.contador_encontrados, { count: filtrados.length })}
              </p>
            </div>

            <div className="gerente-fin-divider flex flex-wrap items-center gap-2 border-b p-3">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={m.vendedores.buscar_placeholder}
                className={`${finIn} h-9 min-h-[2.25rem] min-w-[min(100%,12rem)] flex-1`}
                aria-label={m.vendedores.buscar_placeholder}
              />
              <button
                type="button"
                className="gerente-btn-csv shrink-0 rounded-md border px-3 py-2 text-xs font-medium app-border app-btn-neutral print:hidden"
                aria-label={m.vendedores.btn_imprimir_aria}
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={expLoading || filtrados.length === 0}
                onClick={() => void exportCsv(null)}
                className="gerente-btn-csv shrink-0 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50 print:hidden"
              >
                {m.gerente.exportar_csv}
              </button>
              <button
                type="button"
                onClick={() => setShowFormNovo((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold shadow-sm transition-opacity app-btn-accent print:hidden"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {m.vendedores.incluir}
              </button>
            </div>

            <div className="p-3">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'cod', header: m.vendedores.col_codigo },
                  { key: 'nome', header: m.vendedores.col_nome },
                  { key: 'cpf', header: m.vendedores.col_cpf },
                  { key: 'cel', header: m.vendedores.col_celular },
                  { key: 'sit', header: m.vendedores.col_situacao },
                  { key: 'ac', header: m.vendedores.col_acoes, width: '6rem' },
                ]}
              >
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="gerente-fin-empty px-3 py-4 text-xs">
                      {m.vendedores.nenhum_registro}
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="gerente-fin-empty px-3 py-4 text-xs">
                      {m.vendedores.nenhum_resultado_filtro}
                    </td>
                  </tr>
                ) : (
                  filtrados.map((r) => (
                    <tr key={r.id} className="group gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px] font-semibold">{r.codigo}</td>
                      <td className="gerente-fin-cell px-3 py-2 font-medium">{r.nome}</td>
                      <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px]">
                        {fmt(r.cpf) ? (
                          <span className="text-[color:var(--color-brand-primary)]">{r.cpf}</span>
                        ) : (
                          <span className="app-muted">{m.vendedores.sem_campo}</span>
                        )}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px]">
                        {fmt(r.celular) ? r.celular : <span className="app-muted">{m.vendedores.sem_campo}</span>}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2">
                        <GerenteStatusBadge
                          status={r.ativo ? 'ATIVO' : 'INATIVO'}
                          label={r.ativo ? m.vendedores.badge_ativo : m.vendedores.badge_inativo}
                        />
                      </td>
                      <td className="px-3 py-2 print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="inline-flex rounded-md p-1.5 text-[color:var(--color-brand-primary)] opacity-90 transition hover:opacity-100"
                            aria-label={m.vendedores.btn_editar_aria}
                            onClick={() => setEditRow(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={excluirLoading}
                            className="inline-flex rounded-md p-1.5 text-slate-500 opacity-90 transition hover:opacity-100 disabled:opacity-40"
                            aria-label={m.vendedores.btn_excluir_aria}
                            onClick={() => {
                              if (!window.confirm(m.vendedores.confirmar_excluir)) return
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
