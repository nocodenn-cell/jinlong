/**
 * Guarda de tokens do DS (roadmap UX, Tarefa 2).
 *
 * Todo `var(--token)` usado em TS/TSX precisa estar declarado em algum CSS (ou num objeto
 * de estilo/`next/font`). Um token inexistente não quebra build nem teste: o CSS só cai
 * no valor inicial. Foi assim que chips ficaram sem anel de foco (`--color-focus-ring`),
 * o texto do chip ativo perdeu o contraste da marca (`--color-brand-fg`) e listas de
 * autocomplete e barras sticky ficaram com fundo transparente.
 *
 * `--font-*` fica de fora: as famílias têm fallback declarado no próprio uso.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_IGNORE = new Set(['node_modules', '.next', 'dist', 'coverage', '.git', 'e2e'])

function walk(dir: string, ext: RegExp, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_IGNORE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, ext, acc)
    else if (ext.test(entry.name)) acc.push(full)
  }
  return acc
}

const rel = (file: string) => path.relative(ROOT, file).replace(/\\/g, '/')
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks', 'src'].map((d) => path.join(ROOT, d))
const CSS_DIRS = ['styles', 'app', 'components'].map((d) => path.join(ROOT, d))

function tokensDeclarados(): Set<string> {
  const declarados = new Set<string>()
  for (const file of CSS_DIRS.flatMap((d) => walk(d, /\.css$/))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) declarados.add(m[1])
  }
  // Objetos de estilo (`{ '--x': … }`) e `next/font` (`variable: '--x'`).
  for (const file of SOURCE_DIRS.flatMap((d) => walk(d, /\.(ts|tsx)$/))) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/['"](--[\w-]+)['"]\s*:/g)) declarados.add(m[1])
    for (const m of src.matchAll(/variable:\s*['"](--[\w-]+)['"]/g)) declarados.add(m[1])
  }
  return declarados
}

describe('tokens CSS usados no código existem', () => {
  it('nenhum var(--token) aponta para um token não declarado', () => {
    const declarados = tokensDeclarados()
    const faltando: string[] = []
    for (const file of SOURCE_DIRS.flatMap((d) => walk(d, /\.(ts|tsx)$/))) {
      if (/\.test\.tsx?$/.test(file)) continue
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/var\((--[\w-]+)/g)) {
        const token = m[1]
        if (token.startsWith('--font-') || token.startsWith('--tw-')) continue
        if (!declarados.has(token)) faltando.push(`${rel(file)} → ${token}`)
      }
    }
    expect([...new Set(faltando)].sort()).toEqual([])
  })

  /**
   * `bg-[var(--token)]/95` não gera regra nenhuma no Tailwind v3: o modificador de opacidade
   * só funciona com variáveis em canais crus, e os tokens do DS são hex. Use
   * `bg-[color-mix(in_srgb,var(--token)_95%,transparent)]`.
   * Ocorrências antigas ficam listadas até serem corrigidas — a lista só pode encolher.
   */
  it('nenhuma classe nova aplica /opacidade sobre var(--token)', () => {
    const LEGADO = new Set([
      'app/admin/dashboard/SalesTrendChart.tsx → bg-[var(--color-warning-50)]/80',
      'app/admin/relatorios/_components/executive/ExecVendasCaixasPanel.tsx → bg-[var(--color-brand-primary)]/80',
      'app/caixa/CaixaFechamentoFormasPanel.tsx → border-[var(--color-danger-strong)]/40',
      'app/caixa/CaixaFechamentoFormasPanel.tsx → bg-[var(--color-danger-strong)]/10',
      'app/caixa/CaixaPdvOperacoesMenu.tsx → bg-[var(--color-warning)]/20',
      'app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx → bg-[var(--color-surface)]/20',
      'app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx → text-[var(--color-warning-strong)]/60',
      'components/ui/admin-v2/DenseDataTable.tsx → border-[var(--color-border)]/60',
    ])
    const encontrados = new Set<string>()
    for (const file of SOURCE_DIRS.flatMap((d) => walk(d, /\.(ts|tsx)$/))) {
      if (/\.test\.tsx?$/.test(file)) continue
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/[\w-]+-\[var\(--[\w-]+\)\]\/\d+/g)) {
        encontrados.add(`${rel(file)} → ${m[0]}`)
      }
    }
    expect([...encontrados].filter((e) => !LEGADO.has(e)).sort()).toEqual([])
    // Corrigiu uma antiga? Tire-a da lista para a guarda não afrouxar.
    expect([...LEGADO].filter((e) => !encontrados.has(e)).sort()).toEqual([])
  })
})
