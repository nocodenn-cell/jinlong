import { listarRegrasComissao } from '@/app/gerente/comissoes/moduloActions'
import { paginaComissao } from '../_modulo/ShellComissao'
import { RegrasComissaoClient } from './RegrasComissaoClient'

export default async function ComissoesRegrasPage() {
  return paginaComissao('regras', async (t) => {
    const res = await listarRegrasComissao()
    if (!res.success) return <p className="admin-v2-panel p-4 text-sm">{res.error}</p>
    return <RegrasComissaoClient regras={res.data.regras} opcoes={res.data.opcoes} t={t} />
  })
}
