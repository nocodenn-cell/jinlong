import { createAdminClient } from '@/lib/supabase/admin'
import type { NovoProdutoInput } from '@/core/ports/produto'
import { defaultStatusNovoProduto } from '@/core/catalog/statusPublicacao'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { mensagemErroAjusteEstoqueManual } from '@/lib/gerente/estoqueInicialCadastro'
import { getLojaIdUsuario } from '@/lib/auth/lojaUsuario'
import {
  buscarProdutoPorCodigoBarrasLoja,
  formatMensagemCodigoBarrasDuplicado,
} from '@/lib/gerente/produtoCodigoBarrasDuplicado'
import { derivarFaixaAtacado } from '@/app/admin/produtos/productUpdater'

export type CriarProdutoEstoqueInput = NovoProdutoInput & {
  estoque_inicial_quantidade?: number
  estoque_inicial_minimo?: number
  client_request_id?: string | null
}

const CRIAR_MSGS: Record<string, string> = {
  CRIAR_PRODUTO_AUTH: 'Sessão inválida para cadastrar produto. Faça login novamente.',
  CRIAR_PRODUTO_PERFIL:
    'Seu perfil não pode cadastrar produto. Use operador (PDV relâmpago) ou gerente/dono/admin.',
  CRIAR_PRODUTO_LOJA: 'Não foi possível identificar a loja da sessão.',
  CRIAR_PRODUTO_NOME: 'Informe um nome de produto válido (mín. 2 caracteres).',
  CRIAR_PRODUTO_PRECO: 'Preço de varejo inválido.',
  CRIAR_PRODUTO_ORIGEM: 'Origem do produto inválida.',
  CRIAR_PRODUTO_STATUS: 'Status de publicação inválido.',
  CRIAR_PRODUTO_ESTOQUE_INVALIDO: 'Estoque inicial ou mínimo inválido.',
  CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO:
    'Código de barras já cadastrado nesta loja. Busque o produto existente no catálogo.',
  // Onda 2 · Bloco 4 — faixa de atacado agora validada dentro da mesma RPC
  // (antes falhava numa 2ª chamada separada, `criarFaixaAtacado`, com suas
  // próprias mensagens em precosAtacadoActions.ts). PRECO_ATACADO_ABAIXO_CUSTO
  // (trigger de margem, migration 124) NÃO entra aqui de propósito — cai no
  // fallback `mensagemErroComSecao` abaixo, que já resolve pro dicionário
  // bilíngue central (`shared/mensagemErroUsuario.ts`, Onda 1). Duplicar a
  // mensagem aqui, só em PT, era exatamente o tipo de fragmentação que
  // aquele dicionário existe para evitar.
  CRIAR_PRODUTO_FAIXA_QTD_INVALIDA: 'Quantidade mínima do atacado deve ser maior que zero.',
  CRIAR_PRODUTO_FAIXA_PRECO_INVALIDO: 'Preço de atacado deve ser maior que zero.',
}

export function mensagemErroCriarProdutoRpc(detalhe: string): string {
  const raw = (detalhe ?? '').trim()
  if (!raw) return 'Não foi possível salvar o produto. Tente de novo.'
  for (const code of Object.keys(CRIAR_MSGS)) {
    if (raw.includes(code)) return CRIAR_MSGS[code]!
  }
  if (raw.includes('AJUSTE_ESTOQUE_')) {
    return mensagemErroAjusteEstoqueManual(raw)
  }
  return mensagemErroComSecao('Cadastro de produto', raw)
}

/**
 * Como `mensagemErroCriarProdutoRpc`, mas para o caso específico de código de
 * barras duplicado busca o produto conflitante e nomeia ele na mensagem — em
 * vez do texto genérico "busque o produto existente". Isolada da função
 * síncrona acima para não quebrar os testes/consumidores que esperam
 * `mensagemErroCriarProdutoRpc` sem I/O.
 */
export async function mensagemErroCriarProdutoRpcEnriquecida(
  detalhe: string,
  ctx: { admin: ReturnType<typeof createAdminClient>; atorId: string; codigoBarras: string | null },
): Promise<string> {
  const raw = (detalhe ?? '').trim()
  if (!raw.includes('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO')) {
    return mensagemErroCriarProdutoRpc(detalhe)
  }
  // Best-effort: se a busca do nome falhar por qualquer motivo, cai na
  // mensagem genérica em vez de mascarar o erro real de duplicidade.
  try {
    const lojaId = ctx.codigoBarras ? await getLojaIdUsuario(ctx.admin, ctx.atorId) : null
    const existente =
      lojaId && ctx.codigoBarras
        ? await buscarProdutoPorCodigoBarrasLoja(ctx.admin, ctx.codigoBarras, lojaId)
        : null
    return formatMensagemCodigoBarrasDuplicado(existente?.nome ?? null)
  } catch {
    return formatMensagemCodigoBarrasDuplicado(null)
  }
}

