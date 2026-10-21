import { relatorioComissaoMes } from '@/app/gerente/comissoes/moduloActions'
import { paginaComissao } from '../_modulo/ShellComissao'
import { competenciaAtual } from '../_modulo/textos'
import { RelatorioClient } from './RelatorioClient'

export default async function ComissoesRelatorioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams
  const comp = /^\d{4}-\d{2}$/.test(mes ?? '') ? (mes as string) : competenciaAtual()
  return paginaComissao('relatorio', async (t) => {
    const res = await relatorioComissaoMes(comp)
    if (!res.success) return <p className="admin-v2-panel p-4 text-sm">{res.error}</p>
    return <RelatorioClient competencia={comp} status={res.data.status} linhas={res.data.linhas} t={t} />
  })
}
