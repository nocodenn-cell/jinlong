/**
 * P0 — contrato ponta a ponta: cadastro → estoque → PDV.
 *
 * O modo de falha que este teste existe para pegar é silencioso: o produto é
 * cadastrado com sucesso, aparece no catálogo, e simplesmente **nunca aparece
 * no PDV** — porque em algum ponto da cadeia o `status_publicacao`/`ativo`
 * parou de ser propagado, ou a linha de estoque deixou de ser criada.
 *
 * A cadeia real, sem I/O (cada elo é puro e testável):
 *
 *   form (buildSubmitPayload)
 *     → Zod (NovoProdutoSchema / NovoProdutoRascunhoSchema)
 *     → lifecycle (statusInicialProduto | dualWriteFromStatus)
 *     → mapFormToCreateProductInput          (UI snake → domínio camel)
 *     → mapCreateProductInputToRpc           (domínio → payload legado RPC 270)
 *     → defaultStatusNovoProduto             (dual-write final gravado na linha)
 *     → evaluateProduct / isProdutoVendavel  (regra única do PDV)
 *
 * Se qualquer elo perder o status, o `vendavel` no fim da cadeia vira false e o
 * teste quebra apontando o elo.
 */
import { describe, expect, it } from 'vitest'
import { statusInicialProduto } from '@/core/systemRules'
import { dualWriteFromStatus, defaultStatusNovoProduto } from '@/core/catalog/statusPublicacao'
import { isProdutoVendavel } from '@/lib/catalog/isProdutoVendavel'
import { mapFormToCreateProductInput } from '@/app/admin/produtos/productFormMappers'
import { mapCreateProductInputToRpc } from '@/app/admin/produtos/productWriter'
import { buildSubmitPayload } from '@/components/gerente/produtos/form/produtoForm.mappers'
import { NovoProdutoRascunhoSchema, NovoProdutoSchema } from './produtoFormSchema'

/** Estado do formulário como o modal monta ao salvar. */
function estadoFormulario(over: Partial<Parameters<typeof buildSubmitPayload>[0]> = {}) {
  return buildSubmitPayload({
    nome: 'Caneca Térmica 300ml',
    codigoBarras: '7891234567890',
    codigoInterno: '',
    referenciaFornecedor: '',
    nomeReduzidoPdv: '',
    localizacaoPrateleira: '',
    origem: 'china_manual',
    unidadeMedida: 'UN',
    categoriaId: '',
    marcaId: '',
    fornecedorId: '',
    observacao: '',
    quantidadeGatilho: '',
    permitirAbaixoCusto: false,
    ncm: '',
    cfopProduto: '',
    csosn: '400',
    cest: '',
    cstPis: '07',
    cstCofins: '07',
    icmsOrigem: '',
    precoVarejo: 25,
    precoAtacado: null,
    precoCusto: 10,
    ...over,
  })
}

/**
 * Percorre a cadeia inteira e devolve o que a RPC 270 gravaria + o veredito do PDV.
 * `estoqueInicial` entra como a UI manda (string do input já parseada em número).
 */
function cadastrarEAvaliar(opts: {
  rascunho: boolean
  estoqueInicial: number
  estoqueMinimo?: number
}) {
  const base = estadoFormulario()
  const entrada = {
    ...base,
    ...(opts.rascunho ? { status_publicacao: 'DRAFT' as const } : {}),
    estoque_inicial_quantidade: opts.estoqueInicial,
    estoque_inicial_minimo: opts.estoqueMinimo ?? 0,
    client_request_id: null,
  }

  const parsed = opts.rascunho
    ? NovoProdutoRascunhoSchema.safeParse(entrada)
    : NovoProdutoSchema.safeParse(entrada)
  if (!parsed.success) {
    throw new Error(`Zod reprovou o payload do formulário: ${parsed.error.issues[0]?.message}`)
  }

  // Mesma decisão de lifecycle que `criarProduto` aplica na server action.
  const lifecycle = opts.rascunho ? dualWriteFromStatus('DRAFT') : statusInicialProduto('human')

  const rpcPayload = mapCreateProductInputToRpc(
    mapFormToCreateProductInput(parsed.data, lifecycle),
  )

  // O que a RPC 270 efetivamente grava na linha de `produtos`.
  const linhaGravada = defaultStatusNovoProduto(rpcPayload)

  return {
    rpcPayload,
    linhaGravada,
    vendavelNoPdv: isProdutoVendavel({
      ativo: linhaGravada.ativo,
      status_publicacao: linhaGravada.status_publicacao,
    }),
  }
}

