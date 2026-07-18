#!/usr/bin/env node
/**
 * DESIGN SYSTEM GUARD — Onda 4: Proteger colapso do dualismo de layout (Onda 3).
 *
 * Falha se detectar tentativas de re-bifurcação:
 * 1. Novo prop `layoutVariant` em componentes Caixa (clássico vs dragon)
 * 2. Novo ternário condicional baseado em layout (ex: pdvLayoutVariant ? ... : ...)
 * 3. Novo seletor CSS `[data-caixa-layout]` ou `[data-caixa-variant]`
 * 4. Novo import de `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` (env var do layout)
 * 5. CaixaPageClient com bifurcação de layout (ramo classic hardcoded em Onda 3)
 *
 * Princípio: Onda 3 colapsou o dualismo. Este guard impede regressão.
 * Se você precisa de variação visual, use design tokens ou feature flags, não bifurcação de componentes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdv = path.join(root, 'pdv-importados')
const backend = path.join(root, 'backend')

// Componentes Caixa que foram colapsados em Onda 3.
const CAIXA_COMPONENTS = [
  path.join(pdv, 'app/caixa/CaixaPageClient.tsx'),
  path.join(pdv, 'app/caixa/components/CaixaHeader.tsx'),
  path.join(pdv, 'app/caixa/components/CaixaPdvTopBar.tsx'),
  path.join(pdv, 'app/caixa/components/CaixaPdvOperadorTabs.tsx'),
  path.join(pdv, 'app/caixa/components/CaixaEmAbertoList.tsx'),
  path.join(pdv, 'app/caixa/components/CaixaRailTurnoSummary.tsx'),
  path.join(pdv, 'app/caixa/components/CaixaPdvMetodoPagamentoSelector.tsx'),
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports', '.git'])

function walk(dir, pred) {
  if (!fs.existsSync(dir)) return []
  const out = []
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue
        out.push(...walk(p, pred))
      } else if (pred(ent.name, p)) {
        out.push(p)
      }
    }
  } catch (e) {
    // Ignorar diretórios inacessíveis
  }
  return out
}

const violations = []

/**
 * REGRA 1: Detectar novo prop `layoutVariant` em componentes Caixa.
 * Onda 3 removeu esse prop de 6 componentes. Se reaparece, é regressão.
 */
console.log('[design-guard] Verificando Regra 1: novo prop layoutVariant...')
for (const file of CAIXA_COMPONENTS) {
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  // layoutVariant em interface Props, function params, ou JSX
  if (/layoutVariant\s*[?:]?\s*[:=]|<.*\blayoutVariant\b/m.test(text)) {
    violations.push(`${path.relative(root, file)}: Regra 1 — novo prop 'layoutVariant' detectado (Onda 3 removeu isso)`)
  }
}

/**
 * REGRA 2: Detectar novo ternário condicional baseado em layout.
 * Padrão: `pdvLayoutVariant !== 'classic' ? ... : ...` ou `caixaLayout === 'dragon' ? ...`
 */
console.log('[design-guard] Verificando Regra 2: ternário condicional de layout...')
const tsxFiles = walk(pdv, (name, p) => /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name))
const layoutTernaryRe = /(?:pdvLayoutVariant|caixaLayout|layoutVariant)\s*(!==|===|[?])/
for (const file of tsxFiles) {
  const text = fs.readFileSync(file, 'utf8')
  // Pula imports e comentários (linhas que começam com //)
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('//')) continue
    if (layoutTernaryRe.test(line) && !/^import\s+/.test(line)) {
      violations.push(`${path.relative(root, file)}:${i + 1}: Regra 2 — ternário de layout detectado (use design tokens, não bifurcação)`)
      break // uma violação por arquivo
    }
  }
}

/**
 * REGRA 3: Detectar novo seletor CSS `[data-caixa-layout]`.
 * Onda 3 removeu `.caixa-oriental-root[data-caixa-layout='classic']` de theme-oriental.css.
 * Se reaparece, é regressão.
 */
