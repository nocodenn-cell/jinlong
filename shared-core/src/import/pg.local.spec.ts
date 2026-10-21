/**
 * T-RND-03: equivalência de arredondamento entre o motor (bigint) e o PostgreSQL `numeric`.
 *
 * Executa SOMENTE contra uma instância PostgreSQL local em container Docker, indicada
 * por IMPORT_PG_LOCAL_CONTAINER. Nunca usa Supabase remoto nem o banco compartilhado
 * do Jinlong. Sem a variável, o bloco é pulado.
 *
 * Potências de 10 são construídas por multiplicação exata (`0.1^n`, `10^n` com expoente
 * inteiro), nunca por `power()` com expoente negativo, que não é exato em `numeric`.
 *
 * Achado registrado: a divisão ingênua `a / b` do PostgreSQL arredonda duas vezes
 * (20 casas e depois `round`) e diverge do HALF_UP exato do motor. A divisão com
 * `div`/`mod` não diverge.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { divide, multiplica, reescala } from './decimal'

const CONTAINER = process.env.IMPORT_PG_LOCAL_CONTAINER ?? ''

interface Caso {
  readonly id: number
  readonly a: bigint
  readonly sa: number
  readonly b: bigint
  readonly sb: number
  readonly para: number
}

/** Gerador determinístico (LCG) para casos reproduzíveis. */
function gerador(semente: number): () => number {
  let s = semente >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function casos(): Caso[] {
  const r = gerador(20260501)
  const lista: Caso[] = []
  const adiciona = (c: Omit<Caso, 'id'>) => lista.push({ id: lista.length, ...c })
  const numero = (digitos: number): bigint => {
    let v = 0n
    for (let i = 0; i < digitos; i++) v = v * 10n + BigInt(Math.floor(r() * 10))
    return r() < 0.35 ? -v : v
  }
  for (let i = 0; i < 1500; i++) {
    adiciona({
      a: numero(1 + Math.floor(r() * 16)),
      sa: [0, 2, 3, 6, 10][Math.floor(r() * 5)],
      b: BigInt(1 + Math.floor(r() * 9_999_999)),
      sb: [0, 3, 6][Math.floor(r() * 3)],
      para: [0, 2, 4, 6, 10][Math.floor(r() * 5)],
    })
  }
  // Empates de meia unidade na escala de persistência, nos dois sinais
  for (const para of [0, 2, 4, 6]) {
    adiciona({ a: 5n, sa: para + 1, b: 1n, sb: 0, para })
    adiciona({ a: -5n, sa: para + 1, b: 1n, sb: 0, para })
    adiciona({ a: 15n, sa: para + 1, b: 1n, sb: 0, para })
  }
  // Patológico: quociente logo abaixo de 0,5 (30 noves). Motor: 0.
  adiciona({ a: 499999999999999999999999999999n, sa: 0, b: 10n ** 30n, sb: 0, para: 0 })
  // Caso da Sprint 0: 3,33333 ÷ 12 com 6 casas
  adiciona({ a: 333333n, sa: 6, b: 1200n, sb: 3, para: 6 })
  return lista
}

const psql = (sql: string): string =>
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-F', '|', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  })

/** Texto do PostgreSQL → bigint na escala `para`. Sem arredondar: falha se vier mais casas. */
function paraEscala(texto: string, para: number): bigint {
  const negativo = texto.startsWith('-')
  const [inteira, fracao = ''] = (negativo ? texto.slice(1) : texto).split('.')
  if (fracao.length > para) throw new Error(`PG devolveu mais casas que ${para}: ${texto}`)
  const v = BigInt(inteira + fracao.padEnd(para, '0'))
  return negativo ? -v : v
}

const valores = (lista: Caso[]) =>
  lista.map((c) => `(${c.id}, '${c.a}'::numeric, ${c.sa}, '${c.b}'::numeric, ${c.sb}, ${c.para})`).join(',\n')

const tabela = (lista: Caso[]) => `(values\n${valores(lista)}\n) as t(id, a, sa, b, sb, para)`

/** Lê as linhas `id|valor` devolvidas pelo psql. */
function linhas(sql: string): [number, string][] {
  return psql(sql).trim().split('\n').filter(Boolean).map((l) => {
    const [id, valor] = l.split('|')
    return [Number(id), valor]
  })
}

describe.skipIf(!CONTAINER)('T-RND-03: motor × PostgreSQL numeric (instância local)', () => {
  const lista = casos()

  it('reescala: round(a × 0,1^sa, n) do PostgreSQL = motor (HALF_UP longe de zero)', () => {
    const res = linhas(`select id, round(a * (0.1::numeric ^ sa), para) from ${tabela(lista)};`)
    expect(res).toHaveLength(lista.length)
    const divergencias = res.filter(([id, pg]) => {
      const c = lista[id]
      return paraEscala(pg, c.para) !== reescala(c.a, c.sa, c.para)
    })
    expect(divergencias).toEqual([])
  })

  it('produto: round(a × b × 0,1^(sa+sb), n) do PostgreSQL = motor', () => {
    const res = linhas(`select id, round(a * b * (0.1::numeric ^ (sa + sb)), para) from ${tabela(lista)};`)
    const divergencias = res.filter(([id, pg]) => {
      const c = lista[id]
      return paraEscala(pg, c.para) !== multiplica(c.a, c.sa, c.b, c.sb, c.para)
    })
    expect(divergencias).toEqual([])
  })

  it('divisão exata com div/mod (padrão recomendado) = motor, em todos os casos', () => {
    // num = a × 10^(sb+para), den = b × 10^sa; HALF_UP exato
    const sql = `
      select id,
        case when num < 0 then -1 else 1 end *
        (div(abs(num), den) + case when 2 * mod(abs(num), den) >= den then 1 else 0 end)
      from (
        select id, a * (10::numeric ^ (sb + para)) as num, b * (10::numeric ^ sa) as den
        from ${tabela(lista)}
      ) x;`
    const res = linhas(sql)
    const divergencias = res.filter(([id, pg]) => {
      const c = lista[id]
      return BigInt(pg) !== divide(c.a, c.sa, c.b, c.sb, c.para)
    })
    expect(divergencias).toEqual([])
  })

  it('divisão ingênua a / b do PostgreSQL DIVERGE do motor (achado documentado)', () => {
    const res = linhas(`select id, round((a * (0.1::numeric ^ sa)) / (b * (0.1::numeric ^ sb)), para) from ${tabela(lista)};`)
    const divergencias = res.filter(([id, pg]) => {
      const c = lista[id]
      return paraEscala(pg, c.para) !== divide(c.a, c.sa, c.b, c.sb, c.para)
    })
    const exemplos = divergencias.slice(0, 3).map(([id, pg]) => {
      const c = lista[id]
      return `id=${id} pg=${pg} motor=${divide(c.a, c.sa, c.b, c.sb, c.para)}`
    })
    console.info(`[T-RND-03] divisão ingênua: ${divergencias.length} divergências de ${lista.length}. ${exemplos.join('; ')}`)
    expect(divergencias.length).toBeGreaterThan(0)
  })

  it('caso patológico 0,4999…9: PostgreSQL ingênuo dá 1, motor dá 0 e div/mod dá 0', () => {
    const caso = lista[lista.length - 2]
    const ingenua = psql(`select round(${caso.a}::numeric / ${caso.b}::numeric, 0);`).trim()
    expect(ingenua).toBe('1')
    expect(divide(caso.a, caso.sa, caso.b, caso.sb, caso.para)).toBe(0n)
  })
})
