/**
 * Regressão: cabeçalho sticky de tabela por cima do modal "Novo funcionário".
 * Garante que a escala de z-index mantém tabelas/barras sticky abaixo de todo modal,
 * diálogo, drawer e toast — inclusive os overlays que usam classes Tailwind fixas.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

function tokens(): Record<string, number> {
  const css = readFileSync(join(ROOT, 'styles/tokens/z-index.css'), 'utf8')
  const out: Record<string, number> = {}
  for (const m of css.matchAll(/--z-([a-z-]+):\s*(-?\d+)/g)) out[m[1]] = Number(m[2])
  return out
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name)) acc.push(p)
  }
  return acc
}

/** z numérico de uma className (z-50, z-[60], z-[var(--z-modal)], z-modal). */
function zDe(cls: string, t: Record<string, number>): number | null {
  const m =
    /(?:^|\s)z-\[(\d+)\]/.exec(cls) ??
    /(?:^|\s)z-(\d+)(?:\s|$)/.exec(cls)
  if (m) return Number(m[1])
  const v = /(?:^|\s)z-\[var\(--z-([a-z-]+)(?:,\d+)?\)\]/.exec(cls) ?? /(?:^|\s)z-(modal|sticky|dropdown|fixed|popover|tooltip|toast)(?:\s|$)/.exec(cls)
  return v ? (t[v[1]] ?? null) : null
}

describe('camadas de z-index', () => {
  const t = tokens()

  it('ordem dos tokens: sticky < barras da página < dropdown < modal < popover < toast', () => {
    expect(t.raised).toBeLessThan(t.sticky)
    expect(t.sticky).toBeLessThan(20) // abaixo de AdminHubTabNav (z-20) e do header do gerente (z-30)
    expect(t.sticky).toBeLessThan(t.dropdown)
    expect(t.dropdown).toBeLessThan(t.modal)
    expect(t.modal).toBeLessThan(t.popover)
    expect(t.popover).toBeLessThan(t.tooltip)
    expect(t.tooltip).toBeLessThan(t.toast)
  })

  it('DragonModal usa o token de modal', () => {
    const src = readFileSync(join(ROOT, 'components/ui/DragonModal.tsx'), 'utf8')
    expect(src).toMatch(/fixed inset-0 z-modal/)
  })

  it('nenhum elemento sticky fica acima do modal mais baixo do app', () => {
    const arquivos = [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'app'))]
    const modais: number[] = []
    const stickies: Array<{ f: string; z: number }> = []
    for (const f of arquivos) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/['"`]([^'"`]*\b(?:fixed inset-0|sticky)\b[^'"`]*)['"`]/g)) {
        const cls = m[1]
        const z = zDe(cls, t)
        if (z == null) continue
        if (/\bfixed inset-0\b/.test(cls) && z >= t.modal) modais.push(z)
        if (/(?:^|\s)sticky(?:\s|$)/.test(cls)) stickies.push({ f: relative(ROOT, f), z })
      }
    }
    expect(modais.length).toBeGreaterThan(3)
    const menorModal = Math.min(...modais, t.modal)
    const acima = stickies.filter((s) => s.z >= menorModal)
    expect(acima).toEqual([])
  })
})
