/**
 * FastProduct Admin — Configurações (Fase 7)
 *
 * Server Component. Carrega dados da loja + PDV config das tabelas (inline, no gerente
 * faz assim). Passa para client component que renderiza 3 abas:
 *   - Loja (dados gerais, endereço, logo) — reusa `atualizarDadosLojaAction`
 *   - PDV (fiscal, preferências) — reusa `atualizarConfiguracoesPdvAction`
 *   - Cadastros (modal rápido p/ cliente, links p/ categoria/marca/fornecedor)
 *
 * Zero query nova — reutiliza ações existentes de /gerente/configuracoes.
 */

import { createClient } from '@/lib/supabase/server'
import { ConfiguracoesContent, type ConfigDados } from './_components/ConfiguracoesContent'

export default async function AdminConfiguracoes() {
  const supabase = await createClient()

  const [{ data: loja }, { data: pdvConfig }] = await Promise.all([
    supabase
      .from('lojas')
      .select(
        `
        id, nome, cnpj, inscricao_estadual, telefone, email, logo_url,
        endereco_logradouro, endereco_numero, endereco_complemento,
        endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
        razao_social, nome_fantasia, cnae,
        numero_serie_nfce, numero_serie_nfe
      `
      )
      .maybeSingle(),
    supabase
      .from('pdv_config')
      .select(
        `
        loja_id, cfop_padrao, cst_padrao, regime_tributario,
        auto_enqueue_fiscal, idioma_padrao, tema_padrao,
        imprimir_cupom_auto, formato_impressao
      `
      )
      .maybeSingle(),
  ])

  const dados: ConfigDados = {
    loja: loja ?? null,
    pdvConfig: pdvConfig ?? null,
  }

  return <ConfiguracoesContent dados={dados} />
}
