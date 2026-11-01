import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  executarCriarProdutoComEstoqueInicial,
  mensagemErroCriarProdutoRpc,
  mensagemErroCriarProdutoRpcEnriquecida,
  type CriarProdutoEstoqueInput,
} from './criarProdutoComEstoqueInicialRpc'

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}))

const INPUT_BASE: CriarProdutoEstoqueInput = {
  nome: 'Cadeira Vermelha',
  codigo_barras: null,
  preco_varejo: 100,
  origem: 'brasil_nf',
  tem_nf: true,
}

describe('mensagemErroCriarProdutoRpc', () => {
  it('mapeia códigos de auth/perfil/barcode', () => {
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_AUTH')).toContain('login')
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_PERFIL')).toContain('gerente')
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO')).toContain(
      'Código de barras',
    )
  })

  it('reusa mensagens de ajuste de estoque', () => {
    expect(mensagemErroCriarProdutoRpc('AJUSTE_ESTOQUE_LOJA_INVALIDA')).toContain('loja')
  })

  it('Onda 2 · Bloco 4 — mapeia códigos de validação de faixa de atacado', () => {
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_FAIXA_QTD_INVALIDA')).toContain(
      'Quantidade mínima',
    )
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_FAIXA_PRECO_INVALIDO')).toContain(
      'Preço de atacado',
    )
  })

  it('Onda 2 · Bloco 4 — PRECO_ATACADO_ABAIXO_CUSTO não é duplicado aqui, cai no dicionário central', () => {
    // Mensagem vem de shared/mensagemErroUsuario.ts (via mensagemErroComSecao),
    // não de um 2º dicionário local — só confirmamos que resolve para algo
    // específico do erro de margem, não a mensagem genérica de fallback.
    const msg = mensagemErroCriarProdutoRpc('PRECO_ATACADO_ABAIXO_CUSTO')
    expect(msg).not.toBe('Não foi possível salvar o produto. Tente de novo.')
  })
})

/** Fake admin client roteado por nome de tabela — cobre os dois lookups
 *  encadeados (usuarios.loja_id, depois produtos por loja+código). */
function fakeAdmin(opts: { lojaId: string | null; produtoExistente: { id: string; nome: string } | null }) {
  return {
    from: (table: string) => {
      if (table === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.lojaId ? { loja_id: opts.lojaId } : null, error: null }),
            }),
          }),
        }
      }
      if (table === 'produtos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: opts.produtoExistente, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`tabela inesperada no teste: ${table}`)
    },
  }
}

describe('mensagemErroCriarProdutoRpcEnriquecida', () => {
  it('não mexe em códigos que não são duplicidade de barras (passa direto pro mapeamento síncrono)', async () => {
    const admin = fakeAdmin({ lojaId: 'loja-1', produtoExistente: null })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_NOME', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: null,
    })
    expect(msg).toBe(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_NOME'))
  })

  it('create com código já existente → mensagem com o nome do produto conflitante', async () => {
    const admin = fakeAdmin({
      lojaId: 'loja-1',
      produtoExistente: { id: 'produto-existente', nome: 'Caixa Amarela' },
    })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: '0012366665',
    })
    expect(msg).toContain('Caixa Amarela')
  })

  it('fallback genérico quando a loja do usuário não resolve (sem lojaId, sem lookup de produto)', async () => {
    const admin = fakeAdmin({ lojaId: null, produtoExistente: { id: 'x', nome: 'Não deveria aparecer' } })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: '0012366665',
    })
    expect(msg).not.toContain('Não deveria aparecer')
    expect(msg).toContain('Busque o produto existente')
  })

  it('fallback genérico quando a consulta complementar lança exceção (best-effort, não derruba o create)', async () => {
    const throwingAdmin = {
      from: () => {
        throw new Error('conexão perdida')
      },
    }
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: throwingAdmin as never,
      atorId: 'user-1',
      codigoBarras: '0012366665',
    })
    expect(msg).toContain('Busque o produto existente')
  })

  it('sem código de barras informado, não tenta resolver loja nem produto (nada a buscar)', async () => {
    const admin = fakeAdmin({ lojaId: 'loja-1', produtoExistente: { id: 'x', nome: 'Não deveria aparecer' } })
    const msg = await mensagemErroCriarProdutoRpcEnriquecida('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO', {
      admin: admin as never,
      atorId: 'user-1',
      codigoBarras: null,
    })
    expect(msg).not.toContain('Não deveria aparecer')
  })
})

