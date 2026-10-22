/**
 * Sprint P0 — segurança das rotas /admin, /gerente e /caixa.
 *
 * Executa o `middleware` real (Next 15: `middleware.ts` na raiz do app) com o
 * Supabase mockado e cobre a matriz perfil × área × estado de sessão, além da
 * propagação dos cookies de refresh nas respostas (next e redirect).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

type Cenario =
  | 'anonimo'
  | 'logout'
  | 'expirada'
  | 'operador'
  | 'gerente'
  | 'dono'
  | 'admin'
  | 'inativo'
  | 'sem_loja'

const mockGetUser = vi.fn()
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()
const mockSingle = vi.fn()
let refreshCookies: { name: string; value: string; options?: Record<string, unknown> }[] = []

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      opts: { cookies: { setAll: (c: typeof refreshCookies) => void } },
    ) => ({
      auth: {
        getSession: mockGetSession,
        getUser: async () => {
          // Simula o refresh do @supabase/ssr: grava cookies novos via setAll.
          if (refreshCookies.length > 0) opts.cookies.setAll(refreshCookies)
          return mockGetUser()
        },
        signOut: async () => {
          opts.cookies.setAll([
            { name: 'sb-test-auth-token', value: '', options: { maxAge: 0, path: '/' } },
          ])
          return mockSignOut()
        },
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
      })),
    }),
  ),
}))

function usuario(perfil: string, extra: Record<string, unknown> = {}) {
  return { perfil, idioma_preferido: 'pt', loja_id: 'loja-1', ativo: true, ...extra }
}

function configurar(cenario: Cenario) {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
  mockSignOut.mockResolvedValue({ error: null })
  const user = { id: `${cenario}-1`, email: `${cenario}@test.local` }
  switch (cenario) {
    case 'anonimo':
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      return
    case 'logout':
      // Após signOut não há cookie: o supabase-js devolve AuthSessionMissingError.
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
      })
      return
    case 'expirada':
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found' },
      })
      return
    case 'operador':
      mockGetUser.mockResolvedValue({ data: { user }, error: null })
      mockSingle.mockResolvedValue({ data: usuario('OPERADOR'), error: null })
      return
    case 'gerente':
      mockGetUser.mockResolvedValue({ data: { user }, error: null })
      mockSingle.mockResolvedValue({ data: usuario('GERENTE'), error: null })
      return
    case 'dono':
      mockGetUser.mockResolvedValue({ data: { user }, error: null })
      mockSingle.mockResolvedValue({ data: usuario('DONO'), error: null })
      return
    case 'admin':
      mockGetUser.mockResolvedValue({ data: { user }, error: null })
      mockSingle.mockResolvedValue({ data: usuario('ADMIN'), error: null })
      return
    case 'inativo':
      mockGetUser.mockResolvedValue({ data: { user }, error: null })
      mockSingle.mockResolvedValue({ data: usuario('GERENTE', { ativo: false }), error: null })
      return
    case 'sem_loja':
      mockGetUser.mockResolvedValue({ data: { user }, error: null })
      mockSingle.mockResolvedValue({ data: usuario('OPERADOR', { loja_id: null }), error: null })
      return
  }
}

async function rodar(pathname: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  const { middleware } = await import('../middleware')
  return middleware(new NextRequest(`https://pdv.test${pathname}`))
}

function destino(res: Response): string | null {
  if (res.status < 300 || res.status >= 400) return null
  const loc = res.headers.get('location')
  if (!loc) return null
  const u = new URL(loc)
  return `${u.pathname}${u.search}`
}

const AREAS = {
  admin: '/admin/dashboard',
  gerente: '/gerente/estoque',
  caixa: '/caixa',
} as const

type Esperado = 'allow' | 'login' | '/caixa'

/** Matriz de acesso esperada: cenário → área → resultado. */
const MATRIZ: Record<Cenario, Record<keyof typeof AREAS, Esperado>> = {
  anonimo: { admin: 'login', gerente: 'login', caixa: 'login' },
  logout: { admin: 'login', gerente: 'login', caixa: 'login' },
  expirada: { admin: 'login', gerente: 'login', caixa: 'login' },
  operador: { admin: '/caixa', gerente: '/caixa', caixa: 'allow' },
  gerente: { admin: 'allow', gerente: 'allow', caixa: 'allow' },
  dono: { admin: 'allow', gerente: 'allow', caixa: 'allow' },
  // ADMIN global legado foi descontinuado: sem acesso de loja em nenhuma área.
  admin: { admin: 'login', gerente: 'login', caixa: 'login' },
  inativo: { admin: 'login', gerente: 'login', caixa: 'login' },
  sem_loja: { admin: 'login', gerente: 'login', caixa: 'login' },
}

beforeEach(() => {
  vi.clearAllMocks()
  refreshCookies = []
})

describe('P0 rotas — convenção de middleware compatível com Next 15', () => {
  it('Next instalado é 15.x: middleware.ts é o arquivo reconhecido (proxy.ts só existe no Next 16)', () => {
    const nextPkg = JSON.parse(
      fs.readFileSync(require.resolve('next/package.json', { paths: [APP_ROOT] }), 'utf8'),
    ) as { version: string }
    expect(Number(nextPkg.version.split('.')[0])).toBe(15)
    expect(fs.existsSync(path.join(APP_ROOT, 'middleware.ts'))).toBe(true)
    expect(fs.existsSync(path.join(APP_ROOT, 'proxy.ts'))).toBe(false)
    // Next resolve middleware na raiz OU em src/ — dois arquivos seriam ambíguos.
    expect(fs.existsSync(path.join(APP_ROOT, 'src', 'middleware.ts'))).toBe(false)
  })

  it('exporta `middleware` e o matcher cobre as três áreas, inclusive a raiz de cada uma', async () => {
    const mod = await import('../middleware')
    expect(typeof mod.middleware).toBe('function')
    expect(mod.config.matcher).toEqual(['/admin/:path*', '/gerente/:path*', '/caixa/:path*'])
  })
})

