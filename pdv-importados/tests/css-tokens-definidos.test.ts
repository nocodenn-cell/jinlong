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
   */
  it('nenhuma classe aplica /opacidade sobre var(--token)', () => {
    const encontrados: string[] = []
    for (const file of SOURCE_DIRS.flatMap((d) => walk(d, /\.(ts|tsx)$/))) {
      if (/\.test\.tsx?$/.test(file)) continue
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/[\w-]+-\[var\(--[\w-]+\)\]\/\d+/g)) {
        encontrados.push(`${rel(file)} → ${m[0]}`)
      }
    }
    expect([...new Set(encontrados)].sort()).toEqual([])
  })

  /**
   * Roadmap UX, Tarefa 10: as 8 ocorrências legadas viraram color-mix. Compila cada arquivo
   * com o Tailwind do projeto e exige que a classe gere a regra (antes não gerava nada).
   */
  it('as classes color-mix das antigas ocorrências geram CSS de verdade', async () => {
    const postcss = (await import('postcss')).default
    const tailwind = (await import('tailwindcss')).default
    const config = (await import('../tailwind.config.js')).default
    const CASOS: Array<[arquivo: string, classe: string, propriedade: string]> = [
      ['app/admin/dashboard/SalesTrendChart.tsx', 'bg-[color-mix(in_srgb,var(--color-warning-50)_80%,transparent)]', 'background-color'],
      ['app/admin/relatorios/_components/executive/ExecVendasCaixasPanel.tsx', 'bg-[color-mix(in_srgb,var(--color-brand-primary)_80%,transparent)]', 'background-color'],
      ['app/caixa/CaixaFechamentoFormasPanel.tsx', 'border-[color-mix(in_srgb,var(--color-danger-strong)_40%,transparent)]', 'border-color'],
      ['app/caixa/CaixaFechamentoFormasPanel.tsx', 'bg-[color-mix(in_srgb,var(--color-danger-strong)_10%,transparent)]', 'background-color'],
      ['app/caixa/CaixaPdvOperacoesMenu.tsx', 'hover:bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)]', 'background-color'],
      ['app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx', 'bg-[color-mix(in_srgb,var(--color-surface)_20%,transparent)]', 'background-color'],
      ['app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx', 'text-[color-mix(in_srgb,var(--color-warning-strong)_60%,transparent)]', 'color'],
      ['components/ui/admin-v2/DenseDataTable.tsx', 'border-[color-mix(in_srgb,var(--color-border)_60%,transparent)]', 'border-color'],
    ]
    for (const [arquivo, classe, propriedade] of CASOS) {
      const fonte = fs.readFileSync(path.join(ROOT, arquivo), 'utf8')
      expect(fonte, arquivo).toContain(classe)
      const { css } = await postcss([
        tailwind({ ...config, content: [{ raw: fonte, extension: 'tsx' }] }),
      ]).process('@tailwind utilities;', { from: undefined })
      const valor = classe.replace(/^(?:hover:)?[a-z]+-\[(.*)\]$/, '$1').replace(/_/g, ' ')
      expect(css, `${arquivo} → ${classe}`).toContain(`${propriedade}: ${valor}`)
    }
  }, 60_000)
})