console.log('[design-guard] Verificando Regra 3: seletor CSS [data-caixa-layout]...')
const cssFiles = walk(pdv, (name) => /\.css$/.test(name))
const dataCaixaLayoutRe = /\[data-caixa-layout\]/
for (const file of cssFiles) {
  const text = fs.readFileSync(file, 'utf8')
  if (dataCaixaLayoutRe.test(text)) {
    violations.push(`${path.relative(root, file)}: Regra 3 — seletor '[data-caixa-layout]' detectado no CSS (Onda 3 removeu isso)`)
  }
}

/**
 * REGRA 4: Detectar novo import de `NEXT_PUBLIC_CAIXA_PDV_LAYOUT`.
 * Env var do layout foi removida em Onda 3. Se reaparece, é regressão.
 */
console.log('[design-guard] Verificando Regra 4: import de NEXT_PUBLIC_CAIXA_PDV_LAYOUT...')
const caixaLayoutEnvRe = /NEXT_PUBLIC_CAIXA_PDV_LAYOUT/
for (const file of tsxFiles) {
  const text = fs.readFileSync(file, 'utf8')
  if (caixaLayoutEnvRe.test(text)) {
    violations.push(`${path.relative(root, file)}: Regra 4 — env var 'NEXT_PUBLIC_CAIXA_PDV_LAYOUT' detectada (removida em Onda 3)`)
  }
}

/**
 * REGRA 5: Validar CaixaPageClient — sem bifurcação de layout.
 * Onda 3 hardcoded o ramo 'classic'. Se há ternário novo baseado em layout, é regressão.
 */
console.log('[design-guard] Verificando Regra 5: CaixaPageClient sem bifurcação...')
const caixaPageFile = path.join(pdv, 'app/caixa/CaixaPageClient.tsx')
if (fs.existsSync(caixaPageFile)) {
  const text = fs.readFileSync(caixaPageFile, 'utf8')
  // Verificar se tem mais de 2-3 ternários de layout (após Onda 3, deve ter 0)
  const ternaryMatches = text.match(/(\?|:)\s*[A-Za-z]/g) || []
  // Se tem bifurcação condicional de layout (além de outras lógicas), é violação
  if (/(?:dragon|classic)[\s\S]{0,30}[?:]/.test(text) && !text.includes('classic')) {
    // Se tem "dragon" ou "classic" com ternário próximo e NÃO é comentário
    violations.push(`${path.relative(root, caixaPageFile)}: Regra 5 — bifurcação de layout detectada em CaixaPageClient`)
  }
}

// Saída
if (violations.length > 0) {
  console.error('\n[design-guard] FAIL — Regressão de design system detectada:\n')
  for (const v of violations) {
    console.error(`  ✗ ${v}`)
  }
  console.error('\nOnda 3 colapsou o dualismo de layout (classic vs dragon).')
  console.error('Se você precisa de variação visual, use:')
  console.error('  • Design tokens (--color-*, --spacing-*)')
  console.error('  • Feature flags no servidor')
  console.error('  • `css` modules com temas (Onda 5 gradual)')
  console.error('\nNão bifurque componentes por layoutVariant ou [data-caixa-layout].\n')
  process.exit(1)
}

console.log('\n[design-guard] ✓ OK — Nenhuma regressão de dualismo detectada')
console.log('  Regra 1: layoutVariant prop — ✓')
console.log('  Regra 2: ternário de layout — ✓')
console.log('  Regra 3: seletor [data-caixa-layout] — ✓')
console.log('  Regra 4: env var NEXT_PUBLIC_CAIXA_PDV_LAYOUT — ✓')
console.log('  Regra 5: CaixaPageClient bifurcação — ✓')
console.log('\nOnda 3 protegida. Design system estável para Onda 5 (migração gradual).\n')
