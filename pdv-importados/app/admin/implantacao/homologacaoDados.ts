/**
 * P0-DADOS — critérios mínimos para homologação do 1º cliente.
 * Avaliador puro (sem I/O). Coleta via `coletarDadosHomologacao`.
 */

export type DadosHomologacaoSnapshot = Readonly<{
  donosAtivos: number
  gerentesAtivos: number
  operadoresAtivos: number
  categoriasProduto: number
  produtosPublicados: number
  produtosComEstoque: number
  clientes: number
  fornecedores: number
  temPdvConfig: boolean
  /** Formas canônicas do PDV (enum fixo) — sempre true se o app estiver no ar. */
  formasPagamentoOk: boolean
  /** Config mínima da loja para operar com Stub fiscal. */
  impostosMinimosOk: boolean
}>

export type DadosHomologacaoCheckId =
  | 'usuarios.dono'
  | 'usuarios.gerente'
  | 'usuarios.operadores'
  | 'cadastro.categorias'
  | 'cadastro.produtos'
  | 'estoque.saldo'
  | 'cadastro.clientes'
  | 'cadastro.fornecedores'
  | 'loja.pdv'
  | 'formas.pagamento'
  | 'impostos.minimos'

export type DadosHomologacaoGap = Readonly<{
  id: DadosHomologacaoCheckId
  minimo: number | boolean
  atual: number | boolean
}>

export type DadosHomologacaoResult = Readonly<{
  ok: boolean
  gaps: readonly DadosHomologacaoGap[]
}>

const MIN = {
  donos: 1,
  gerentes: 1,
  operadores: 1,
  categorias: 1,
  produtos: 3,
  estoque: 3,
  clientes: 1,
  fornecedores: 1,
} as const

function gapNum(
  id: DadosHomologacaoCheckId,
  atual: number,
  minimo: number,
): DadosHomologacaoGap | null {
  if (atual >= minimo) return null
  return { id, minimo, atual }
}

function gapBool(
  id: DadosHomologacaoCheckId,
  atual: boolean,
): DadosHomologacaoGap | null {
  if (atual) return null
  return { id, minimo: true, atual }
}

/** Avalia se a loja tem dados suficientes para o roteiro de homologação. */
export function avaliarDadosHomologacao(
  snap: DadosHomologacaoSnapshot,
): DadosHomologacaoResult {
  const gaps = [
    gapNum('usuarios.dono', snap.donosAtivos, MIN.donos),
    gapNum('usuarios.gerente', snap.gerentesAtivos, MIN.gerentes),
    gapNum('usuarios.operadores', snap.operadoresAtivos, MIN.operadores),
    gapNum('cadastro.categorias', snap.categoriasProduto, MIN.categorias),
    gapNum('cadastro.produtos', snap.produtosPublicados, MIN.produtos),
    gapNum('estoque.saldo', snap.produtosComEstoque, MIN.estoque),
    gapNum('cadastro.clientes', snap.clientes, MIN.clientes),
    gapNum('cadastro.fornecedores', snap.fornecedores, MIN.fornecedores),
    gapBool('loja.pdv', snap.temPdvConfig),
    gapBool('formas.pagamento', snap.formasPagamentoOk),
    gapBool('impostos.minimos', snap.impostosMinimosOk),
  ].filter((g): g is DadosHomologacaoGap => g !== null)

  return { ok: gaps.length === 0, gaps }
}

/** Texto curto para observação do checklist (pt). */
export function formatarGapsHomologacao(gaps: readonly DadosHomologacaoGap[]): string {
  if (gaps.length === 0) return 'Dados mínimos OK para homologação.'
  return gaps
    .map((g) => `${g.id}: atual=${String(g.atual)} mínimo=${String(g.minimo)}`)
    .join('; ')
}