describe('P0 — cadastro → estoque → PDV', () => {
  it('cadastro manual com estoque cai no PDV vendável e com saldo pedido', () => {
    const r = cadastrarEAvaliar({ rascunho: false, estoqueInicial: 12, estoqueMinimo: 2 })

    expect(r.linhaGravada).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    expect(r.vendavelNoPdv).toBe(true)
    // Estoque inicial precisa chegar à RPC: é o mesmo TX que cria a linha.
    expect(r.rpcPayload.estoque_inicial_quantidade).toBe(12)
    expect(r.rpcPayload.estoque_inicial_minimo).toBe(2)
  })

  it('rascunho não vaza para o PDV', () => {
    const r = cadastrarEAvaliar({ rascunho: true, estoqueInicial: 12 })

    expect(r.linhaGravada).toEqual({ status_publicacao: 'DRAFT', ativo: false })
    expect(r.vendavelNoPdv).toBe(false)
  })

  it('publicar um rascunho depois o torna vendável', () => {
    const publicado = dualWriteFromStatus('PUBLICADO')

    expect(isProdutoVendavel({ ...publicado })).toBe(true)
  })

  it('inativar tira do PDV', () => {
    const inativo = dualWriteFromStatus('INATIVO')

    expect(isProdutoVendavel({ ...inativo })).toBe(false)
  })

  it('preços e identificação atravessam a cadeia sem perda', () => {
    const r = cadastrarEAvaliar({ rascunho: false, estoqueInicial: 1 })

    expect(r.rpcPayload.nome).toBe('Caneca Térmica 300ml')
    expect(r.rpcPayload.codigo_barras).toBe('7891234567890')
    expect(r.rpcPayload.preco_varejo).toBe(25)
    expect(r.rpcPayload.preco_custo).toBe(10)
    expect(r.rpcPayload.unidade_medida).toBe('UN')
    expect(r.rpcPayload.origem).toBe('china_manual')
  })

  /**
   * Publicado com saldo 0 continua vendável pela REGRA de catálogo — quem barra
   * é `decrementar_estoque_seguro` dentro de `finalizar_venda_v4`. A tela
   * pós-salvar depende disso para avisar o operador em vez de dizer que o
   * produto já vende (ver ProdutoFormModal.posSalvarEstoque.behavior.test).
   */
  it('publicado com saldo 0 é vendável na regra de catálogo; o bloqueio é da venda', () => {
    const r = cadastrarEAvaliar({ rascunho: false, estoqueInicial: 0 })

    expect(r.vendavelNoPdv).toBe(true)
    expect(r.rpcPayload.estoque_inicial_quantidade).toBe(0)
  })

  it('rascunho aceita preço 0; cadastro publicado exige preço positivo', () => {
    expect(() => cadastrarEAvaliar({ rascunho: true, estoqueInicial: 0 })).not.toThrow()

    const semPreco = { ...estadoFormulario({ precoVarejo: 0 }), estoque_inicial_quantidade: 0 }
    expect(NovoProdutoSchema.safeParse(semPreco).success).toBe(false)
    expect(
      NovoProdutoRascunhoSchema.safeParse({ ...semPreco, status_publicacao: 'DRAFT' }).success,
    ).toBe(true)
  })
})
