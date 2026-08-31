/**
 * Regressão visual SSOT — IDs 221 (hover ícones) e 222 (seleção de texto).
 * Garante que as regras canônicas não voltem ao anti-padrão light-theme.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

describe('ID 222 — seleção de texto legível', () => {
  it('layout não aplica selection:text-success-foreground (branco ilegível no light)', () => {
    const layout = read('app/layout.tsx')
    expect(layout).not.toMatch(/selection:text-success-foreground/)
    expect(layout).not.toMatch(/selection:bg-success/)
  })

  it('globals define ::selection com brand wash + color-fg', () => {
    const css = read('app/globals.css')
    expect(css).toMatch(/::selection\s*\{/)
    expect(css).toMatch(/color:\s*var\(--color-fg\)/)
    expect(css).toMatch(/color-mix\(in srgb,\s*var\(--color-brand\)/)
  })
})

describe('ID 221 — hover não esconde ícones/ações no tema claro', () => {
  it('dragon-light força gerente-row-actions opacity: 1', () => {
    const css = read('styles/theme-oriental.css')
    expect(css).toMatch(
      /\[data-gerente-ui-theme='dragon-light'\]\s*\.gerente-row-actions\s*\{\s*opacity:\s*1;/,
    )
  })

  it('dragon-light sobrescreve hover de linha table-dragon (não usa branco 3.5%)', () => {
    const css = read('styles/theme-oriental.css')
    expect(css).toMatch(
      /\[data-gerente-ui-theme='dragon-light'\]\s*\.gerente-table-dragon tbody tr:hover/,
    )
    const lightBlock = css.slice(
      css.indexOf("[data-gerente-ui-theme='dragon-light'] .gerente-table-dragon tbody tr:hover"),
    )
    expect(lightBlock.slice(0, 200)).not.toMatch(/255,\s*255,\s*255,\s*0\.035/)
  })
})
