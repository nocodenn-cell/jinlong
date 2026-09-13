import 'server-only'
import type { CaixaBootstrapInicial } from '@/app/caixa/caixaBootstrapTypes'
import { carregarRegrasPrecoCaixaImpl } from '@/app/caixa/server/caixaCatalogo.impl'
import { obterConfiguracoesParaCaixaWebImpl } from '@/app/caixa/server/caixaConfiguracoes.impl'
import { obterLimiteSangriaSemGerenteImpl } from '@/app/caixa/server/caixaGerenteDesconto.impl'
import { obterMovimentacoesCaixaImpl } from '@/app/caixa/server/caixaMovimentacoes.impl'
import { obterStatusCaixaOperadorImpl } from '@/app/caixa/server/caixaSessaoOperador.impl'
import { listarVendasEmEsperaImpl } from '@/app/caixa/server/caixaVendaEspera.impl'

/**
 * Dados de abertura do PDV, carregados no Server Component em UM request.
 *
 * Antes, `CaixaPageClient` disparava 5 Server Actions após a hidratação (regras de
 * preço, limite de sangria, configurações, status do turno e vendas em espera). O
 * runtime do Next executa actions do cliente uma de cada vez, e cada POST refazia
 * middleware + `getUser` + perfil (medido: ~2,7 s até o caixa ficar operacional).
 * Aqui as MESMAS impls rodam em paralelo, com a sessão já resolvida no cache do
 * request. A única etapa encadeada é legítima: movimentações dependem do caixa aberto.
 */
export async function carregarBootstrapCaixaImpl(): Promise<CaixaBootstrapInicial> {
  const statusEMovimentacoes = obterStatusCaixaOperadorImpl().then(async (status) => ({
    status,
    movimentacoes:
      status.ok && status.status === 'ABERTO'
        ? await obterMovimentacoesCaixaImpl(status.caixaId)
        : null,
  }))

  const [regras, limiteSangria, configuracoes, { status, movimentacoes }, vendasEmEspera] =
    await Promise.all([
      carregarRegrasPrecoCaixaImpl(),
      obterLimiteSangriaSemGerenteImpl(),
      obterConfiguracoesParaCaixaWebImpl(),
      statusEMovimentacoes,
      listarVendasEmEsperaImpl(),
    ])

  return { regras, limiteSangria, configuracoes, status, movimentacoes, vendasEmEspera }
}
