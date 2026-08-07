'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, FileUp, Upload } from 'lucide-react'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarProdutosParaExportacao } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { PageActions } from '@/components/ui/admin-v2'
import { ExportAction } from '@/components/ui/ExportAction'
import { ProdutosImportarModal } from '@/components/gerente/produtos/ProdutosImportarModal'
import { CatalogoNovoButton } from './CatalogoNovoButton'
import { toCatalogoExportInput, type CatalogoExportFiltros } from './catalogoFiltrosExport'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { emitToast } from '@/lib/gerente/toast'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = Readonly<{
  m: Mensagens
  ui: Mensagens['admin_ui']
  opcoes: OpcoesFiltrosProdutos
  filtrosExport: CatalogoExportFiltros
  idioma: Idioma
}>

export function CatalogoHeaderActions({ m, ui, opcoes, filtrosExport, idioma }: Props) {
  const router = useRouter()
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!importMenuOpen) return
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setImportMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImportMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [importMenuOpen])

  const exportarCsv = useCallback(async () => {
    setExporting(true)
    try {
      const r = await buscarProdutosParaExportacao(toCatalogoExportInput(filtrosExport), 500)
      if (!r.success) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      downloadCsvBrowser(
        'catalogo-produtos.csv',
        [
          { key: 'id', header: 'id' },
          { key: 'nome', header: m.produtos.nome },
          { key: 'codigo_barras', header: m.produtos.codigo_barras },
          { key: 'preco_varejo', header: m.produtos.preco_varejo },
          { key: 'origem', header: m.produtos.origem_label },
          { key: 'ativo', header: m.produtos.status },
        ],
        r.data.map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo_barras: p.codigo_barras ?? '',
          preco_varejo: Number(p.preco_varejo),
          origem: p.origem,
          ativo: p.ativo ? '1' : '0',
        })),
      )
      emitToast({ kind: 'success', message: m.comum.sucesso })
    } finally {
      setExporting(false)
    }
  }, [filtrosExport, m])

  return (
    <>
      <PageActions>
        <div className="relative" ref={menuRef}>
          <Button
            type="button"
            variant="secondary"
            className="gap-1.5"
            aria-haspopup="menu"
            aria-expanded={importMenuOpen}
            aria-controls={menuId}
            onClick={() => setImportMenuOpen((v) => !v)}
          >
            <Upload size={14} aria-hidden />
            {ui.catalogo_importar_menu}
            <ChevronDown size={14} aria-hidden />
          </Button>
          {importMenuOpen ? (
            <div
              id={menuId}
              role="menu"
              className="absolute right-0 z-[var(--z-dropdown)] mt-1 min-w-[12rem] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-md)]"
            >
              <Link
                role="menuitem"
                href={ROUTES.admin.importNfe}
                className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-body text-fg hover:bg-[var(--color-surface-soft)]"
                onClick={() => setImportMenuOpen(false)}
              >
                <Upload size={14} aria-hidden />
                {ui.catalogo_importar_nfe}
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-body text-fg hover:bg-[var(--color-surface-soft)]"
                onClick={() => {
                  setImportMenuOpen(false)
                  setImportOpen(true)
                }}
              >
                <FileUp size={14} aria-hidden />
                {ui.catalogo_importar_csv}
              </button>
            </div>
          ) : null}
        </div>
        <ExportAction
          format="csv"
          label={exporting ? m.comum.carregando : m.gerente.exportar_csv}
          loading={exporting}
          disabled={exporting}
          onExport={() => void exportarCsv()}
        />
        <CatalogoNovoButton
          label={m.produtos.cadastro_rapido}
          m={m}
          opcoes={opcoes}
          idioma={idioma}
        />
      </PageActions>

      <ProdutosImportarModal
        open={importOpen}
        onOpenChange={setImportOpen}
        m={m}
        onImportComplete={() => router.refresh()}
      />
    </>
  )
}
