/**
 * FastProduct Admin — Relatório de Estoque completo
 *
 * Reusa RelatorioEstoqueClient (já existia, nunca tinha rota própria — o link
 * "Ver relatório completo" caía num redirect legado que levava de volta para
 * /admin/relatorios, uma tela mais simples). Queries reaproveitadas de
 * app/gerente/estoque/actions.ts, nenhuma query nova.
 */

import { ROUTES } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { obterListaEstoqueGerente, obterKpisEstoque } from '@/app/gerente/estoque/actions'
import { listarOpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { RelatorioEstoqueClient } from '@/app/gerente/relatorios/estoque/RelatorioEstoqueClient'

const LIMITE_PAG = 20

export default async function AdminRelatorioEstoquePage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.relatoriosEstoque,
    resource: `route:${ROUTES.admin.relatoriosEstoque}`,
  })

  const [kpisIniciais, inicial, opcoes] = await Promise.all([
    obterKpisEstoque(),
    obterListaEstoqueGerente({
      visao: 'geral',
      busca: '',
      categoria_id: null,
      origem: '',
      ordem: 'nome',
      dir_asc: true,
      limite: LIMITE_PAG,
      offset: 0,
    }),
    listarOpcoesFiltrosProdutos(),
  ])

  const categorias = opcoes.success ? opcoes.data.categorias : []

  return (
    <RelatorioEstoqueClient
      idioma={session.idioma}
      locale={session.idioma === 'zh' ? 'zh-CN' : 'pt-BR'}
      kpisIniciais={kpisIniciais}
      inicial={inicial}
      categorias={categorias}
    />
  )
}
