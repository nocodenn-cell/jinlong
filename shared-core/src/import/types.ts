/**
 * Contratos públicos do motor de landed cost (puro, sem I/O).
 *
 * Fonte: `docs/import-intelligence/07-MOTOR-CONTRATO-MINIMO.md` §3, com as
 * resoluções de P-01 (vigência de regra) e P-02 (arredondamento literal).
 *
 * Todos os valores monetários, taxas, quantidades, fatores e pesos chegam como
 * string decimal. Nunca como number.
 */

/** String decimal com sinal opcional e ponto como separador. Ex.: "-12.500000". */
export type Decimal = string

/** Código ISO da moeda original. BRL é a moeda base e não precisa de câmbio. */
export type Moeda = string

/** Fonte do câmbio, para auditoria. Não altera o cálculo (DECISÃO-04). */
export type FonteCambio = 'DECLARADA_DI' | 'MANUAL' | 'OUTRA'

export type CriterioRateio = 'VALOR_ADUANEIRO' | 'PESO_LIQUIDO' | 'PESO_BRUTO' | 'VOLUME' | 'QUANTIDADE_ESTOQUE'

/**
 * Status de recuperabilidade classificado pela contabilidade (`03-MATRIZ-FISCAL.md` §3).
 * O motor lê o status gravado; nunca o infere.
 */
export type StatusRecuperabilidade =
  | 'PENDENTE_VALIDACAO'
  | 'NAO_RECUPERAVEL'
  | 'RECUPERAVEL_POTENCIAL'
  | 'RECUPERAVEL_RECONHECIDO'
  | 'GLOSADO'
  | 'NAO_APLICAVEL'

/** Valor aceito para o modo de arredondamento. Mudar exige nova versão do motor (P-02). */
export type ArredondamentoPolitica = 'HALF_UP'

/** Política de cálculo aprovada (DECISÃO-06). Os valores são literais: não há ajuste por entrada. */
export interface PoliticaCalculo {
  readonly escala_intermediaria: 10
  readonly escala_persistencia: 4
  readonly escala_unitario: 6
  readonly arredondamento: ArredondamentoPolitica
  readonly ordem_residuo: 'MAIOR_RESTO_ITEM_ID_ASC'
}

export interface Cambio {
  readonly moeda: Moeda
  /** Taxa com até 10 casas, > 0. */
  readonly taxa: Decimal
  readonly fonte: FonteCambio
  /** Data do câmbio, YYYY-MM-DD. */
  readonly data: string
}

export interface ItemEntrada {
  readonly id: string
  readonly produto_id: string | null
  readonly moeda: Moeda
  /** Valor da mercadoria na moeda original, até 6 casas, ≥ 0. */
  readonly valor_mercadoria_moeda: Decimal
  /** Base aduaneira documentada em BRL (até 6 casas). Null = não informada. */
  readonly valor_aduaneiro_brl: Decimal | null
  /** Quantidade comercial, até 3 casas, > 0. Pode ser fracionada (ex.: 0.500 CX). */
  readonly quantidade_comercial: Decimal
  readonly unidade_comercial: string
  /** Fator de conversão para a unidade de estoque, até 6 casas, > 0. */
  readonly fator_para_estoque: Decimal
  /** Quantidade em unidade de estoque, até 3 casas, > 0. Deve ser comercial × fator. */
  readonly quantidade_estoque: Decimal
  readonly peso_liquido_kg: Decimal | null
  readonly peso_bruto_kg: Decimal | null
  readonly volume_m3: Decimal | null
}

/**
 * Atribuição de uma despesa ou desconto.
 * DIRETA vai para um item. RATEIO distribui pelo critério. Sempre com justificativa.
 */
export type Atribuicao =
  | { readonly modo: 'DIRETA'; readonly item_id: string; readonly justificativa: string }
  | { readonly modo: 'RATEIO'; readonly criterio: CriterioRateio; readonly justificativa: string }

export interface DespesaEntrada {
  readonly id: string
  readonly tipo: string
  readonly moeda: Moeda
  /**
   * Valor até 6 casas. Pode ser negativo: ajuste ou estorno documentado.
   * O sinal é preservado na composição do custo.
   */
  readonly valor: Decimal
  /**
   * true: entra no custo. false: não entra, registrado em `despesas_nao_incorporadas`.
   * 'DECISAO_03': decisão pendente; não entra no custo e gera divergência BLOQUEANTE.
   */
  readonly incorporavel: boolean | 'DECISAO_03'
  readonly atribuicao: Atribuicao
}

export interface DescontoEntrada {
  readonly id: string
  readonly escopo: 'ITEM' | 'PROCESSO'
  readonly moeda: Moeda
  /** Valor positivo até 6 casas. O sinal de redução é aplicado pelo motor. */
  readonly valor: Decimal
  readonly item_id?: string
  readonly criterio?: CriterioRateio
  readonly justificativa: string
}

