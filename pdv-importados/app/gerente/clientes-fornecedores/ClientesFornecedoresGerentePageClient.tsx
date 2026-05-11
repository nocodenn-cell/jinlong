'use client'

import { ChevronDown, Filter, Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { criarCliente } from '@/app/gerente/financeiro/actions'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { objectsToCsv } from '@/lib/csv'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { atualizarClienteContato, atualizarFornecedorContato, criarFornecedorContato } from './actions'
import { ContatoEditDialog } from './ContatoEditDialog'
import type { ContatoGerenteListaRow } from './contatosTypes'

export type { ContatoGerenteListaRow } from './contatosTypes'

type Props = Readonly<{
  idioma: Idioma
  rows: ContatoGerenteListaRow[]
}>

type FiltroContatosState = Readonly<{
  situacao: 'all' | 'ativo' | 'inativo'
  tipo: 'all' | 'CLIENTE' | 'FORNECEDOR'
}>

const FILTRO_INICIAL: FiltroContatosState = {
  situacao: 'all',
  tipo: 'all',
}

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

function rowPassaFiltro(row: ContatoGerenteListaRow, f: FiltroContatosState): boolean {
  if (f.tipo === 'CLIENTE' && row.tipo !== 'CLIENTE') return false
  if (f.tipo === 'FORNECEDOR' && row.tipo !== 'FORNECEDOR') return false
  if (f.situacao === 'ativo') {
    if (row.tipo === 'CLIENTE' && !row.ativo) return false
  }
  if (f.situacao === 'inativo') {
    if (row.tipo === 'FORNECEDOR') return false
    if (row.tipo === 'CLIENTE' && row.ativo) return false
  }
  return true
}

function ContatosFiltrosCampos({
  m,
  draft,
  setDraft,
  finSelect,
  onAplicar,
  onLimpar,
}: Readonly<{
  m: Mensagens
  draft: FiltroContatosState
  setDraft: React.Dispatch<React.SetStateAction<FiltroContatosState>>
  finSelect: string
  onAplicar: () => void
  onLimpar: () => void
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="cf-situacao" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.contatos.filtro_situacao_label}
        </label>
        <select
          id="cf-situacao"
          value={draft.situacao}
          onChange={(e) => setDraft((d) => ({ ...d, situacao: e.target.value as FiltroContatosState['situacao'] }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.contatos.situacao_todos}</option>
          <option value="ativo">{m.contatos.situacao_ativos}</option>
          <option value="inativo">{m.contatos.situacao_inativos}</option>
        </select>
      </div>
      <div>
        <label htmlFor="cf-tipo" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">
          {m.contatos.filtro_tipo_label}
        </label>
        <select
          id="cf-tipo"
          value={draft.tipo}
          onChange={(e) => setDraft((d) => ({ ...d, tipo: e.target.value as FiltroContatosState['tipo'] }))}
          className={`${finSelect} h-9 w-full`}
        >
          <option value="all">{m.contatos.tipo_todos}</option>
          <option value="CLIENTE">{m.contatos.tipo_cliente}</option>
          <option value="FORNECEDOR">{m.contatos.tipo_fornecedor}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onAplicar}
        className="mt-1 h-10 w-full rounded-lg border text-xs font-semibold shadow-sm transition-opacity app-border app-btn-neutral hover:opacity-95"
      >
        {m.contatos.filtrar}
      </button>
      <button type="button" onClick={onLimpar} className="text-center text-xs font-medium app-accent-text underline-offset-2 hover:underline">
        {m.contatos.limpar_filtros}
      </button>
    </div>
  )
}

export function ClientesFornecedoresGerentePageClient({ idioma, rows }: Props) {
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
  const [draftFiltro, setDraftFiltro] = useState<FiltroContatosState>(() => ({ ...FILTRO_INICIAL }))
  const [appliedFiltro, setAppliedFiltro] = useState<FiltroContatosState>(() => ({ ...FILTRO_INICIAL }))
  const [showFormNovo, setShowFormNovo] = useState(true)
  const [tipoNovo, setTipoNovo] = useState<'CLIENTE' | 'FORNECEDOR'>('CLIENTE')
  const [editRow, setEditRow] = useState<ContatoGerenteListaRow | null>(null)

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
      if (!rowPassaFiltro(row, appliedFiltro)) return false
      if (!termo) return true
      const nome = row.nome.toLowerCase()
      const doc = (row.documento ?? '').toLowerCase()
      return nome.includes(termo) || doc.includes(termo)
    })
  }, [rows, appliedFiltro, busca])

  const exportOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportCsv, loading: expLoading } = useGerenteMutation(
    async () => {
      downloadCsv(
        'gerente-contatos.csv',
        [
          { key: 'nome', header: m.contatos.col_nome_empresa },
          { key: 'tipo', header: m.contatos.col_tipo },
          { key: 'documento', header: m.contatos.col_documento },
          { key: 'ativo', header: m.contatos.label_ativo },
        ],
        filtrados.map((r) => ({
          nome: r.nome,
          tipo: r.tipo === 'CLIENTE' ? m.contatos.tipo_cliente : m.contatos.tipo_fornecedor,
          documento: r.documento ?? '',
          ativo: r.tipo === 'CLIENTE' ? (r.ativo ? m.comum.sim : m.comum.nao) : '—',
        })),
      )
      return null
    },
    exportOpts,
  )

  const { mutate: salvarClienteEdit, loading: salvaCliente } = useGerenteMutation(
    async (input: { id: string; nome: string; documento: string; telefone: string; ativo: boolean }) => {
      const r = await atualizarClienteContato(input)
      if (!r.success) throw new Error(r.error)
      setEditRow(null)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const { mutate: salvarFornecedorEdit, loading: salvaFornecedor } = useGerenteMutation(
    async (input: { id: string; nome: string; cnpj: string }) => {
      const r = await atualizarFornecedorContato(input)
      if (!r.success) throw new Error(r.error)
      setEditRow(null)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const savingEdit = salvaCliente || salvaFornecedor

  const { mutate: criarCli, loading: criarCliLoading } = useGerenteMutation(
    async (input: { nome: string; documento: string; telefone: string }) => {
      const r = await criarCliente({
        nome: input.nome,
        documento: input.documento || undefined,
        telefone: input.telefone || undefined,
      })
      if (!r.success) throw new Error(r.error)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const { mutate: criarForn, loading: criarFornLoading } = useGerenteMutation(
    async (input: { nome: string; cnpj: string }) => {
      const r = await criarFornecedorContato(input)
      if (!r.success) throw new Error(r.error)
      return true
    },
    mutSucessoRefreshOpts,
  )

  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'

  return (
    <div className={`mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 ${fontClass}`}>
      <ContatoEditDialog
        open={editRow !== null}
        row={editRow}
        m={m}
        saving={savingEdit}
        onClose={() => setEditRow(null)}
        onSaveCliente={async (input) => {
          await salvarClienteEdit(input)
        }}
        onSaveFornecedor={async (input) => {
          await salvarFornecedorEdit(input)
        }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:block">
          <div className="dragon-glass-card sticky top-4 rounded-xl p-4">
            <div className="gerente-fin-divider mb-4 flex items-center gap-2 border-b pb-3">
              <Filter className="h-4 w-4 shrink-0 app-accent-text" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wide">{m.contatos.painel_filtrar}</span>
            </div>
            <ContatosFiltrosCampos
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
                {m.contatos.painel_filtrar}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="gerente-fin-divider border-t p-4">
              <ContatosFiltrosCampos
                m={m}
                draft={draftFiltro}
                setDraft={setDraftFiltro}
                finSelect={finSelect}
                onAplicar={aplicarFiltros}
                onLimpar={limparFiltros}
              />
            </div>
          </details>

          <GerenteFilterBar title={m.contatos.titulo} />

          <p className="gerente-fin-muted text-xs">{m.contatos.subtitulo}</p>

          {showFormNovo ? (
            <section className="dragon-glass-card overflow-hidden rounded-xl">
              <div className="gerente-fin-divider border-b px-3 py-2.5">
                <h2 className="gerente-section-accent text-sm font-semibold">{m.contatos.cadastro_rapido}</h2>
              </div>
              <form
                className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-6"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const tipo = readFormDataString(fd, 'tipo_contato') as 'CLIENTE' | 'FORNECEDOR'
                  const nome = readFormDataString(fd, 'nome').trim()
                  if (!nome) {
                    emitGerenteToast({ kind: 'error', message: m.contatos.nome_obrigatorio })
                    return
                  }
                  if (tipo === 'CLIENTE') {
                    const ok = await criarCli({
                      nome,
                      documento: readFormDataString(fd, 'documento'),
                      telefone: readFormDataString(fd, 'telefone'),
                    })
                    if (ok) {
                      e.currentTarget.reset()
                      setTipoNovo('CLIENTE')
                    }
                    return
                  }
                  const ok = await criarForn({
                    nome,
                    cnpj: readFormDataString(fd, 'cnpj'),
                  })
                  if (ok) {
                    e.currentTarget.reset()
                    setTipoNovo('CLIENTE')
                  }
                }}
              >
                <label className="md:col-span-2">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide app-muted">{m.contatos.label_tipo_cadastro}</span>
                  <select
                    name="tipo_contato"
                    value={tipoNovo}
                    onChange={(ev) => setTipoNovo(ev.target.value as 'CLIENTE' | 'FORNECEDOR')}
                    className={`${finSelect} w-full`}
                  >
                    <option value="CLIENTE">{m.contatos.tipo_cliente}</option>
                    <option value="FORNECEDOR">{m.contatos.tipo_fornecedor}</option>
                  </select>
                </label>
                <input name="nome" placeholder={m.contatos.label_nome} className={`${finIn} md:col-span-2`} required />
                {tipoNovo === 'CLIENTE' ? (
                  <input name="documento" placeholder={m.contatos.label_documento} className={finIn} />
                ) : (
                  <input name="cnpj" placeholder={m.contatos.label_cnpj} className={finIn} required />
                )}
                {tipoNovo === 'CLIENTE' ? (
                  <input name="telefone" placeholder={m.contatos.label_telefone} className={`${finIn} md:col-span-2`} />
                ) : null}
                <button
                  type="submit"
                  disabled={criarCliLoading || criarFornLoading}
                  className="h-9 rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter] disabled:opacity-60 app-btn-accent md:col-span-2"
                >
                  {criarCliLoading || criarFornLoading ? '…' : m.comum.salvar}
                </button>
              </form>
            </section>
          ) : null}

          <section className="dragon-glass-card overflow-hidden rounded-xl">
            <div className="gerente-fin-divider flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <h2 className="gerente-section-accent text-sm font-semibold">{m.contatos.lista_titulo}</h2>
              <p className="gerente-fin-muted text-xs font-medium">
                {interpolate(m.contatos.contador_encontrados, { count: filtrados.length })}
              </p>
            </div>

            <div className="gerente-fin-divider flex flex-wrap items-center gap-2 border-b p-3">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={m.contatos.buscar_placeholder}
                className={`${finIn} h-9 min-h-[2.25rem] min-w-[min(100%,12rem)] flex-1`}
                aria-label={m.contatos.buscar_placeholder}
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
                {m.contatos.incluir_contato}
              </button>
            </div>

            <div className="p-3">
              <GerenteTable
                tone="dragon"
                columns={[
                  { key: 'nome', header: m.contatos.col_nome_empresa },
                  { key: 'tipo', header: m.contatos.col_tipo },
                  { key: 'doc', header: m.contatos.col_documento },
                  { key: 'ac', header: m.contatos.col_acoes, width: '5rem' },
                ]}
              >
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="gerente-fin-empty px-3 py-4 text-xs">
                      {m.contatos.nenhum_registro}
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="gerente-fin-empty px-3 py-4 text-xs">
                      {m.contatos.nenhum_resultado_filtro}
                    </td>
                  </tr>
                ) : (
                  filtrados.map((r) => (
                    <tr key={`${r.tipo}-${r.id}`} className="group gerente-fin-row-hover transition-colors">
                      <td className="gerente-fin-cell px-3 py-2 font-medium">{r.nome}</td>
                      <td className="gerente-fin-cell px-3 py-2 text-xs">
                        {r.tipo === 'CLIENTE' ? m.contatos.tipo_cliente : m.contatos.tipo_fornecedor}
                      </td>
                      <td className="gerente-fin-cell px-3 py-2 font-mono text-[11px]">
                        {r.documento ? (
                          <span className="text-[color:var(--color-brand-primary)]">{r.documento}</span>
                        ) : (
                          <span className="app-muted">{m.contatos.sem_documento}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          className="inline-flex rounded-md p-1.5 text-[color:var(--color-brand-primary)] opacity-90 transition hover:opacity-100"
                          aria-label={m.contatos.btn_editar_aria}
                          onClick={() => setEditRow(r)}
                        >
                          <Pencil className="h-4 w-4" />
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
    </div>
  )
}
