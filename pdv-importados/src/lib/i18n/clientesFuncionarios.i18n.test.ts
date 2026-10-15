import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import pt from './pt.json'
import zh from './zh.json'

const SECOES = ['clientes', 'funcionarios'] as const

describe('i18n clientes e funcionários', () => {
  it('pt e zh têm as mesmas chaves, sem duplicata no arquivo', () => {
    for (const secao of SECOES) {
      const chavesPt = Object.keys(pt[secao]).sort()
      const chavesZh = Object.keys(zh[secao]).sort()
      expect(chavesZh).toEqual(chavesPt)
      expect(chavesDuplicadas(ler(secao, 'pt.json'))).toEqual([])
      expect(chavesDuplicadas(ler(secao, 'zh.json'))).toEqual([])
    }
  })
})

function ler(secao: string, arquivo: string): string {
  const bruto = readFileSync(path.join(process.cwd(), 'src/lib/i18n', arquivo), 'utf8')
  const inicio = bruto.indexOf(`"${secao}": {`)
  const fim = bruto.indexOf('\n  },', inicio)
  return bruto.slice(inicio, fim)
}

function chavesDuplicadas(trecho: string): string[] {
  const vistas = new Map<string, number>()
  for (const match of trecho.matchAll(/^\s{4}"([^"]+)":/gm)) {
    const chave = match[1]
    vistas.set(chave, (vistas.get(chave) ?? 0) + 1)
  }
  return [...vistas.entries()].filter(([, n]) => n > 1).map(([chave]) => chave)
}
