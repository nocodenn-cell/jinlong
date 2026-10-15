/**
 * Regressão: `@view-transition { navigation: auto }` travava páginas do painel
 * em produção. Um `redirect()` streamado (ex.: `/admin/relatorios` sem `?view=`)
 * vira navegação cross-document iniciada pela página; o Chrome abria e pulava a
 * View Transition ("Transition was skipped") e o boundary de Suspense do novo
 * documento nunca era revelado — o `<main>` ficava no skeleton para sempre
 * (e2e `gerente.spec.ts` "página de relatórios exibe filtros de período").
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    if (nome === 'node_modules' || nome.startsWith('.')) return []
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return cssFiles(caminho)
    return nome.endsWith('.css') ? [caminho] : []
  })
}

/** Remove comentários para que a explicação no próprio CSS não conte como regra. */
function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('View Transitions cross-document', () => {
  it('nenhum CSS do app ativa @view-transition (travava redirect streamado)', () => {
    const arquivos = [...cssFiles(join(ROOT, 'app')), ...cssFiles(join(ROOT, 'styles'))]
    expect(arquivos.length).toBeGreaterThan(0)
    const comRegra = arquivos.filter((f) => /@view-transition\b/.test(semComentarios(readFileSync(f, 'utf8'))))
    expect(comRegra).toEqual([])
  })
})