function buildPayload(input: CriarProdutoEstoqueInput): Record<string, unknown> {
  const lifecycle = defaultStatusNovoProduto(input)
  const qty = Number(input.estoque_inicial_quantidade ?? 0)
  const min = Number(input.estoque_inicial_minimo ?? 0)
  return {
    nome: input.nome,
    codigo_barras: input.codigo_barras?.trim() || null,
    codigo_interno: input.codigo_interno?.trim() || null,
    referencia_fornecedor: input.referencia_fornecedor?.trim() || null,
    nome_reduzido_pdv: input.nome_reduzido_pdv?.trim() || null,
    localizacao_prateleira: input.localizacao_prateleira?.trim() || null,
    preco_varejo: input.preco_varejo,
    preco_atacado:
      input.preco_atacado !== undefined && input.preco_atacado !== null
        ? Number(input.preco_atacado)
        : null,
    preco_custo:
      input.preco_custo !== undefined && input.preco_custo !== null
        ? Number(input.preco_custo)
        : null,
    permitir_abaixo_custo: input.permitir_abaixo_custo ?? false,
    quantidade_gatilho_atacado: input.quantidade_gatilho_atacado ?? null,
    origem: input.origem,
    tem_nf: input.tem_nf,
    unidade_medida: input.unidade_medida ?? 'UN',
    observacao: input.observacao ?? null,
    categoria_id: input.categoria_id ?? null,
    marca_id: input.marca_id ?? null,
    fornecedor_id: input.fornecedor_id ?? null,
    ncm: input.ncm ?? null,
    cfop_produto: input.cfop_produto ?? null,
    csosn: input.csosn ?? null,
    cest: input.cest ?? null,
    cst_pis: input.cst_pis ?? null,
    cst_cofins: input.cst_cofins ?? null,
    ativo: lifecycle.ativo,
    status_publicacao: lifecycle.status_publicacao,
    estoque_inicial_quantidade: Number.isFinite(qty) && qty > 0 ? qty : 0,
    estoque_inicial_minimo: Number.isFinite(min) && min > 0 ? min : 0,
  }
}

/**
 * Onda 2 · Bloco 4 — mesmo par (preco_atacado, quantidade_gatilho_atacado) do
 * payload do catálogo, reaproveitando `derivarFaixaAtacado` (já usado pelo
 * UPDATE em `productUpdater.ts`) em vez de reimplementar a regra aqui.
 */
function derivarFaixaAtacadoCreate(
  input: CriarProdutoEstoqueInput,
): { quantidade_minima: number; preco_unitario: number } | null {
  return derivarFaixaAtacado({
    preco_atacado: input.preco_atacado ?? null,
    quantidade_gatilho_atacado: input.quantidade_gatilho_atacado ?? null,
  })
}

/**
 * Banco ainda sem a migration desta onda (20260831110000): só existe a
 * versão de 3 parâmetros da RPC (sem `p_faixa`), e chamar com 4 argumentos
 * nomeados não acha overload — PostgREST devolve "function not found"
 * (`PGRST202`/`42883`), o mesmo sintoma que `rpcAusente()` já trata em
 * `productUpdater.ts` pro caminho de edição. Mesma disciplina "banco
 * primeiro": sem fallback que grave a faixa sem o suporte do banco.
 */
function rpcCriarProdutoFaixaAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const msg = error.message ?? ''
  return (
    msg.includes('criar_produto_com_estoque_inicial') &&
    (msg.includes('does not exist') || msg.includes('Could not find the function'))
  )
}

/**
 * Cria produto + estoque (+ kardex se qty/min > 0) + faixa de atacado (se
 * preço e gatilho vierem preenchidos) via RPC atômica (service_role +
 * p_ator_id) — Onda 2 · Bloco 4. Antes, a faixa era uma 2ª chamada separada
 * (`sincronizarFaixaAtacado` em ProdutoFormModal.tsx), fora da transação do
 * produto; uma falha ali deixava o produto criado sem a faixa correspondente.
 */
export async function executarCriarProdutoComEstoqueInicial(opts: {
  input: CriarProdutoEstoqueInput
  atorId: string
}): Promise<
  | { ok: true; id: string; replayed: boolean; estoqueAplicado: boolean; faixaSincronizada: boolean }
  | { ok: false; message: string }
> {
  if (!opts.atorId) {
    return { ok: false, message: mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_AUTH') }
  }

  const admin = createAdminClient()
  const requestId = opts.input.client_request_id?.trim() || null
  const faixa = derivarFaixaAtacadoCreate(opts.input)
  // RPC 270 ainda não está no Database tipado gerado — cast pontual.
  const rpcClient = admin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  }
  const payload = buildPayload(opts.input)

  let { data, error } = await rpcClient.rpc('criar_produto_com_estoque_inicial', {
    p_payload: payload,
    p_ator_id: opts.atorId,
    p_request_id: requestId,
    p_faixa: faixa,
  })

  if (error && rpcCriarProdutoFaixaAusente(error)) {
    if (faixa) {
      // Recusa ANTES de qualquer escrita — nada foi persistido ainda (a
      // chamada com p_faixa nem chegou a existir do lado do banco).
      return {
        ok: false,
        message:
          'O cadastro de produto com preço de atacado precisa de uma atualização do banco ainda não aplicada. ' +
          'Cadastre o produto sem atacado por enquanto, ou tente novamente após a atualização.',
      }
    }
    // Sem faixa pedida — a chamada de 3 argumentos ainda existe no banco
    // antigo e cobre o caso todo (nada relacionado a atacado foi perdido).
    ;({ data, error } = await rpcClient.rpc('criar_produto_com_estoque_inicial', {
      p_payload: payload,
      p_ator_id: opts.atorId,
      p_request_id: requestId,
    }))
  }

  if (error) {
    const message = await mensagemErroCriarProdutoRpcEnriquecida(error.message, {
      admin,
      atorId: opts.atorId,
      codigoBarras: opts.input.codigo_barras?.trim() || null,
    })
    return { ok: false, message }
  }

  const row = data as {
    produto_id?: string
    replayed?: boolean
    estoque_aplicado?: boolean
    faixa_sincronizada?: boolean
  } | null

  const id = row?.produto_id
  if (!id) {
    return { ok: false, message: 'Não foi possível salvar o produto. Tente de novo.' }
  }

  return {
    ok: true,
    id: String(id),
    replayed: Boolean(row?.replayed),
    estoqueAplicado: Boolean(row?.estoque_aplicado),
    faixaSincronizada: Boolean(row?.faixa_sincronizada),
  }
}
