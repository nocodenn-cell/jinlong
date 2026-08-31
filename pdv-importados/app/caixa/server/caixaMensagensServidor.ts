import { caixaFmt } from '@/app/caixa/caixaI18n'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'

/** Chaves planas de `caixa` usadas em Server Actions (PT/ZH via pt.json/zh.json). */
export type CaixaServidorMsgKey =
  | 'err_srv_sessao_expirada'
  | 'err_srv_sessao_curta'
  | 'err_srv_carrinho_vazio'
  | 'err_srv_colocar_espera'
  | 'err_srv_listar_espera'
  | 'err_srv_retomar_espera'
  | 'err_srv_espera_em_uso'
  | 'err_srv_espera_nao_encontrada'
  | 'err_srv_converter_espera'
  | 'err_srv_devolver_espera'
  | 'err_srv_descartar_espera'
  | 'err_srv_carregar_historico'
  | 'err_srv_carregar_detalhe'
  | 'err_srv_venda_invalida'
  | 'err_srv_venda_nao_encontrada'
  | 'err_srv_carregar_regras'
  | 'err_srv_buscar_produto'
  | 'err_srv_codigo_ambiguo'
  | 'err_srv_qtd_invalida'
  | 'err_srv_produto_inativo'
  | 'err_srv_preco_resposta_invalida'
  | 'err_srv_motivo_longo'
  | 'err_srv_caixa_sem_aberto'
  | 'err_srv_senha_invalida'
  | 'err_srv_caixa_invalido'
  | 'err_srv_movimentacao_invalida'
  | 'err_srv_motivo_obrigatorio'
  | 'err_srv_valor_invalido'
  | 'err_srv_busca_cliente_min'
  | 'err_srv_itens_carrinho_invalidos'
  | 'err_srv_concluir'
  | 'err_srv_cancelamento_sem_id'
  | 'err_srv_aprovacao_sem_id'
  | 'err_srv_estorno_sem_id'
  | 'err_srv_cancel_mov_sem_id'
  | 'err_srv_token_gerente'
  | 'err_srv_gerente_aprovador'
  | 'err_srv_carregar_loja'
  | 'err_srv_codigo_vazio'
  | 'msg_codigo_lido'
  | 'err_srv_cancelar_perfil'
  | 'err_srv_preco_qtd_invalida'
  | 'err_srv_busca_ambigua'
  | 'err_srv_status_caixa_indisponivel'
  | 'err_srv_cancelar_venda'
  | 'err_srv_calcular_preco'
  | 'err_srv_registrar_movimentacao'
  | 'err_srv_autorizar_movimentacao'
  | 'err_srv_carregar_movimentacoes'
  | 'err_srv_cancelar_movimentacao'
  | 'err_srv_estornar_movimentacao'
  | 'err_srv_resumo_turno'
  | 'err_srv_carregar_config'
  | 'err_srv_consultar_produto'
  | 'err_srv_validar_gerente'
  | 'err_srv_limite_sangria'
  | 'err_srv_validar_preco'
  | 'err_srv_verificar_preco_versao'
  | 'err_srv_caixa_ja_aberto'
  | 'err_srv_idempotency_obrigatorio'
  | 'err_srv_registrar_desconto'
  | 'err_srv_validar_gerente_http'
  | 'err_srv_config_ambiente_invalida'
  | 'err_srv_preco_acima_referencia'
  | 'err_srv_tipo_preco_mudou'
  | 'err_srv_preco_diverge_cadastro'
  | 'err_srv_preco_ref_varejo_inconsistente'
  | 'err_srv_preco_ref_atacado_inconsistente'
  | 'err_srv_pricing_version_inconsistente'
  | 'err_srv_carrinho_precos_mudaram'
  | 'err_srv_pagamento_parcial_cliente'
  | 'err_srv_divergencia_fechamento_motivo'
  | 'msg_senha_obrigatoria'
  | 'msg_valor_inicial_invalido'
  | 'msg_valor_contado_invalido'
  | 'msg_caixa_ja_fechado'

function asIdioma(idioma?: string | null): Idioma {
  return idioma === 'zh' ? 'zh' : 'pt'
}

/** SSOT servidor: `getMessages(idioma).caixa[key]`. */
export function caixaMsgServidor(
  idiomaInput: string | undefined | null,
  key: CaixaServidorMsgKey,
  vars?: Record<string, string | number>,
): string {
  const template = getMessages(asIdioma(idiomaInput)).caixa[key]
  return vars ? caixaFmt(template, vars) : template
}

/** Atalho async: resolve idioma do operador e busca mensagem em pt.json/zh.json. */
export async function caixaMsgOperador(
  key: CaixaServidorMsgKey,
  vars?: Record<string, string | number>,
): Promise<string> {
  return caixaMsgServidor(await idiomaOperadorParaErro(), key, vars)
}
