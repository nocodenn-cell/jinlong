import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ADMIN_AUTH_PIPELINE = 'middleware -> layout -> shell -> page' as const

const ADMIN_ROUTES = ['/admin/dashboard', '/admin/catalogo', '/admin/vendas'] as const

type AuthScenario = 'anonymous' | 'valid' | 'expired' | 'operator'

type PipelineOutcome =
  | { ok: true; stage: 'page' }
  | { ok: false; stage: 'middleware' | 'layout'; redirectTo: string }

function makeAdminSession() {
  return {
    userId: 'mgr-1',
    user: { id: 'mgr-1', email: 'gerente@test.local' },
    perfil: 'GERENTE' as const,
    idioma: 'pt' as const,
    lojaId: 'loja-1',
  }
}

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://pdv.test${pathname}`)
}

function redirectUrl(response: Response): string | null {
  if (response.status < 300 || response.status >= 400) return null
  return response.headers.get('location')
}

// --- middleware simulation ---------------------------------------------------

const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockSingle = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  })),
}))

async function runMiddleware(pathname: string): Promise<Response> {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  const { middleware } = await import('../middleware')
  return middleware(makeRequest(pathname))
}

function configureAuthScenario(scenario: AuthScenario) {
  mockSignOut.mockResolvedValue({ error: null })

  switch (scenario) {
    case 'anonymous':
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      break
    case 'valid':
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'mgr-1', email: 'g@test.local' } },
        error: null,
      })
      mockSingle.mockResolvedValue({
        data: { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-1' },
        error: null,
      })
      break
    case 'expired':
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'refresh token not found' },
      })
      break
    case 'operator':
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'op-1', email: 'o@test.local' } },
        error: null,
      })
      mockSingle.mockResolvedValue({
        data: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: 'loja-1' },
        error: null,
      })
      break
  }
}

// --- layout gate simulation --------------------------------------------------

const mockResolveAdminSession = vi.fn()
const redirectCalls: string[] = []

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url)
    const err = new Error('NEXT_REDIRECT')
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  },
}))

vi.mock('@/lib/admin/auth/resolveAdminSession', () => ({
  resolveAdminSession: (...args: unknown[]) => mockResolveAdminSession(...args),
}))

vi.mock('@/components/ui/admin-v2', () => ({
  AdminV2Shell: ({ children }: { children: unknown }) => children,
}))

async function runLayoutGate(): Promise<PipelineOutcome> {
  const AdminLayout = (await import('../app/admin/layout')).default
  try {
    await AdminLayout({ children: null })
    return { ok: true, stage: 'page' }
  } catch (error) {
    const digest = (error as Error & { digest?: string }).digest ?? ''
    if (digest.startsWith('NEXT_REDIRECT;')) {
      return {
        ok: false,
        stage: 'layout',
        redirectTo: digest.replace('NEXT_REDIRECT;', ''),
      }
    }
    throw error
  }
}

async function simulateAdminPipeline(
  pathname: string,
  scenario: AuthScenario
): Promise<PipelineOutcome> {
  configureAuthScenario(scenario)

  const mw = await runMiddleware(pathname)
  const mwRedirect = redirectUrl(mw)
  if (mwRedirect) {
    return { ok: false, stage: 'middleware', redirectTo: mwRedirect }
  }

  if (scenario === 'valid') {
    mockResolveAdminSession.mockResolvedValue(makeAdminSession())
  } else if (scenario === 'expired' || scenario === 'anonymous' || scenario === 'operator') {
    mockResolveAdminSession.mockResolvedValue(null)
  }

  return runLayoutGate()
}

// --- structural scan helpers -------------------------------------------------

const SCAN_IGNORE = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_IGNORE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, acc)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

