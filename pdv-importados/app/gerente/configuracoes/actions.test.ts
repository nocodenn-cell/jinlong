import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSession } from '@/lib/admin/auth/types'
import type { LojaConfig, PdvConfig } from './actions'

const mocks = vi.hoisted(() => ({
  assertGerenteSession: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: mocks.assertGerenteSession,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

function makeSession(lojaId: string | null = 'loja-1'): AdminSession {
  return {
    userId: 'gerente-1',
    user: { id: 'gerente-1', email: 'gerente@test.local' } as AdminSession['user'],
    perfil: 'GERENTE',
    idioma: 'pt',
    lojaId,
  }
}

function makeLojaInput(overrides: Partial<LojaConfig> = {}): LojaConfig {
  return {
    id: 'loja-1',
    nome: 'Loja Central',
    cnpj: '12345678000190',
    inscricao_estadual: null,
    telefone: null,
    email: 'loja@test.local',
    logo_url: null,
    endereco_logradouro: null,
    endereco_numero: null,
    endereco_complemento: null,
    endereco_bairro: null,
    endereco_cidade: null,
    endereco_uf: null,
    endereco_cep: null,
    razao_social: null,
    nome_fantasia: null,
    cnae: null,
    numero_serie_nfce: 1,
    numero_serie_nfe: 1,
    ...overrides,
  }
}

function makePdvInput(overrides: Partial<PdvConfig> = {}): PdvConfig {
  return {
    loja_id: 'loja-1',
    cfop_padrao: '5102',
    cst_padrao: '00',
    regime_tributario: 'SIMPLES_NACIONAL',
    auto_enqueue_fiscal: false,
    idioma_padrao: 'pt',
    tema_padrao: 'noturno',
    imprimir_cupom_auto: false,
    formato_impressao: 'TERMICA',
    ...overrides,
  }
}

function mockLojaUpdate(data: LojaConfig) {
  const single = vi.fn().mockResolvedValue({ data, error: null })
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const insert = vi.fn()
  const from = vi.fn((table: string) => {
    expect(table).toBe('lojas')
    return { update, insert }
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from, update, insert, eq, select, single }
}

function mockPdvUpsert(data: PdvConfig) {
  const single = vi.fn().mockResolvedValue({ data, error: null })
  const select = vi.fn(() => ({ single }))
  const upsert = vi.fn(() => ({ select }))
  const from = vi.fn((table: string) => {
    expect(table).toBe('pdv_config')
    return { upsert }
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from, upsert, select, single }
}

describe('configuracoes actions loja scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertGerenteSession.mockResolvedValue({ ok: true, session: makeSession() })
  })

  it('recusa salvar dados de loja sem loja vinculada na sessao', async () => {
    mocks.assertGerenteSession.mockResolvedValue({ ok: true, session: makeSession(null) })
    const { atualizarDadosLojaAction } = await import('./actions')

    const result = await atualizarDadosLojaAction(makeLojaInput())

    expect(result).toEqual({
      ok: false,
      error: 'Loja da sessão não identificada. Faça login novamente.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('recusa salvar dados de loja diferente da sessao', async () => {
    const { atualizarDadosLojaAction } = await import('./actions')

    const result = await atualizarDadosLojaAction(makeLojaInput({ id: 'loja-2' }))

    expect(result).toEqual({
      ok: false,
      error: 'Atualização recusada: loja do formulário não pertence à sessão.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('atualiza somente a loja da sessao e nao insere loja nova', async () => {
    const input = makeLojaInput()
    const supabase = mockLojaUpdate(input)
    const { atualizarDadosLojaAction } = await import('./actions')

    const result = await atualizarDadosLojaAction(input)

    expect(result.ok).toBe(true)
    expect(supabase.update).toHaveBeenCalledOnce()
    expect(supabase.eq).toHaveBeenCalledWith('id', 'loja-1')
    expect(supabase.insert).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/configuracoes')
  })

  it('recusa salvar PDV de loja diferente da sessao antes do upsert', async () => {
    const { atualizarConfiguracoesPdvAction } = await import('./actions')

    const result = await atualizarConfiguracoesPdvAction(makePdvInput({ loja_id: 'loja-2' }))

    expect(result).toEqual({
      ok: false,
      error: 'Atualização recusada: loja do formulário não pertence à sessão.',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('faz upsert de PDV somente para a loja da sessao', async () => {
    const input = makePdvInput()
    const supabase = mockPdvUpsert(input)
    const { atualizarConfiguracoesPdvAction } = await import('./actions')

    const result = await atualizarConfiguracoesPdvAction(input)

    expect(result.ok).toBe(true)
    expect(supabase.upsert).toHaveBeenCalledWith(expect.objectContaining({ loja_id: 'loja-1' }), {
      onConflict: 'loja_id',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/configuracoes')
  })
})
