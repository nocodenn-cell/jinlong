/**
 * Regressão: chaves do invoke() devem bater com os parâmetros dos comandos Tauri.
 * No Tauri 2, sem `rename_all = "snake_case"`, os nomes Rust são esperados em camelCase.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

function comandosRust(): Map<string, Set<string>> {
  const src = readFileSync(join(root, 'src-tauri', 'src', 'main.rs'), 'utf8')
  const out = new Map<string, Set<string>>()
  const re = /#\[tauri::command(\(([^)]*)\))?\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g
  for (const m of src.matchAll(re)) {
    const snake = /rename_all\s*=\s*"snake_case"/.test(m[2] ?? '')
    const params = m[4]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split(':')[0].trim().replace(/^mut\s+/, ''))
      .filter((n) => n && !/^(app|_app|window|state)$/.test(n))
    out.set(m[3], new Set(params.map((n) => (snake ? n : camel(n)))))
  }
  return out
}

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return arquivosTs(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

/** chaves de primeiro nível de um literal de objeto (ignora aninhados). */
function chavesTopo(obj: string): string[] {
  const keys: string[] = []
  let depth = 0
  let tok = ''
  for (const ch of obj.slice(1, -1) + ',') {
    if ('{[('.includes(ch)) depth++
    if ('}])'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      const k = tok.trim().match(/^([A-Za-z_$][\w$]*)/)
      if (k && !tok.trim().startsWith('...')) keys.push(k[1])
      tok = ''
    } else tok += ch
  }
  return keys
}

describe('invoke() x comandos Tauri', () => {
  const cmds = comandosRust()
  const chamadas: { arq: string; cmd: string; keys: string[] }[] = []
  for (const arq of arquivosTs(join(root, 'src'))) {
    const src = readFileSync(arq, 'utf8')
    for (const m of src.matchAll(/invoke(?:<[^>]*>)?\(\s*'(\w+)'\s*(,\s*\{)?/g)) {
      let keys: string[] = []
      if (m[2]) {
        const start = m.index! + m[0].length - 1
        let d = 0
        let end = start
        for (; end < src.length; end++) {
          if (src[end] === '{') d++
          else if (src[end] === '}' && --d === 0) break
        }
        keys = chavesTopo(src.slice(start, end + 1))
      }
      chamadas.push({ arq, cmd: m[1], keys })
    }
  }

  it('encontra chamadas e comandos', () => {
    expect(cmds.size).toBeGreaterThan(10)
    expect(chamadas.length).toBeGreaterThan(10)
  })

  it.each(chamadas.map((c) => [c.cmd, c.keys.join(','), c] as const))('%s {%s}', (_c, _k, c) => {
    const esperado = cmds.get(c.cmd)
    expect(esperado, `comando ${c.cmd} não registrado em main.rs`).toBeDefined()
    for (const k of c.keys) expect([...esperado!], `${c.cmd}: chave "${k}"`).toContain(k)
  })
})
