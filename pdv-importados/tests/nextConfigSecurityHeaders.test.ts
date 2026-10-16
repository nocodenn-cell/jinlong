import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

type HeaderRule = { source: string; headers: { key: string; value: string }[] }

describe('next.config.js — cabeçalhos de segurança', () => {
  it('aplica X-Frame-Options, nosniff e Referrer-Policy em todas as rotas', async () => {
    const config = require('../next.config.js') as { headers?: () => Promise<HeaderRule[]> }
    expect(typeof config.headers).toBe('function')

    const rules = await config.headers!()
    const global = rules.find((r) => r.source === '/:path*')
    expect(global).toBeDefined()

    const byKey = Object.fromEntries(global!.headers.map((h) => [h.key, h.value]))
    // SAMEORIGIN, não DENY: o iframe oculto de impressão (lib/print/imprimirNoIframe.ts) é same-origin.
    expect(byKey['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(byKey['X-Content-Type-Options']).toBe('nosniff')
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })
})
