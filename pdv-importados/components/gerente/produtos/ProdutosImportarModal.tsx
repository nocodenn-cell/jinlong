'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ClipboardEvent,
} from 'react'
import { AlertCircle, CheckCircle2, FileUp, Plus, Trash2, UploadCloud } from 'lucide-react'
import { importarProdutosLote } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { downloadProdutoImportTemplateCsv } from '@/lib/gerente/produtosCsvContract'
import { interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { importCsvRowFailToString } from '@/lib/gerente/produtosImportRowMessages'
import {
  BULK_GRID_COLUMNS,
  bulkRowsToRawObjects,
  createEmptyCells,
  isRowBlank,
  parsePastedTable,
  validateBulkRow,
  type BulkGridColumn,
  type BulkGridColumnKey,
  type BulkRowCells,
} from '@/lib/gerente/bulkImportGrid'

export type ProdutosImportarModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  onImportComplete?: () => void
}>

type GridRow = { rowId: string; cells: BulkRowCells }

let rowSeq = 0
function nextRowId(): string {
  rowSeq += 1
  return `r${rowSeq}`
}

function makeRow(cells?: BulkRowCells): GridRow {
  return { rowId: nextRowId(), cells: cells ?? createEmptyCells() }
}

export function ProdutosImportarModal({
  open,
  onOpenChange,
  m,
  onImportComplete,
}: ProdutosImportarModalProps) {
  const p = m.produtos
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<GridRow[]>(() => [makeRow()])
  const [atualizarPorId, setAtualizarPorId] = useState(false)
  const [somenteErros, setSomenteErros] = useState(false)
  const [serverFalhas, setServerFalhas] = useState<Record<string, string>>({})
  const [progresso, setProgresso] = useState<{ done: number; total: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  const resetar = useCallback(() => {
    setRows([makeRow()])
    setAtualizarPorId(false)
    setSomenteErros(false)
    setServerFalhas({})
    setProgresso(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (open) resetar()
  }, [open, resetar])

  const fechar = useCallback(() => {
    if (isPending) return
    onOpenChange(false)
  }, [isPending, onOpenChange])

  // Colunas visíveis (id só aparece com atualização por id ativa).
  const colunas = useMemo<BulkGridColumn[]>(
    () => BULK_GRID_COLUMNS.filter((c) => !c.onlyWhenAtualizarPorId || atualizarPorId),
    [atualizarPorId],
  )

  // Validação em tempo real por linha.
  const validacoes = useMemo(
    () => rows.map((r) => validateBulkRow(r.cells, { permiteAtualizacaoPorId: atualizarPorId })),
    [rows, atualizarPorId],
  )

  const resumo = useMemo(() => {
    let total = 0
    let validas = 0
    let erros = 0
    for (const v of validacoes) {
      if (v.status === 'blank') continue
      total += 1
      if (v.status === 'ok') validas += 1
      else erros += 1
    }
    return { total, validas, erros }
  }, [validacoes])

  const setCell = useCallback(
    (rowId: string, key: BulkGridColumnKey, value: string) => {
      setRows((prev) =>
        prev.map((r) => (r.rowId === rowId ? { ...r, cells: { ...r.cells, [key]: value } } : r)),
      )
      setServerFalhas((prev) => {
        if (!prev[rowId]) return prev
        const next = { ...prev }
        delete next[rowId]
        return next
      })
    },
    [],
  )

  const adicionarLinha = useCallback(() => {
    setRows((prev) => [...prev, makeRow()])
  }, [])

  const removerLinha = useCallback((rowId: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.rowId !== rowId)
      return next.length > 0 ? next : [makeRow()]
    })
    setServerFalhas((prev) => {
      if (!prev[rowId]) return prev
      const next = { ...prev }
      delete next[rowId]
      return next
    })
  }, [])

  const [confirmLimparOpen, setConfirmLimparOpen] = useState(false)

  const limparTudo = useCallback(() => {
    if (resumo.total > 0) {
      setConfirmLimparOpen(true)
      return
    }
    setRows([makeRow()])
    setServerFalhas({})
  }, [resumo.total])

  const confirmarLimparTudo = useCallback(() => {
    setConfirmLimparOpen(false)
    setRows([makeRow()])
    setServerFalhas({})
  }, [])

  // Colar do Excel/Sheets (TSV) ou conteúdo CSV → substitui linhas vazias e anexa.
  const onPaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text || !(text.includes('\t') || text.includes('\n'))) return
    const parsed = parsePastedTable(text)
    if (parsed.length === 0) return
    e.preventDefault()
    setServerFalhas({})
    setRows((prev) => {
      const mantidas = prev.filter((r) => !isRowBlank(r.cells))
      const novas = parsed.map((cells) => makeRow(cells))
      const combinado = [...mantidas, ...novas]
      return combinado.length > 0 ? combinado : [makeRow()]
    })
  }, [])

  const onCsvSelecionado = useCallback(async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    const parsed = parsePastedTable(text)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (parsed.length === 0) {
      emitGerenteToast({ kind: 'error', message: p.import_fatal_no_data_rows })
      return
    }
    setServerFalhas({})
    setRows((prev) => {
      const mantidas = prev.filter((r) => !isRowBlank(r.cells))
      const novas = parsed.map((cells) => makeRow(cells))
      return [...mantidas, ...novas]
    })
  }, [p.import_fatal_no_data_rows])

  const podeSalvar = resumo.validas > 0 && resumo.erros === 0 && !isPending

  const salvar = useCallback(() => {
    const naoVazias = rows.filter((r) => !isRowBlank(r.cells))
    const raw = bulkRowsToRawObjects(naoVazias.map((r) => r.cells))
    if (raw.length === 0) {
      emitGerenteToast({ kind: 'error', message: p.import_lote_vazio })
      return
    }
    setProgresso({ done: 0, total: raw.length })
    startTransition(async () => {
      const r = await importarProdutosLote(raw, atualizarPorId)
      if (!r.success) {
        setProgresso(null)
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      // Mapeia falhas do servidor (1-based, na ordem das linhas não-vazias) → rowId.
      if (r.falhas.length > 0) {
        setProgresso(null)
        const mapa: Record<string, string> = {}
        for (const f of r.falhas) {
          const alvo = naoVazias[f.linha - 1]
          if (alvo) mapa[alvo.rowId] = f.motivo
        }
        setServerFalhas(mapa)
        setSomenteErros(true)
        emitGerenteToast({
          kind: 'error',
          message: interpolateTemplate(p.import_resumo_falhas, { count: String(r.falhas.length) }),
        })
        return
      }
      setProgresso({ done: raw.length, total: raw.length })
      const partes: string[] = []
      if (r.criados > 0) {
        partes.push(interpolateTemplate(p.import_resumo_criados, { count: String(r.criados) }))
      }
      if (r.atualizados > 0) {
        partes.push(interpolateTemplate(p.import_resumo_atualizados, { count: String(r.atualizados) }))
      }
      emitGerenteToast({
        kind: 'success',
        message: partes.length > 0 ? partes.join(p.import_resumo_separador_ok) : m.comum.sucesso,
      })
      onImportComplete?.()
      onOpenChange(false)
    })
  }, [rows, atualizarPorId, p, m.comum.sucesso, onImportComplete, onOpenChange])

  if (!open) return null

  const commitLabel = isPending
    ? p.import_modal_importando
    : resumo.erros > 0
      ? interpolateTemplate(p.bulk_commit_bloqueado, { count: String(resumo.erros) })
      : resumo.validas > 0
        ? interpolateTemplate(p.bulk_commit, { count: String(resumo.validas) })
        : p.bulk_commit_zero

  return (
    <Fragment>
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="xl"
      icon={UploadCloud}
      title={p.bulk_titulo}
      subtitle={p.bulk_subtitulo}
      dismissable={!isPending}
      closeLabel={m.comum.cancelar}
      footer={
        <>
          <div className="mr-auto text-xs text-jl-fg-3" aria-live="polite">
            {interpolateTemplate(p.bulk_resumo, {
              total: String(resumo.total),
              validas: String(resumo.validas),
              erros: String(resumo.erros),
            })}
          </div>
          <Button type="button" variant="secondary" onClick={fechar} disabled={isPending}>
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!podeSalvar}
            onClick={() => salvar()}
          >
            {commitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-1">
        {/* Barra de ações */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-jl-border-1 bg-jl-surface-soft px-2.5 py-1.5 text-xs font-medium text-jl-fg-1 hover:bg-white/[0.06] disabled:opacity-50"
            onClick={adicionarLinha}
            disabled={isPending}
          >
            <Plus size={14} aria-hidden /> {p.bulk_adicionar_linha}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-jl-border-1 bg-jl-surface-soft px-2.5 py-1.5 text-xs font-medium text-jl-fg-1 hover:bg-white/[0.06] disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            <FileUp size={14} aria-hidden /> {p.bulk_carregar_csv}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-[color:var(--accent)] underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => downloadProdutoImportTemplateCsv()}
            disabled={isPending}
          >
            {p.import_modal_baixar_modelo}
          </button>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            onClick={limparTudo}
            disabled={isPending || resumo.total === 0}
          >
            <Trash2 size={14} aria-hidden /> {p.bulk_limpar}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onCsvSelecionado(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-jl-fg-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border border-jl-border-1 bg-jl-surface-soft accent-[var(--color-brand)]"
              checked={atualizarPorId}
              disabled={isPending}
              onChange={(e) => setAtualizarPorId(e.target.checked)}
            />
            <span>{p.import_modal_atualizar_por_id}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-jl-fg-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border border-jl-border-1 bg-jl-surface-soft accent-[var(--color-brand)]"
              checked={somenteErros}
              disabled={isPending}
              onChange={(e) => setSomenteErros(e.target.checked)}
            />
            <span>
              {p.bulk_somente_erros}
              {resumo.erros > 0 ? ` (${resumo.erros})` : ''}
            </span>
          </label>
        </div>

        {atualizarPorId ? (
          <p className="text-caption text-fg-subtle">{p.import_modal_vazio_mantem}</p>
        ) : null}

        <p className="text-caption text-fg-subtle">{p.bulk_colar_hint}</p>

        {/* Grade editável */}
        <div
          className="max-h-[52vh] overflow-auto rounded-md border border-jl-border-1"
          onPaste={onPaste}
        >
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-jl-surface-elev">
              <tr>
                <th className="w-8 border-b border-jl-border-1 px-1 py-1.5 text-center font-medium text-jl-fg-3">
                  #
                </th>
                {colunas.map((c) => (
                  <th
                    key={c.key}
                    className={`border-b border-jl-border-1 px-2 py-1.5 text-left font-medium text-jl-fg-3 ${c.widthClass}`}
                  >
                    {(p as unknown as Record<string, string>)[c.labelKey] ?? c.key}
                    {c.required ? <span className="text-destructive"> *</span> : null}
                  </th>
                ))}
                <th className="w-8 border-b border-jl-border-1 px-1 py-1.5" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const v = validacoes[idx]
                const serverMsg = serverFalhas[row.rowId]
                const temErro = v.status === 'error' || Boolean(serverMsg)
                if (somenteErros && !temErro) return null
                const field = v.status === 'error' ? v.field : null
                const msg = serverMsg ?? (v.status === 'error' ? importCsvRowFailToString(v.reason, p) : null)
                return (
                  <RowFragment
                    key={row.rowId}
                    numero={idx + 1}
                    colunas={colunas}
                    labelFor={(key) =>
                      (p as unknown as Record<string, string>)[
                        colunas.find((c) => c.key === key)?.labelKey ?? ''
                      ] ?? key
                    }
                    ariaTemplate={p.bulk_celula_aria}
                    cells={row.cells}
                    erro={temErro}
                    valida={v.status === 'ok' && !temErro}
                    invalidField={field}
                    mensagem={msg}
                    disabled={isPending}
                    onCell={(key, value) => setCell(row.rowId, key, value)}
                    onRemover={() => removerLinha(row.rowId)}
                    removerAria={interpolateTemplate(p.bulk_remover_linha_aria, { linha: String(idx + 1) })}
                  />
                )
              })}
            </tbody>
          </table>
          {resumo.total === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-jl-fg-3">{p.bulk_vazio}</p>
          ) : null}
        </div>

        {/* Feedback de progresso — o commit é atómico (tudo-ou-nada), por isso a
            barra é indeterminada enquanto grava e não simula percentagens falsas. */}
        {progresso ? (
          <div className="space-y-1" aria-live="polite" role="status">
            <div className="text-caption text-fg-muted">
              {interpolateTemplate(p.bulk_salvando, { count: String(progresso.total) })}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-jl-surface-soft">
              <div className="h-full w-full animate-pulse rounded-full bg-[color:var(--accent)]" />
            </div>
          </div>
        ) : null}
      </div>
    </DragonModal>

    <DragonModal
      open={confirmLimparOpen}
      onClose={() => setConfirmLimparOpen(false)}
      variant="danger"
      size="sm"
      title={p.bulk_limpar}
      dismissable
      closeLabel={m.comum.fechar}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => setConfirmLimparOpen(false)}>
            {m.comum.nao}
          </Button>
          <Button type="button" variant="danger" onClick={confirmarLimparTudo}>
            {m.comum.sim}
          </Button>
        </>
      }
    >
      <p className="text-sm text-jl-fg-2">{p.bulk_limpar_confirmar}</p>
    </DragonModal>
    </Fragment>
  )
}

