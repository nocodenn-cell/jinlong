'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, FileUp, Upload } from 'lucide-react'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarProdutosParaExportacao } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { PageActions } from '@/components/ui/admin-v2'
import { ProdutosImportarModal } from '@/components/gerente/produtos/ProdutosImportarModal'
import { CatalogoNovoButton } from './CatalogoNovoButton'
import { toCatalogoExportInput, type CatalogoExportFiltros } from './catalogoFiltrosExport'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { emitGerenteToast } from '@/lib/gerente/toast'
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
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportarCsv = useCallback(async () => {
    setExporting(true)
    try {
      const r = await buscarProdutosParaExportacao(toCatalogoExportInput(filtrosExport), 500)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
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
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
    } finally {
      setExporting(false)
    }
  }, [filtrosExport, m])

  return (
    <>
      <div className="mb-2 w-full basis-full rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-caption text-fg-muted">
        {ui.catalogo_hint_volume}
      </div>
      <PageActions>
        <Button asChild variant="primary" className="gap-1.5">
          <Link href={ROUTES.admin.importNfe}>
            <Upload size={14} aria-hidden />
            {ui.catalogo_importar_nfe}
          </Link>
        </Button>
        <Button type="button" variant="primary" className="gap-1.5" onClick={() => setImportOpen(true)}>
          <FileUp size={14} aria-hidden />
          {m.produtos.import_modal_titulo}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="gap-1.5"
          disabled={exporting}
          onClick={() => void exportarCsv()}
        >
          <Download size={14} aria-hidden />
          {exporting ? m.comum.carregando : m.gerente.exportar_csv}
        </Button>
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
