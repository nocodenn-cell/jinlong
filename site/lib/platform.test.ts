import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_ERP_URL, erpHref, getErpUrl, parseErpUrl } from './erpLinks'
import { buildErpRedirects, ERP_PATH_PATTERNS } from './erpRedirects'
import { negotiateLocale } from './negotiateLocale'
import { buildContentSecurityPolicy, buildSecurityHeaders } from './securityHeaders'

const SITE_ROOT = path.resolve(__dirname, '..')
const SOURCE_DIRS = ['app', 'components', 'lib', 'styles']
const SELF = path.resolve(__filename)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx|css|mjs)$/.test(entry.name) && full !== SELF ? [full] : []
  })
}

describe('isolamento: o site não acessa dados reais nem credenciais', () => {
  const files = [...SOURCE_DIRS.flatMap((d) => sourceFiles(path.join(SITE_ROOT, d))), path.join(SITE_ROOT, 'middleware.ts'), path.join(SITE_ROOT, 'next.config.ts')]
  const forbidden = /supabase|SERVICE_ROLE|SYNC_KEY|createClient|process\.env\.(?!NEXT_PUBLIC_|NODE_ENV|VERCEL_ENV|ERP_REDIRECT_ORIGIN)/i

  it('nenhum arquivo de código referencia Supabase, service role ou variáveis privadas', () => {
    const hits = files.filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')))
    expect(hits.map((f) => path.relative(SITE_ROOT, f))).toEqual([])
  })

  it('package.json não depende de Supabase, Sentry ou do ERP', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'package.json'), 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.filter((d) => /supabase|sentry|pdv-importados|shared-core/.test(d))).toEqual([])
  })
})

describe('links para o ERP', () => {
  it('usa o ERP atual por padrão e aceita só origens https (ou localhost)', () => {
    expect(getErpUrl({})).toBe(CURRENT_ERP_URL)
    expect(getErpUrl({ NEXT_PUBLIC_ERP_URL: 'https://app.jinlong.app/' })).toBe('https://app.jinlong.app')
    expect(parseErpUrl('http://app.jinlong.app')).toBeNull()
    expect(parseErpUrl('https://app.jinlong.app/login')).toBeNull()
    expect(parseErpUrl('javascript:alert(1)')).toBeNull()
    expect(parseErpUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(erpHref('/login', { NEXT_PUBLIC_ERP_URL: 'https://app.jinlong.app' })).toBe('https://app.jinlong.app/login')
  })
})

describe('redirecionamentos de compatibilidade', () => {
  it('ficam inertes sem ERP_REDIRECT_ORIGIN', () => {
    expect(buildErpRedirects({})).toEqual([])
    expect(buildErpRedirects({ ERP_REDIRECT_ORIGIN: 'http://evil.example' })).toEqual([])
  })

  it('cobrem login, auth, áreas do ERP e API, sempre temporários', () => {
    const redirects = buildErpRedirects({ ERP_REDIRECT_ORIGIN: 'https://app.jinlong.app' })
    expect(redirects).toHaveLength(ERP_PATH_PATTERNS.length)
    expect(redirects.every((r) => r.permanent === false)).toBe(true)
    expect(redirects.map((r) => r.source)).toEqual(
      expect.arrayContaining(['/login', '/auth/:path*', '/admin/:path*', '/caixa/:path*', '/gerente/:path*', '/api/:path*'])
    )
    expect(redirects.find((r) => r.source === '/auth/:path*')?.destination).toBe('https://app.jinlong.app/auth/:path*')
  })
})

describe('negociação de idioma na raiz', () => {
  it('cookie vence o navegador; zh só quando publicado', () => {
    expect(negotiateLocale({ cookie: 'zh', acceptLanguage: 'pt-BR', zhPublic: true })).toBe('zh-CN')
    expect(negotiateLocale({ cookie: 'pt', acceptLanguage: 'zh-CN', zhPublic: true })).toBe('pt-BR')
    expect(negotiateLocale({ cookie: undefined, acceptLanguage: 'zh-CN,zh;q=0.9', zhPublic: true })).toBe('zh-CN')
    expect(negotiateLocale({ cookie: 'zh', acceptLanguage: 'zh-CN', zhPublic: false })).toBe('pt-BR')
    expect(negotiateLocale({ cookie: undefined, acceptLanguage: null, zhPublic: true })).toBe('pt-BR')
  })
})

describe('cabeçalhos de segurança', () => {
  it('CSP de produção sem unsafe-eval, sem frames e restrita à própria origem', () => {
    const csp = buildContentSecurityPolicy(false)
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("object-src 'none'")
  })

  it('inclui nosniff, DENY e política de permissões', () => {
    const keys = buildSecurityHeaders(false).map((h) => h.key)
    expect(keys).toEqual(
      expect.arrayContaining(['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy'])
    )
  })
})
