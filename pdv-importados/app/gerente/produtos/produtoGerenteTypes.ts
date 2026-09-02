import type { StatusPublicacao } from '@/core/ports/produto'

/** Linha de produto na listagem gerente (filtros + tabela). */
export type ProdutoGerenteRow = {
  id: string
  nome: string
  codigo_barras: string | null
  /** Código interno / SKU do produto. */
  codigo_interno: string | null
  /** Referência do produto no catálogo do fornecedor. */
  referencia_fornecedor: string | null
  /** Nome curto opcional para exibição compacta no PDV (cupom/tela de venda). */
  nome_reduzido_pdv: string | null
  /** Localização física na loja (ex: "A-12", "ESTANTE 3"). */
  localizacao_prateleira: string | null
  preco_varejo: number
  preco_atacado: number | null
  /** Preço de custo (base da trava de margem); null = não informado. */
  preco_custo: number | null
  /** Custo médio calculado (entradas/compras); somente leitura no cadastro. */
  preco_custo_medio: number
  /** Estoque mínimo configurado (tabela `estoque`, por loja); somente leitura no cadastro. */
  estoque_minimo: number | null
  /** Override: permite preço de venda abaixo do custo. */
  permitir_abaixo_custo: boolean
  quantidade_gatilho_atacado: number | null
  /** Estoque atual (da tabela estoque). Negativo = ruptura. */
  quantidade_atual: number | null
  origem: string
  tem_nf: boolean
  ativo: boolean
  status_publicacao: StatusPublicacao
  /** URL pública (Storage) ou null. */
  imagem_url: string | null
  categoria_id: string | null
  marca_id: string | null
  fornecedor_id: string | null
  unidade_medida: string
  observacao: string | null
  tags: string[] | null
  // ── Campos fiscais (Focus NFe) ────────────────────────────────────────────
  /** NCM de 8 dígitos — obrigatório pelo SEFAZ para NF-e/NFC-e. */
  ncm: string | null
  /** CFOP por produto; null usa o padrão da configuração da loja. */
  cfop_produto: string | null
  /** CSOSN para Simples Nacional (ex: '102', '400', '500'). */
  csosn: string | null
  /** Código CEST para produtos sujeitos a ICMS-ST. */
  cest: string | null
  /** CST PIS (ex: '07' = isenta, '49' = outras saídas). */
  cst_pis: string | null
  /** CST COFINS (ex: '07' = isenta, '49' = outras saídas). */
  cst_cofins: string | null
  /** Código de origem ICMS Focus ('0'..'8'). SEM default — NÃO confundir com `origem` (canal de aquisição). */
  icms_origem: string | null
}
