'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, FileUp, Upload } from 'lucide-react'
import { ROUTES } from '@shared-core/navigation/routes'
import { buscarProdutosParaExportacao } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { PageActions } from '@/components/ui/admin-v2'
import { ProdutosImportarModal } from '@/components/gerente/produtos/ProdutosImportarModal'
import { CatalogoNovoButton } from './CatalogoNovoButton'
import { toCatalogoExportInput, type CatalogoExportFiltros } from './catalogoFiltrosExport'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Mensagens } from '@/i18n/getMessages'

type Props = Readonly<{
  m: Mensagens
  ui: Mensagens['admin_ui']
  filtrosExport: CatalogoExportFiltros
}>

/**
 * CTAs do Catálogo — hierarquia: Importar CSV (volume) = primary;
 * NF-e / Exportar / Cadastro rápido = secondary.
 * Cadastro rápido abre o host único via ?modal=novo.
 */
export function CatalogoHeaderActions({ m, ui, filtrosExport }: Props) {
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
      <PageActions>
        <Button type="button" variant="primary" className="gap-1.5" onClick={() => setImportOpen(true)}>
          <FileUp size={14} aria-hidden />
          {m.produtos.import_modal_titulo}
        </Button>
        <Button asChild variant="secondary" className="gap-1.5">
          <Link href={ROUTES.admin.importNfe}>
            <Upload size={14} aria-hidden />
            {ui.catalogo_importar_nfe}
          </Link>
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
          titleHint={ui.catalogo_atalho_novo}
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