function usesNextCookies(source: string): boolean {
  return (
    /from\s+['"]next\/headers['"]/.test(source) &&
    /\bcookies\s*\(/.test(source)
  )
}

function usesAuthRedirect(source: string): boolean {
  return /\bredirect\s*\(\s*['"`][^'"`]*\/login/.test(source)
}

// =============================================================================

describe('admin auth resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectCalls.length = 0
    mockResolveAdminSession.mockReset()
  })

  describe('cenários obrigatórios', () => {
    it('acesso sem sessão → redirect /login (middleware)', async () => {
      configureAuthScenario('anonymous')
      const res = await runMiddleware('/admin/dashboard')
      const location = redirectUrl(res)
      expect(location).toBeTruthy()
      expect(location).toContain('/login')
      expect(location).toContain('next=%2Fadmin%2Fdashboard')
    })

    it('sessão válida → acesso liberado no pipeline completo', async () => {
      const outcome = await simulateAdminPipeline('/admin/dashboard', 'valid')
      expect(outcome).toEqual({ ok: true, stage: 'page' })
    })

    it('sessão expirada → fallback correto sem loop de redirect', async () => {
      const pipeline = await simulateAdminPipeline('/admin/dashboard', 'expired')
      expect(pipeline.ok).toBe(false)
      if (!pipeline.ok) {
        expect(pipeline.stage).toBe('middleware')
        expect(pipeline.redirectTo).toContain('/login')
      }
      expect(mockSignOut).toHaveBeenCalled()

      mockResolveAdminSession.mockResolvedValue(null)
      const layout = await runLayoutGate()
      expect(layout.ok).toBe(false)
      if (!layout.ok) {
        expect(layout.redirectTo).toBe('/login?next=/admin')
      }

      const layoutAgain = await runLayoutGate()
      expect(layoutAgain.ok).toBe(false)
      if (!layoutAgain.ok) {
        expect(layoutAgain.redirectTo).toBe('/login?next=/admin')
      }
      expect(redirectCalls).toEqual(['/login?next=/admin', '/login?next=/admin'])
    })

    it('5 refresh consecutivos em /admin/dashboard produzem resultado estável', async () => {
      const results: PipelineOutcome[] = []
      for (let i = 0; i < 5; i++) {
        results.push(await simulateAdminPipeline('/admin/dashboard', 'valid'))
      }
      expect(results.every((r) => r.ok && r.stage === 'page')).toBe(true)
      expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1)
    })

    it('navegação rápida entre dashboard, catálogo e vendas', async () => {
      for (const route of ADMIN_ROUTES) {
        const outcome = await simulateAdminPipeline(route, 'valid')
        expect(outcome, `falha em ${route}`).toEqual({ ok: true, stage: 'page' })
      }

      const sequence = [...ADMIN_ROUTES, ...ADMIN_ROUTES]
      const rapid = await Promise.all(
        sequence.map((route) => simulateAdminPipeline(route, 'valid'))
      )
      expect(rapid.every((r) => r.ok)).toBe(true)
    })

    it('perfil operador no middleware não entra no admin', async () => {
      configureAuthScenario('operator')
      const res = await runMiddleware('/admin/vendas')
      const location = redirectUrl(res)
      expect(location).toContain('/caixa')
    })
  })

  describe('guard de regressão estrutural', () => {
    const cookiesAllowlist = new Set([
      'middleware.ts',
      'lib/admin/auth/middlewareSupabase.ts',
      'lib/supabase/server.ts',
      'lib/admin/auth/sessionConsistency.ts',
    ])

    const redirectAllowlist = new Set(['middleware.ts', 'app/admin/layout.tsx'])

    it('falha se cookies() aparecer fora do resolver admin', () => {
      const offenders: string[] = []
      const adminSurface = walkTsFiles(path.join(ROOT, 'app', 'admin')).concat(
        walkTsFiles(path.join(ROOT, 'lib', 'admin'))
      )
      adminSurface.push(path.join(ROOT, 'middleware.ts'))
      adminSurface.push(path.join(ROOT, 'lib', 'supabase', 'server.ts'))

      for (const file of adminSurface) {
        const source = fs.readFileSync(file, 'utf8')
        if (!usesNextCookies(source)) continue
        const r = rel(file)
        if (!cookiesAllowlist.has(r)) offenders.push(r)
      }

      expect(
        offenders,
        `cookies() fora do resolver: ${offenders.join(', ')}`
      ).toEqual([])
    })

    it('falha se redirect de auth aparecer fora de middleware.ts e app/admin/layout.tsx', () => {
      const offenders: string[] = []
      const scanRoots = [
        path.join(ROOT, 'app', 'admin'),
        path.join(ROOT, 'lib', 'admin'),
        path.join(ROOT, 'middleware.ts'),
      ]

      for (const root of scanRoots) {
        const files = fs.statSync(root).isDirectory() ? walkTsFiles(root) : [root]
        for (const file of files) {
          const source = fs.readFileSync(file, 'utf8')
          if (!usesAuthRedirect(source)) continue
          const r = rel(file)
          if (!redirectAllowlist.has(r)) offenders.push(r)
        }
      }

      expect(
        offenders,
        `redirect de auth fora do gate: ${offenders.join(', ')}`
      ).toEqual([])
    })
  })

  describe('invariantes de autoridade (convergência)', () => {
    it('middleware é thin adapter — sem lógica de role/rota/permissão inline', () => {
      const middlewareSrc = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf8')
      expect(middlewareSrc).toMatch(/export\s+async\s+function\s+middleware/)
      expect(middlewareSrc).toContain('fetchRawSession')
      expect(middlewareSrc).toContain('normalizeAdminSession')
      expect(middlewareSrc).toContain('middlewareAdminDecision')
      expect(middlewareSrc).toMatch(/decision\.type\s*===\s*['"]redirect['"]/)
      expect(middlewareSrc).toMatch(/decision\.target/)
      expect(middlewareSrc).not.toMatch(
        /isPainelWeb|isProtectedPath|isProtectedRoute|PREFIXOS_ROTAS_PAINEL_WEB|canAccessAdmin|layoutAdminDecision|isPerfilPainelGerencial/
      )
      expect(middlewareSrc).not.toMatch(/url\.pathname\s*=\s*['"]\/caixa|url\.pathname\s*=\s*['"]\/gerente/)
    })

    it('layout não contém decisão de permissão independente', () => {
      const layoutSrc = fs.readFileSync(path.join(ROOT, 'app', 'admin', 'layout.tsx'), 'utf8')
      expect(layoutSrc).toContain('AdminSession')
      expect(layoutSrc).toMatch(/if\s*\(\s*!session\s*\)/)
      expect(layoutSrc).not.toMatch(/layoutAdminDecision|canAccessAdmin|middlewareAdminDecision|isPerfilPainelGerencial/)
      expect(layoutSrc).not.toMatch(/@\/lib\/admin\/policy/)
    })

    it('/gerente/** convergiu para assertGerenteSession (sem auth legacy)', () => {
      const gerenteRoot = path.join(ROOT, 'app', 'gerente')
      const legacyAuth: string[] = []
      for (const file of walkTsFiles(gerenteRoot)) {
        const source = fs.readFileSync(file, 'utf8')
        if (/\.(test|spec)\.(ts|tsx)$/.test(file)) continue
        if (source.includes('assertGerenteOuDono') || source.includes('getUsuarioAtual')) {
          legacyAuth.push(rel(file))
        }
      }
      expect(legacyAuth, `auth legacy em gerente: ${legacyAuth.join(', ')}`).toEqual([])
    })

    it('SessionIdleLogout não influencia autorização SSR', () => {
      const idleSrc = fs.readFileSync(
        path.join(ROOT, 'components', 'security', 'SessionIdleLogout.tsx'),
        'utf8'
      )
      expect(idleSrc).not.toMatch(/@\/lib\/admin\/|resolveAdminSession|middlewareAdminDecision|canAccessAdmin/)
      expect(idleSrc).toContain('performClientLogout')
    })

    it('adminPipeline === middleware -> layout -> shell -> page', () => {
      expect(ADMIN_AUTH_PIPELINE).toBe('middleware -> layout -> shell -> page')

      const layoutSrc = fs.readFileSync(path.join(ROOT, 'app', 'admin', 'layout.tsx'), 'utf8')
      expect(layoutSrc).toContain("export const dynamic = 'force-dynamic'")
      expect(layoutSrc).toMatch(/resolveAdminSession|getCachedAdminSession/)
      const consistencySrc = fs.readFileSync(
        path.join(ROOT, 'lib', 'admin', 'auth', 'sessionConsistency.ts'),
        'utf8'
      )
      expect(consistencySrc).toContain('fetchRawSession')
      expect(consistencySrc).toContain('export function normalizeAdminSession')
      expect(consistencySrc).toContain("normalizeAdminSession(raw, 'ssr').session")
      expect(
        fs.readFileSync(path.join(ROOT, 'lib', 'admin', 'policy', 'adminPolicy.ts'), 'utf8')
      ).not.toContain('fetchRawSession')
      expect(layoutSrc).toContain('AdminV2Shell')

      const shellSrc = fs.readFileSync(
        path.join(ROOT, 'components', 'ui', 'admin-v2', 'AdminV2Shell.tsx'),
        'utf8'
      )
      expect(shellSrc).not.toMatch(/\bredirect\s*\(/)
      expect(shellSrc).not.toMatch(/\bcookies\s*\(/)

      const dashboardSrc = fs.readFileSync(
        path.join(ROOT, 'app', 'admin', 'dashboard', 'page.tsx'),
        'utf8'
      )
      expect(dashboardSrc).toContain('loadAdminContext')
      expect(dashboardSrc).not.toMatch(/\bredirect\s*\(\s*['"`][^'"`]*\/login/)
    })
  })
})
