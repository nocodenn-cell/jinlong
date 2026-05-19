'use client'

import {
  FileDown,
  FolderOpen,
  ImageIcon,
  Plus,
  Printer,
  ToggleLeft,
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
  ativoLoteDisabled: boolean
  ativoLoteLoading?: boolean
  categoriaLoteDisabled: boolean
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
  ativoLoteDisabled,
  ativoLoteLoading = false,
  categoriaLoteDisabled,
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
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5 backdrop-blur-sm"
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
            ? 'app-border app-surface-soft text-muted-foreground opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-foreground hover:bg-accent/15',
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
            ? 'app-border app-surface-soft text-muted-foreground opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-foreground hover:bg-accent/15',
        )}
        title={p.toolbar_imprimir_title}
        aria-label={p.toolbar_imprimir_aria}
      >
        <Printer className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_imprimir}</span>
      </button>

      <button
        type="button"
        disabled={exclusaoDisabled || exclusaoLoading}
        onClick={onExcluir}
        className={cn(
          btnBase,
          exclusaoDisabled || exclusaoLoading
            ? 'app-border app-surface-soft text-muted-foreground opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-foreground hover:bg-destructive/15 hover:border-destructive/40',
        )}
        title={p.toolbar_excluir_title}
        aria-label={p.toolbar_excluir_aria}
      >
        <Trash2 className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span className="hidden sm:inline">{exclusaoLoading ? '…' : p.toolbar_excluir}</span>
      </button>

      <button
        type="button"
        disabled={ativoLoteDisabled || ativoLoteLoading}
        onClick={onAtivarLote}
        className={cn(
          btnBase,
          ativoLoteDisabled || ativoLoteLoading
            ? 'app-border app-surface-soft text-muted-foreground opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-foreground hover:bg-success/15 hover:border-success/40',
        )}
        title={p.toolbar_ativar_title}
        aria-label={p.toolbar_ativar_aria}
      >
        <ToggleLeft className="h-4 w-4 shrink-0 text-success" aria-hidden />
        <span className="hidden sm:inline">{ativoLoteLoading ? '…' : p.toolbar_ativar}</span>
      </button>

      <button
        type="button"
        disabled={ativoLoteDisabled || ativoLoteLoading}
        onClick={onInativarLote}
        className={cn(
          btnBase,
          ativoLoteDisabled || ativoLoteLoading
            ? 'app-border app-surface-soft text-muted-foreground opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-foreground hover:bg-warning/15 hover:border-warning/40',
        )}
        title={p.toolbar_inativar_title}
        aria-label={p.toolbar_inativar_aria}
      >
        <ToggleLeft className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_inativar}</span>
      </button>

      <button
        type="button"
        disabled={categoriaLoteDisabled}
        onClick={onAlterarCategoriaLote}
        className={cn(
          btnBase,
          categoriaLoteDisabled
            ? 'app-border app-surface-soft text-muted-foreground opacity-60 cursor-not-allowed'
            : 'app-border app-surface-soft text-foreground hover:bg-accent/15',
        )}
        title={p.toolbar_categoria_title}
        aria-label={p.toolbar_categoria_aria}
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_categoria}</span>
      </button>

      <button
        type="button"
        onClick={onImport}
        className={cn(btnBase, 'app-border app-surface-soft text-foreground hover:bg-accent/15')}
        aria-label={p.toolbar_importar_aria}
      >
        <UploadCloud className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />
        <span className="hidden sm:inline">{p.toolbar_importar}</span>
      </button>

      <button
        type="button"
        disabled={exportDisabled || exportLoading}
        onClick={onExport}
        className={cn(btnBase, 'gerente-btn-csv border-border')}
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