type RowFragmentProps = Readonly<{
  numero: number
  colunas: BulkGridColumn[]
  labelFor: (key: BulkGridColumnKey) => string
  ariaTemplate: string
  cells: BulkRowCells
  erro: boolean
  valida: boolean
  invalidField: BulkGridColumnKey | null
  mensagem: string | null
  disabled: boolean
  onCell: (key: BulkGridColumnKey, value: string) => void
  onRemover: () => void
  removerAria: string
}>

function RowFragment({
  numero,
  colunas,
  labelFor,
  ariaTemplate,
  cells,
  erro,
  valida,
  invalidField,
  mensagem,
  disabled,
  onCell,
  onRemover,
  removerAria,
}: RowFragmentProps) {
  const rowTone = erro ? 'bg-destructive/[0.06]' : valida ? 'bg-emerald-500/[0.04]' : ''
  return (
    <>
      <tr className={rowTone}>
        <td className="border-b border-jl-border-1/60 px-1 py-1 text-center align-middle">
          {erro ? (
            <AlertCircle size={14} className="mx-auto text-destructive" aria-label={mensagem ?? undefined} />
          ) : valida ? (
            <CheckCircle2 size={14} className="mx-auto text-emerald-500" aria-hidden />
          ) : (
            <span className="text-jl-fg-3">{numero}</span>
          )}
        </td>
        {colunas.map((c) => {
          const invalido = invalidField === c.key || (mensagem != null && invalidField == null && c.required)
          const listId = c.suggestions ? `bulk-dl-${c.key}` : undefined
          return (
            <td key={c.key} className="border-b border-jl-border-1/60 p-0 align-middle">
              <input
                type="text"
                inputMode={c.kind === 'number' ? 'decimal' : undefined}
                list={listId}
                value={cells[c.key] ?? ''}
                disabled={disabled}
                aria-label={interpolateTemplate(ariaTemplate, {
                  coluna: labelFor(c.key),
                  linha: String(numero),
                })}
                aria-invalid={invalido || undefined}
                className={`w-full bg-transparent px-2 py-1.5 text-xs text-jl-fg-1 outline-none focus:bg-white/[0.04] focus:ring-1 focus:ring-[color:var(--accent)] ${
                  invalido ? 'ring-1 ring-inset ring-destructive/70' : ''
                }`}
                onChange={(e) => onCell(c.key, e.target.value)}
              />
              {c.suggestions ? (
                <datalist id={listId}>
                  {c.suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              ) : null}
            </td>
          )
        })}
        <td className="border-b border-jl-border-1/60 px-1 py-1 text-center align-middle">
          <button
            type="button"
            className="rounded p-1 text-jl-fg-3 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            onClick={onRemover}
            disabled={disabled}
            aria-label={removerAria}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </td>
      </tr>
      {erro && mensagem ? (
        <tr className={rowTone}>
          <td />
          <td colSpan={colunas.length + 1} className="border-b border-jl-border-1/60 px-2 pb-1.5 text-caption text-destructive">
            {mensagem}
          </td>
        </tr>
      ) : null}
    </>
  )
}
