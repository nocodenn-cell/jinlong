/**
 * Escolha PURA do catálogo de parâmetros para a empresa (sem I/O; usado no cliente e no servidor).
 * Sem configuração de importação ⇒ catálogo de DEMONSTRAÇÃO (comportamento do #601, zero regressão).
 * Com configuração ⇒ catálogo nacional (27 UFs + federais) + alíquotas informadas pelo cliente.
 */
import {
  CATALOGO_NACIONAL_VERSAO, CATALOGO_TRIBUTARIO_DEMO, CATALOGO_TRIBUTARIO_VERSAO, montarCatalogoNacional,
  type AliquotaUf, type ModalTransporte, type OverrideCliente, type ParametroTributario,
} from '@shared-core/src/import'

export type ConfigImportacao = {
  uf_importador: string
  porto_padrao: string | null
  modal_padrao: ModalTransporte | null
  icms_efetivo_pct: string | null
  regime_incentivo_nome: string | null
  aviso_aceito_em: string | null
}

export type DadosCatalogoEmpresa = {
  config: ConfigImportacao | null
  overrides: (OverrideCliente & { nota: string | null })[]
  /** Linhas do banco (vazio ⇒ constante embarcada). */
  tabela: AliquotaUf[]
}

export function parametrosDaEmpresa(d: DadosCatalogoEmpresa | null, uf?: string | null): { parametros: ParametroTributario[]; versao: string; nacional: boolean } {
  if (!d?.config) return { parametros: [...CATALOGO_TRIBUTARIO_DEMO], versao: CATALOGO_TRIBUTARIO_VERSAO, nacional: false }
  const ufAlvo = (uf ?? d.config.uf_importador).toUpperCase()
  // % efetivo vale só para a UF do importador (incentivo é da empresa, não da UF consultada).
  const efetivo = ufAlvo === d.config.uf_importador ? d.config.icms_efetivo_pct : null
  return {
    parametros: montarCatalogoNacional({ uf: ufAlvo, icms_efetivo_pct: efetivo, overrides: d.overrides }, d.tabela),
    versao: CATALOGO_NACIONAL_VERSAO,
    nacional: true,
  }
}