/** Regra tributária referenciada pelo lançamento (`03-MATRIZ-FISCAL.md` §5). */
export interface RegraTributo {
  readonly id: string
  readonly incorpora_custo: boolean
  /** Início da vigência, YYYY-MM-DD. Obrigatório quando a regra é usada (P-01). */
  readonly vigencia_inicio: string
  /** Fim da vigência, YYYY-MM-DD. Null = em vigor. */
  readonly vigencia_fim: string | null
}

export interface TributoEntrada {
  readonly id: string
  readonly tributo_codigo: string
  readonly status_recuperabilidade: StatusRecuperabilidade
  /** Valor apurado em BRL, até 2 casas, ≥ 0. */
  readonly valor_apurado_brl: Decimal
  /** Item afetado. Obrigatório quando o tributo é incorporado ao custo. */
  readonly item_id: string | null
  /** Regra aplicada. Null quando o status não exige regra (ex.: pendente). */
  readonly regra: RegraTributo | null
  /** Data do fato gerador, YYYY-MM-DD. Obrigatória quando há regra (P-01). */
  readonly data_fato_gerador: string | null
  /** Quem validou o status. Obrigatório quando RECUPERAVEL_RECONHECIDO. */
  readonly validado_por: string | null
}

export interface LandedCostInput {
  readonly schema_version: '1'
  readonly processo: { readonly id: string; readonly loja_importadora_id: string; readonly moeda_base: 'BRL' }
  readonly politica: PoliticaCalculo
  readonly cambios: readonly Cambio[]
  readonly itens: readonly ItemEntrada[]
  readonly despesas: readonly DespesaEntrada[]
  readonly descontos: readonly DescontoEntrada[]
  readonly tributos: readonly TributoEntrada[]
}

export type Severidade = 'BLOQUEANTE' | 'AVISO'

export interface Divergencia {
  readonly codigo: string
  readonly severidade: Severidade
  readonly referencia: string
  readonly mensagem: string
}

export interface ComponentesBrl {
  readonly mercadoria: Decimal
  readonly despesas_incorporadas: Decimal
  readonly tributos_nao_recuperaveis: Decimal
  /** Negativo ou zero. */
  readonly descontos: Decimal
}

export interface ItemSaida {
  readonly item_id: string
  readonly produto_id: string | null
  readonly quantidade_estoque: Decimal
  readonly componentes_brl: ComponentesBrl
  /** Total do item, escala de persistência (4). */
  readonly custo_total_brl: Decimal
  /** Unitário, escala 6. */
  readonly custo_unitario_brl: Decimal
  /** Total exato − unitário × quantidade, escala 10. */
  readonly residuo_unitario_brl: Decimal
  /** Total exato − total persistido, escala 10. */
  readonly residuo_total_brl: Decimal
  /** Memória de cálculo em linguagem simples, uma linha por componente. */
  readonly memoria: readonly string[]
}

export interface RateioSaida {
  readonly origem_id: string
  readonly componente: 'despesas' | 'descontos' | 'tributos'
  readonly criterio: CriterioRateio
  readonly base_total: Decimal
  readonly item_id: string
  readonly base_item: Decimal
  /** Valor alocado, escala 10, exato. */
  readonly valor_alocado_brl: Decimal
  readonly justificativa: string
}

export interface CreditosSaida {
  /** Soma dos lançamentos RECUPERAVEL_POTENCIAL, escala 4. Não entra no custo. */
  readonly potencial_brl: Decimal
  /** Soma dos lançamentos RECUPERAVEL_RECONHECIDO, escala 4. Não entra no custo. */
  readonly reconhecido_brl: Decimal
}

export interface ConservacaoSaida {
  readonly entradas_brl: Decimal
  readonly descontos_brl: Decimal
  readonly saidas_brl: Decimal
  readonly diferenca_brl: Decimal
  readonly ok: boolean
}

export interface LandedCostOutput {
  readonly schema_version: '1'
  readonly engine_version: string
  readonly status: 'OK' | 'BLOQUEADO'
  readonly divergencias: readonly Divergencia[]
  readonly itens: readonly ItemSaida[]
  readonly rateios: readonly RateioSaida[]
  readonly despesas_nao_incorporadas: readonly string[]
  readonly creditos: CreditosSaida
  readonly conservacao: ConservacaoSaida
}

export interface LandedErroSaida {
  readonly codigo: string
  readonly detalhe: string | null
}

export type LandedResult =
  | { readonly ok: true; readonly value: LandedCostOutput }
  | { readonly ok: false; readonly error: LandedErroSaida }
