import { painelMetasComissao } from '@/app/gerente/comissoes/moduloActions'
import { paginaComissao } from '../_modulo/ShellComissao'
import { competenciaAtual } from '../_modulo/textos'
import { MetasComissaoClient } from './MetasComissaoClient'

export default async function ComissoesMetasPage() {
  return paginaComissao('metas', async (t) => {
    const res = await painelMetasComissao()
    if (!res.success) return <p className="admin-v2-panel p-4 text-sm">{res.error}</p>
    return <MetasComissaoClient {...res.data} competencia={competenciaAtual()} t={t} />
  })
}
