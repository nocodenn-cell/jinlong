'use client'

import {
  FileDown,
  FolderInput,
  ImageIcon,
  Plus,
  Printer,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import type { Mensagens } from '@/i18n/getMessages'
import { cn } from '@/lib/utils'

const btnBase =
  'inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4'

export type ProdutosToolbarProps = Readonly<{
  m: Mensagens
  exportDisabled: boolean
  exportLoading: boolean
  printDisabled: boolean
  fotoDisabled: boolean
  exclusaoDisabled: boolean
  exclusaoLoading?: boolean
  selecaoAtiva: boolean
  ativarLoteLoading?: boolean
  inativarLoteLoading?: boolean
  categoriaLoteLoading?: boolean
  onExport: () => void
  onImport: () => void
  onIncluirCadastro: () => void
  onPrint: () => void
  onFotoColuna: () => void
  onExcluir: () => void
  onAtivarLote: () => void
  onInativarLote: () => void
  onAlterarCategoriaLote: () => void
}>

export function ProdutosToolbar({
  m,
  exportDisabled,
  exportLoading,
  printDisabled,
  fotoDisabled,
  exclusaoDisabled,
  exclusaoLoading = false,
  selecaoAtiva,
  ativarLoteLoading = false,
  inativarLoteLoading = false,
  categoriaLoteLoading = false,
  onExport,
  onImport,
  onIncluirCadastro,
  onPrint,
  onFotoColuna,
  onExcluir,
  onAtivarLote,
  onInativarLote,
  onAlterarCategoriaLote,
}: ProdutosToolbarProps) {
  const p = m.produtos

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-jl-border-1 bg-jl-surface-elev/60 px-3 py-2.5"
      role="toolbar"
      aria-label={p.toolbar_aria}
    >
      <button
        type="button"
        disabled={fotoDisabled}
        onClick={onFotoColuna}
        className={cn(
          btnBase,
          fotoDisabled
            ? 'app-border app-surface-soft text-jl-fg-3 opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-jl-fg-1 hover:bg-white/[0.06]',
        )}
        title={p.toolbar_foto_title}
        aria-label={p.toolbar_foto_aria}
      >
        <ImageIcon className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_foto}</span>
      </button>

      <button
        type="button"
        disabled={printDisabled}
        onClick={onPrint}
        className={cn(
          btnBase,
          printDisabled
            ? 'app-border app-surface-soft text-jl-fg-3 opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-jl-fg-1 hover:bg-white/[0.06]',
        )}
        title={p.toolbar_imprimir_title}
        aria-label={p.toolbar_imprimir_aria}
      >
        <Printer className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_imprimir}</span>
      </button>

      {selecaoAtiva && (
        <>
          <button
            type="button"
            disabled={ativarLoteLoading}
            onClick={onAtivarLote}
            className={cn(
              btnBase,
              ativarLoteLoading
                ? 'app-border app-surface-soft text-jl-fg-3 opacity-60 cursor-not-allowed'
                : 'app-border app-surface-soft text-jl-fg-1 hover:bg-green-500/15',
            )}
            title="Ativar selecionados"
            aria-label="Ativar produtos selecionados"
          >
            <ToggleRight className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
            <span className="hidden sm:inline">{ativarLoteLoading ? '…' : 'Ativar'}</span>
          </button>

          <button
            type="button"
            disabled={inativarLoteLoading}
            onClick={onInativarLote}
            className={cn(
              btnBase,
              inativarLoteLoading
                ? 'app-border app-surface-soft text-jl-fg-3 opacity-60 cursor-not-allowed'
                : 'app-border app-surface-soft text-jl-fg-1 hover:bg-amber-500/15',
            )}
            title="Inativar selecionados"
            aria-label="Inativar produtos selecionados"
          >
            <ToggleLeft className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <span className="hidden sm:inline">{inativarLoteLoading ? '…' : 'Inativar'}</span>
          </button>

          <button
            type="button"
            disabled={categoriaLoteLoading}
            onClick={onAlterarCategoriaLote}
            className={cn(
              btnBase,
              categoriaLoteLoading
                ? 'app-border app-surface-soft text-jl-fg-3 opacity-60 cursor-not-allowed'
                : 'app-border app-surface-soft text-jl-fg-1 hover:bg-blue-500/15',
            )}
            title="Alterar categoria dos selecionados"
            aria-label="Alterar categoria dos produtos selecionados"
          >
            <FolderInput className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
            <span className="hidden sm:inline">{categoriaLoteLoading ? '…' : 'Categoria'}</span>
          </button>
        </>
      )}

      <button
        type="button"
        disabled={exclusaoDisabled || exclusaoLoading}
        onClick={onExcluir}
        className={cn(
          btnBase,
          exclusaoDisabled || exclusaoLoading
            ? 'app-border app-surface-soft text-jl-fg-3 opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-jl-fg-1 hover:bg-destructive/15 hover:border-destructive/40',
        )}
        title={p.toolbar_excluir_title}
        aria-label={p.toolbar_excluir_aria}
      >
        <Trash2 className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span className="hidden sm:inline">{exclusaoLoading ? '…' : p.toolbar_excluir}</span>
      </button>

      <button
        type="button"
        onClick={onImport}
        className={cn(btnBase, 'app-border app-surface-soft text-jl-fg-1 hover:bg-white/[0.06]')}
        aria-label={p.toolbar_importar_aria}
      >
        <UploadCloud className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_importar}</span>
      </button>

      <button
        type="button"
        disabled={exportDisabled || exportLoading}
        onClick={onExport}
        className={cn(btnBase, 'gerente-btn-csv border-jl-border-1')}
        aria-label={p.toolbar_exportar_aria}
      >
        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{exportLoading ? '…' : p.toolbar_exportar}</span>
      </button>

      <button
        type="button"
        onClick={onIncluirCadastro}
        className={cn(btnBase, 'app-btn-accent border-transparent')}
        aria-label={p.toolbar_incluir_aria}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_incluir}</span>
      </button>
    </div>
  )
}
