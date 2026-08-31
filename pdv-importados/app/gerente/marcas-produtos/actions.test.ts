import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ID 122 — mutações de marca já revalidam a rota admin real
 * (`/admin/marcas-produtos`) e a tag do catálogo. Garante que o padrão
 * canônico não regrida (paridade com categorias-produtos/actions.test.ts).
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient,
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/errors/mensagemErroUsuario', () => ({
  mensagemErroComSecao: (secao: string, msg: string) => `${secao}: ${msg}`,
  mensagemErroValidacaoZod: (msg: string) => msg,
}))
vi.mock('@/idioma/usuarioIdioma', () => ({
  getUsuarioIdioma: async () => ({ idioma: 'pt' }),
}))

const { revalidatePath, revalidateTag } = await import('next/cache')
const {
  criarMarcaProduto,
  atualizarMarcaProduto,
  alternarAtivoMarcaProduto,
} = await import('./actions')

beforeEach(() => {
  vi.clearAllMocks()
  assertGerenteSession.mockResolvedValue({ ok: true })
})

function expectMarcaRoutesRevalidated() {
  expect(revalidatePath).toHaveBeenCalledWith('/admin/marcas-produtos')
  expect(revalidatePath).toHaveBeenCalledWith('/admin/catalogo')
  expect(revalidateTag).toHaveBeenCalledWith('catalogo-opcoes-filtro')
}

describe('marcas-produtos/actions — revalida rotas admin (ID 122)', () => {
  it('criarMarcaProduto revalida /admin/marcas-produtos e tag do catálogo', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'marca-1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) })

    const r = await criarMarcaProduto({ nome: 'Jinlong Tools' })

    expect(r.success).toBe(true)
    expectMarcaRoutesRevalidated()
  })

  it('atualizarMarcaProduto revalida /admin/marcas-produtos e tag do catálogo', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ update })) })

    const r = await atualizarMarcaProduto({
      id: '11111111-1111-1111-1111-111111111111',
      nome: 'Novo nome',
    })

    expect(r.success).toBe(true)
    expectMarcaRoutesRevalidated()
  })

  it('alternarAtivoMarcaProduto revalida /admin/marcas-produtos e tag do catálogo', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ update })) })

    const r = await alternarAtivoMarcaProduto('11111111-1111-1111-1111-111111111111', false)

    expect(r.success).toBe(true)
    expectMarcaRoutesRevalidated()
  })
})