describe('P0 rotas — matriz perfil × área (acesso direto por URL)', () => {
  for (const [cenario, linhas] of Object.entries(MATRIZ) as [Cenario, (typeof MATRIZ)[Cenario]][]) {
    for (const [area, esperado] of Object.entries(linhas) as [keyof typeof AREAS, Esperado][]) {
      const rota = AREAS[area]
      it(`${cenario} → ${rota}: ${esperado}`, async () => {
        configurar(cenario)
        const res = await rodar(rota)
        const alvo = destino(res)
        if (esperado === 'allow') {
          expect(alvo).toBeNull()
          expect(res.headers.get('x-middleware-next')).toBe('1')
        } else if (esperado === 'login') {
          expect(alvo).toBe(`/login?next=${encodeURIComponent(rota)}`)
        } else {
          expect(alvo).toBe(esperado)
        }
      })
    }
  }

  it('raiz exata e subrotas profundas seguem a mesma regra (/admin, /gerente, /caixa/x)', async () => {
    for (const rota of ['/admin', '/gerente', '/admin/financeiro/contas', '/caixa/historico']) {
      configurar('anonimo')
      expect(destino(await rodar(rota))).toBe(`/login?next=${encodeURIComponent(rota)}`)
    }
  })

  it('perfil de caixa não entra no painel nem por subrota sensível', async () => {
    for (const rota of ['/admin/funcionarios', '/admin/provisionamento', '/gerente/financeiro/contas-pagar']) {
      configurar('operador')
      expect(destino(await rodar(rota))).toBe('/caixa')
    }
  })
})

describe('P0 rotas — cookies e sessão', () => {
  it('sessão expirada: limpa cookies (signOut) e o redirect carrega o cookie de remoção', async () => {
    configurar('expirada')
    const res = await rodar('/admin/dashboard')
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(destino(res)).toBe('/login?next=%2Fadmin%2Fdashboard')
    const limpo = res.headers.get('set-cookie') ?? ''
    expect(limpo).toContain('sb-test-auth-token=')
    expect(limpo.toLowerCase()).toContain('max-age=0')
  })

  it('refresh de sessão autorizado: cookies renovados chegam na resposta NextResponse.next', async () => {
    configurar('gerente')
    refreshCookies = [{ name: 'sb-test-auth-token', value: 'novo-token', options: { path: '/' } }]
    const res = await rodar('/gerente/estoque')
    expect(destino(res)).toBeNull()
    expect(res.headers.get('set-cookie') ?? '').toContain('sb-test-auth-token=novo-token')
  })

  it('refresh de sessão negado (operador no painel): cookies renovados são preservados no redirect', async () => {
    configurar('operador')
    refreshCookies = [{ name: 'sb-test-auth-token', value: 'novo-token', options: { path: '/' } }]
    const res = await rodar('/admin/dashboard')
    expect(destino(res)).toBe('/caixa')
    expect(res.headers.get('set-cookie') ?? '').toContain('sb-test-auth-token=novo-token')
  })

  it('falha ao ler perfil (db_error) nega acesso em vez de liberar', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'g-1' } }, error: null })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    for (const rota of Object.values(AREAS)) {
      expect(destino(await rodar(rota))).toBe(`/login?next=${encodeURIComponent(rota)}`)
    }
  })

  it('sem configuração Supabase: rotas protegidas redirecionam para login (fail-closed)', async () => {
    const { middleware } = await import('../middleware')
    const urlAnterior = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    try {
      const res = await middleware(new NextRequest('https://pdv.test/caixa'))
      expect(destino(res)).toBe('/login?next=%2Fcaixa')
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = urlAnterior
    }
  })
})

describe('P0 rotas — middleware não usa credencial privilegiada', () => {
  it('middleware e seu cliente Supabase usam somente a anon key + cookies do usuário', () => {
    const arquivos = [
      'middleware.ts',
      'lib/admin/auth/middlewareSupabase.ts',
      'lib/admin/auth/sessionConsistency.ts',
      'lib/admin/policy/adminPolicy.ts',
    ]
    for (const rel of arquivos) {
      const src = fs.readFileSync(path.join(APP_ROOT, rel), 'utf8')
      expect(src, rel).not.toMatch(/SERVICE_ROLE/)
      expect(src, rel).not.toMatch(/@\/lib\/supabase\/admin/)
    }
  })

  it('nenhum módulo client (`use client`) importa o cliente service role', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(ent.name)) {
          const src = fs.readFileSync(full, 'utf8')
          if (/^\s*['"]use client['"]/.test(src) && /@\/lib\/supabase\/admin|SERVICE_ROLE/.test(src)) {
            hits.push(path.relative(APP_ROOT, full))
          }
        }
      }
    }
    for (const d of ['app', 'components', 'hooks', 'lib', 'stores']) walk(path.join(APP_ROOT, d))
    expect(hits).toEqual([])
  })
})
