/**
 * N1 — guarda estática contra a reintrodução da leitura direta do custo.
 *
 * `produtos.preco_custo` / `preco_custo_medio` NÃO são legíveis por usuários autenticados (privilégio de coluna
 * revogado na migration 20261009180000): selecionar a coluna, `select('*')`, `select()` sem argumento ou embed
 * `produtos(preco_custo)` em código de aplicação falha em runtime com 42501. O custo vem da view `produtos_custos`
 * (`lib/gerente/produtos/custosProdutos.ts`) e só para GERENTE/DONO/ADMIN.
 *
 * Este teste falha no CI se alguém voltar a ler o custo pelo caminho antigo.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(__dirname, '..')
const PASTAS = ['app', 'lib', 'components', 'core', 'src']
const IGNORAR = /(node_modules|\.next|[\\/]e2e[\\/]|\.test\.|\.spec\.|database\.types\.ts$)/

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (IGNORAR.test(p)) continue
    const st = statSync(p)
    if (st.isDirectory()) arquivos(p, acc)
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(p)
  }
  return acc
}

const FONTES = PASTAS.flatMap((p) => {
  try {
    return arquivos(join(RAIZ, p))
  } catch {
    return []
  }
})

const rel = (p: string) => relative(RAIZ, p).replace(/\\/g, '/')
const linha = (s: string, i: number) => s.slice(0, i).split('\n').length

describe('N1 — nenhum código lê o custo direto de `produtos`', () => {
  it('há arquivos para varrer (a guarda não está vazia)', () => {
    expect(FONTES.length).toBeGreaterThan(100)
  })

  it("`from('produtos').select(...)` não pede preco_custo/preco_custo_medio, '*' nem vem vazio", () => {
    const violacoes: string[] = []
    for (const f of FONTES) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/from\(\s*'produtos'\s*\)/g)) {
        const seg = s.slice(m.index! + m[0].length, m.index! + m[0].length + 500)
        const primeira = seg.match(/\.(select|insert|update|upsert|delete)\(/)
        const sel = seg.match(/\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")?/)
        if (!sel) continue
        // `.update(...).select('id')` etc.: avalia o argumento do select que pertence a ESTA cadeia
        const arg = sel[1]
        if (arg === undefined && primeira?.[1] === 'select' && /\.select\(\s*\)/.test(seg)) {
          violacoes.push(`${rel(f)}:${linha(s, m.index!)} select() sem colunas (equivale a *)`)
        } else if (arg && (/\*/.test(arg) || /preco_custo/.test(arg))) {
          violacoes.push(`${rel(f)}:${linha(s, m.index!)} select(${arg.slice(0, 60)})`)
        }
      }
    }
    expect(violacoes, `Leitura direta de custo em produtos:\n${violacoes.join('\n')}`).toEqual([])
  })

  it('constantes de colunas (…COLS) usadas com `produtos` não listam o custo', () => {
    const violacoes: string[] = []
    for (const f of FONTES) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/\b([A-Z][A-Z0-9_]*(?:COLS|COLUNAS|COLUMNS))\s*=\s*(?:\n\s*)?(`[^`]*`|'[^']*'|"[^"]*")/g)) {
        if (/preco_custo/.test(m[2]) && /from\(\s*'produtos'\s*\)/.test(s)) {
          violacoes.push(`${rel(f)}:${linha(s, m.index!)} ${m[1]} lista custo`)
        }
      }
    }
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })

  it("embeds `produtos(...)` em selects não trazem custo nem '*'", () => {
    const violacoes: string[] = []
    for (const f of FONTES) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/produtos(?:!\w+)?\(([^)]*)\)/g)) {
        const antes = s.slice(Math.max(0, m.index! - 500), m.index!)
        if (!/select\(/.test(antes)) continue
        if (/preco_custo|\*/.test(m[1])) violacoes.push(`${rel(f)}:${linha(s, m.index!)} embed produtos(${m[1].slice(0, 50)})`)
      }
    }
    expect(violacoes, violacoes.join('\n')).toEqual([])
  })

  it('o custo só é lido pela view produtos_custos (helper e consulta rápida)', () => {
    const leitores = FONTES.filter((f) => /from\(\s*'produtos_custos'\s*\)/.test(readFileSync(f, 'utf8'))).map(rel).sort()
    expect(leitores).toEqual(['app/caixa/server/caixaConsultaRapida.impl.ts', 'lib/gerente/produtos/custosProdutos.ts'])
  })

  it('o PDV (app/caixa) só toca preco_custo ao consultar a view gerencial', () => {
    const semComentarios = (txt: string) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const achados: string[] = []
    for (const f of FONTES.filter((x) => rel(x).startsWith('app/caixa/'))) {
      const s = semComentarios(readFileSync(f, 'utf8'))
      for (const m of s.matchAll(/preco_custo/g)) {
        const contexto = s.slice(Math.max(0, m.index! - 400), m.index! + 120)
        if (!/produtos_custos/.test(contexto)) achados.push(`${rel(f)}:${linha(s, m.index!)}`)
      }
    }
    expect(achados, `PDV não pode ler preco_custo fora da view: ${achados.join(', ')}`).toEqual([])
  })
})
