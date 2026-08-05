import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { KNOWN_RESOURCE_KEYS, normalizeResourceKey } from './adminPolicy'

/**
 * F1-08 / F6-PER-001 — nenhuma rota administrativa pode existir sem política declarada.
 *
 * Este teste é o enforcement da invariante: enumera o filesystem de `app/admin/` e falha
 * se alguma rota não tiver entrada em RESOURCE_PROFILES. Combinado com o fallback `deny`,
 * é o que impede a reincidência — uma rota nova sem política quebra o build em vez de
 * nascer silenciosamente acessível a qualquer perfil gerencial.
 *
 * Origem do defeito: `RESOURCE_PROFILES` declarava 13 de 28 rotas, e recurso não declarado
 * caía em `canAccessAdmin()` — ou seja, liberado para GERENTE/DONO/ADMIN.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../app')

/** Enumera rotas de página do App Router sob `dir`, no formato `/admin/...`. */
function listPageRoutes(dir: string, baseRoute: string): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Route groups `(grupo)` não aparecem na URL.
      const isRouteGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      // Catch-all `[...path]` não é superfície própria — é shim de redirect.
      if (entry.name.startsWith('[...')) continue
      routes.push(
        ...listPageRoutes(
          path.join(dir, entry.name),
          isRouteGroup ? baseRoute : `${baseRoute}/${entry.name}`
        )
      )
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      routes.push(baseRoute)
    }
  }
  return routes
}

const adminRoutes = listPageRoutes(path.join(APP_DIR, 'admin'), '/admin').sort()

describe('cobertura de política — rotas /admin', () => {
  it('encontra as rotas no filesystem (guarda contra teste vazio)', () => {
    // Se a enumeração quebrar, o teste passaria vacuamente. Este caso impede isso.
    expect(adminRoutes.length).toBeGreaterThanOrEqual(28)
    expect(adminRoutes).toContain('/admin')
    expect(adminRoutes).toContain('/admin/configuracoes')
    expect(adminRoutes).toContain('/admin/suspensao')
  })

  it('toda rota /admin tem política declarada em RESOURCE_PROFILES', () => {
    const declared = new Set(KNOWN_RESOURCE_KEYS)
    const semPolitica = adminRoutes.filter(
      (route) => !declared.has(normalizeResourceKey(`route:${route}`))
    )

    expect(
      semPolitica,
      `Rotas administrativas sem política declarada:\n  ${semPolitica.join('\n  ')}\n\n` +
        'Adicione cada uma em RESOURCE_PROFILES (lib/admin/policy/adminPolicy.ts).\n' +
        'Com fallback = deny, rota não declarada fica inacessível — declare o perfil correto.'
    ).toEqual([])
  })

  it('não há política declarada para rota /admin inexistente (registro morto)', () => {
    const existentes = new Set(adminRoutes.map((route) => normalizeResourceKey(`route:${route}`)))
    const orfas = KNOWN_RESOURCE_KEYS.filter(
      (key) => key.startsWith('route:/admin') && !existentes.has(key)
    )

    expect(
      orfas,
      `Políticas declaradas para rotas que não existem:\n  ${orfas.join('\n  ')}`
    ).toEqual([])
  })
})

describe('normalizeResourceKey', () => {
  it('converte segmento dinâmico UUID em [id]', () => {
    expect(
      normalizeResourceKey('route:/admin/financeiro/documento/3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    ).toBe('route:/admin/financeiro/documento/[id]')
  })

  it('converte segmento dinâmico numérico em [id]', () => {
    expect(normalizeResourceKey('route:/admin/financeiro/documento/42')).toBe(
      'route:/admin/financeiro/documento/[id]'
    )
  })

  it('colapsa /gerente/** em route:/gerente (shims de redirect)', () => {
    expect(normalizeResourceKey('route:/gerente')).toBe('route:/gerente')
    expect(normalizeResourceKey('route:/gerente/financeiro/contas-pagar')).toBe('route:/gerente')
  })

  it('não altera chaves que não são de rota', () => {
    expect(normalizeResourceKey('sensitive:financeiro')).toBe('sensitive:financeiro')
    expect(normalizeResourceKey('api:gerente:health')).toBe('api:gerente:health')
  })
})
