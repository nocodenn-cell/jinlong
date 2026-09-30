#!/usr/bin/env node
/**
 * ROUTE GUARD — frontend nunca aponta para rota /admin inexistente (404).
 *
 * Para cada rota estática de ROUTES.admin.* (pdv-importados/lib/navigation/routes.ts),
 * exige a página correspondente em pdv-importados/app/<path>/page.tsx.
 * Teria pego o 404 de /admin/estoque/importar-nfe (link sem página).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const routesFile = path.join(root, 'pdv-importados', 'lib', 'navigation', 'routes.ts')
const appDir = path.join(root, 'pdv-importados', 'app')

const text = fs.readFileSync(routesFile, 'utf8')

// Extrai o bloco `admin: { ... }` e seus valores de rota.
const adminBlock = text.match(/admin:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? ''
const adminRoutes = [...adminBlock.matchAll(/['"](\/admin[^'"]*)['"]/g)].map((m) => m[1])

const violations = []
for (const route of [...new Set(adminRoutes)]) {
  // Ignora rotas dinâmicas (não mapeáveis 1:1 para arquivo).
  if (route.includes('[') || route.includes('*')) continue
  const rel = route.replace(/^\//, '') // admin/...
  const pageTsx = path.join(appDir, rel, 'page.tsx')
  const pageTs = path.join(appDir, rel, 'page.ts')
  if (!fs.existsSync(pageTsx) && !fs.existsSync(pageTs)) {
    violations.push(`${route}: sem página (esperado app/${rel}/page.tsx) — link levaria a 404`)
  }
}

if (adminRoutes.length === 0) {
  violations.push('routes.ts: bloco admin não encontrado (parser desatualizado?)')
}

if (violations.length > 0) {
  console.error('[route-guard] FAIL — rota /admin sem página:\n')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log(`[route-guard] OK — ${adminRoutes.length} rotas /admin têm página (sem 404 estrutural)`)
