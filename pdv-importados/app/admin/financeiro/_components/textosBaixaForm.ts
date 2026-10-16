'use client'

import { useContext } from 'react'
import { AdminV2SessionContext } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'

/** Rótulos do formulário de baixa. Reutiliza chaves já existentes para Valor, Pagar e Receber. */
export function useTextosBaixaForm() {
  const idioma = useContext(AdminV2SessionContext)?.idioma
  const mensagens = getMessages(idioma ?? 'pt')
  const ui = mensagens.admin_ui
  return {
    contaOrigem: ui.financeiro_conta_origem,
    contaDestino: ui.financeiro_conta_destino,
    valor: `${ui.financeiro_col_valor} (R$)`,
    data: ui.financeiro_data_efetiva,
    classificar: ui.financeiro_classificar_titulo,
    novaDespesa: ui.financeiro_nova_despesa,
    selecione: ui.financeiro_selecione,
    selecioneConta: ui.financeiro_selecione_conta,
    titulo: ui.financeiro_titulo_campo,
    tituloReceber: ui.financeiro_titulo_receber,
    tituloPagar: ui.financeiro_titulo_pagar,
    valorMensal: ui.financeiro_valor_mensal,
    primeiroVencimento: ui.financeiro_primeiro_vencimento,
    competencia: ui.financeiro_competencia,
    competenciaInicial: ui.financeiro_competencia_inicial,
    pagar: mensagens.contas_pagar.btn_pagar,
    receber: ui.financeiro_acao_receber_titulo,
    pagarConta: mensagens.contas_pagar.btn_pagar_conta,
    receberConta: ui.financeiro_linha_receber_conta,
  }
}
