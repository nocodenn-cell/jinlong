import type { MoneyInputBag } from '@/hooks/useMoneyInput'
import type { Mensagens } from '@/i18n/getMessages'
import type { OpcoesFiltrosProdutos } from '@/lib/gerente/produtos/opcoesFiltrosTypes'
import type { ProdutoGerenteRow } from '@/lib/gerente/produtos/produtoGerenteTypes'

export type OrigemCode = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
export type UnidadeCode = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

/** Dados somente leitura — injetados pelo wrapper, nunca por modo nas seções. */
export type ProdutoFormReadOnly = Readonly<{
  produtoId: string | null
  estoqueAtual: number | null
  estoqueMinimo: number | null
  custoMedio: number | null
  temNf: boolean
}>

export type ProdutoFormFieldProps = Readonly<{
  p: Mensagens['produtos']
  disabled: boolean
  inputClassName: string
  inputMonoClassName: string
  selectClassName: string
}>

export type ProdutoFormState = Readonly<{
  nome: string
  setNome: (v: string) => void
  codigoBarras: string
  setCodigoBarras: (v: string) => void
  codigoInterno: string
  setCodigoInterno: (v: string) => void
  referenciaFornecedor: string
  setReferenciaFornecedor: (v: string) => void
  nomeReduzidoPdv: string
  setNomeReduzidoPdv: (v: string) => void
  localizacaoPrateleira: string
  setLocalizacaoPrateleira: (v: string) => void
  origem: OrigemCode
  setOrigem: (v: OrigemCode) => void
  unidadeMedida: UnidadeCode
  setUnidadeMedida: (v: UnidadeCode) => void
  categoriaId: string
  setCategoriaId: (v: string) => void
  marcaId: string
  setMarcaId: (v: string) => void
  fornecedorId: string
  setFornecedorId: (v: string) => void
  observacao: string
  setObservacao: (v: string) => void
  quantidadeGatilho: string
  setQuantidadeGatilho: (v: string) => void
  permitirAbaixoCusto: boolean
  setPermitirAbaixoCusto: (v: boolean) => void
  ncm: string
  setNcm: (v: string) => void
  cfopProduto: string
  setCfopProduto: (v: string) => void
  csosn: string
  setCsosn: (v: string) => void
  cest: string
  setCest: (v: string) => void
  cstPis: string
  setCstPis: (v: string) => void
  cstCofins: string
  setCstCofins: (v: string) => void
  /** Código de origem ICMS (Focus, '0'..'8') — string vazia = não classificado. SEM default. */
  icmsOrigem: string
  setIcmsOrigem: (v: string) => void
  precoVarejoInput: MoneyInputBag
  precoAtacadoInput: MoneyInputBag
  precoCustoInput: MoneyInputBag
  estoqueInicialQty: string
  setEstoqueInicialQty: (v: string) => void
  estoqueInicialMin: string
  setEstoqueInicialMin: (v: string) => void
}>

export type ProdutoFormShellProps = Readonly<{
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  produto: ProdutoGerenteRow | null
  readOnly: ProdutoFormReadOnly
  disabled: boolean
  onFornecedoresChange?: (fornecedores: OpcoesFiltrosProdutos['fornecedores']) => void
  onCategoriasChange?: (categorias: OpcoesFiltrosProdutos['categorias']) => void
  onMarcasChange?: (marcas: OpcoesFiltrosProdutos['marcas']) => void
  /**
   * Foto trocada/removida. Recebe a nova URL (ou `null`). NÃO significa "produto
   * salvo": quem consome deve apenas recarregar a lista, nunca fechar o formulário
   * — fechar aqui descartaria os campos ainda não salvos.
   */
  onImagemChange?: (imagemUrl: string | null) => void
}>