describe('executarCriarProdutoComEstoqueInicial — Onda 2 · Bloco 4 (faixa de atacado atômica)', () => {
  afterEach(() => {
    rpcMock.mockReset()
  })

  it('sem preço/gatilho de atacado preenchidos → chama a RPC com p_faixa null, numa única chamada', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { produto_id: 'produto-1', replayed: false, estoque_aplicado: false, faixa_sincronizada: false },
      error: null,
    })

    const r = await executarCriarProdutoComEstoqueInicial({ input: INPUT_BASE, atorId: 'ator-1' })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith(
      'criar_produto_com_estoque_inicial',
      expect.objectContaining({ p_faixa: null }),
    )
    expect(r).toEqual({ ok: true, id: 'produto-1', replayed: false, estoqueAplicado: false, faixaSincronizada: false })
  })

  it('com preço e gatilho de atacado preenchidos → chama a RPC já com p_faixa montado, e devolve faixaSincronizada da resposta', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { produto_id: 'produto-2', replayed: false, estoque_aplicado: true, faixa_sincronizada: true },
      error: null,
    })

    const input: CriarProdutoEstoqueInput = {
      ...INPUT_BASE,
      preco_atacado: 80,
      quantidade_gatilho_atacado: 10,
    }
    const r = await executarCriarProdutoComEstoqueInicial({ input, atorId: 'ator-1' })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith(
      'criar_produto_com_estoque_inicial',
      expect.objectContaining({ p_faixa: { quantidade_minima: 10, preco_unitario: 80 } }),
    )
    expect(r).toMatchObject({ ok: true, id: 'produto-2', faixaSincronizada: true })
  })

  it('banco sem a migration da faixa (PGRST202) e faixa foi pedida → recusa direto, sem 2ª chamada (nada foi escrito)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'function criar_produto_com_estoque_inicial(...) not found' },
    })

    const input: CriarProdutoEstoqueInput = {
      ...INPUT_BASE,
      preco_atacado: 80,
      quantidade_gatilho_atacado: 10,
    }
    const r = await executarCriarProdutoComEstoqueInicial({ input, atorId: 'ator-1' })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('atualização do banco ainda não aplicada')
    }
  })

  it('banco sem a migration da faixa (PGRST202) e nenhuma faixa pedida → cai para a chamada antiga de 3 argumentos', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'function criar_produto_com_estoque_inicial(...) not found' },
      })
      .mockResolvedValueOnce({
        data: { produto_id: 'produto-3', replayed: false, estoque_aplicado: false, faixa_sincronizada: false },
        error: null,
      })

    const r = await executarCriarProdutoComEstoqueInicial({ input: INPUT_BASE, atorId: 'ator-1' })

    expect(rpcMock).toHaveBeenCalledTimes(2)
    const segundaChamadaArgs = rpcMock.mock.calls[1]![1] as Record<string, unknown>
    expect(segundaChamadaArgs).not.toHaveProperty('p_faixa')
    expect(r).toEqual({ ok: true, id: 'produto-3', replayed: false, estoqueAplicado: false, faixaSincronizada: false })
  })

  it('erro de faixa inválida (quantidade/preço) devolvido pela RPC vira mensagem específica, não genérica', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'CRIAR_PRODUTO_FAIXA_QTD_INVALIDA' },
    })

    const input: CriarProdutoEstoqueInput = {
      ...INPUT_BASE,
      preco_atacado: 80,
      quantidade_gatilho_atacado: 10,
    }
    const r = await executarCriarProdutoComEstoqueInicial({ input, atorId: 'ator-1' })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('Quantidade mínima')
    }
  })
})

describe('mensagemErroCriarProdutoRpc — códigos novos da validação de entrada (VAL-01)', () => {
  it.each([
    ['CRIAR_PRODUTO_PRECO_CASAS', 'no máximo 2 casas'],
    ['CRIAR_PRODUTO_PRECO_LIMITE', 'acima do limite'],
    ['CRIAR_PRODUTO_CUSTO_CASAS', 'Custo aceita'],
    ['CRIAR_PRODUTO_ESTOQUE_FRACAO_UNIDADE', 'contada em inteiros'],
    ['CRIAR_PRODUTO_ESTOQUE_CASAS', '3 casas decimais'],
    ['CRIAR_PRODUTO_GATILHO_INVALIDO', 'número inteiro'],
  ])('%s não cai no código genérico CRIAR_PRODUTO_PRECO', (codigo, trecho) => {
    const msg = mensagemErroCriarProdutoRpc(`ERROR: ${codigo}`)
    expect(msg).toContain(trecho)
    expect(msg).not.toBe('Preço de varejo inválido.')
  })

  it('CRIAR_PRODUTO_PRECO continua mapeando para preço inválido', () => {
    expect(mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_PRECO')).toBe('Preço de varejo inválido.')
  })
})
