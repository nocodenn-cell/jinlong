/**
 * Decisão do dono (28/10/2026): o hub comercial é o ponto OFICIAL de provisionamento de empresas. Enquanto ele não
 * estiver homologado, o provisionamento AUTOMÁTICO (teste grátis/self-service) fica BLOQUEADO — fail closed.
 * Só `PROVISIONAMENTO_AUTOMATICO_HABILITADO=true` (exatamente) libera o caminho do app; o banco tem a mesma porta
 * (saas.parametros.provisionamento_automatico, migration 20261028121000). Contingência manual:
 * docs/PROVISIONAMENTO_CONTINGENCIA.md.
 */
export function provisionamentoAutomaticoHabilitado(env: Record<string, string | undefined> = process.env): boolean {
  return (env.PROVISIONAMENTO_AUTOMATICO_HABILITADO ?? '').trim() === 'true'
}

export const MSG_PROVISIONAMENTO_BLOQUEADO = 'Teste grátis indisponível no momento. / 暂时无法开通试用。'
