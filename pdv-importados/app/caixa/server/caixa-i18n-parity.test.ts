import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const CAIXA_ERR_PREFIX = 'err_srv_'

function caixaErrKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((k) => k.startsWith(CAIXA_ERR_PREFIX) || k === 'msg_codigo_lido')
}

describe('caixa i18n parity (pt/zh)', () => {
  it('chaves err_srv_* e msg_codigo_lido têm paridade PT/ZH', () => {
    const ptCaixa = getMessages('pt').caixa as Record<string, unknown>
    const zhCaixa = getMessages('zh').caixa as Record<string, unknown>
    const keys = caixaErrKeys(ptCaixa)
    const zhKeys = new Set(caixaErrKeys(zhCaixa))

    const missingInZh = keys.filter((k) => !zhKeys.has(k))
    const missingInPt = [...zhKeys].filter((k) => !keys.includes(k))

    expect(missingInZh, `faltando em zh.json: ${missingInZh.join(', ')}`).toEqual([])
    expect(missingInPt, `faltando em pt.json: ${missingInPt.join(', ')}`).toEqual([])
  })

  it('nenhuma string de caixa.* usa placeholder de chave simples {x} (caixaFmt só troca {{x}})', () => {
    const simples = /(^|[^{])\{\w+\}(?!\})/
    for (const locale of ['pt', 'zh'] as const) {
      const ofensores: string[] = []
      const walk = (o: Record<string, unknown>, prefixo: string) => {
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'string') {
            if (simples.test(v)) ofensores.push(`${prefixo}${k} = ${v}`)
          } else if (v && typeof v === 'object') {
            walk(v as Record<string, unknown>, `${prefixo}${k}.`)
          }
        }
      }
      walk(getMessages(locale).caixa as Record<string, unknown>, 'caixa.')
      expect(ofensores, `${locale}.json: ${ofensores.join(' | ')}`).toEqual([])
    }
  })

  it('chaves das parcelas do crédito têm paridade PT/ZH e os mesmos placeholders', () => {
    const chaves = [
      'aria_parcela_parcelas',
      'pdv_pgto_a_vista',
      'pdv_pgto_parcelas_n',
      'pdv_pgto_parcelas_n_ultima',
      'pdv_pgto_parcelas_n_sem_valor',
      'pdv_pgto_parcelas_resumo',
    ] as const
    const pt = getMessages('pt').caixa
    const zh = getMessages('zh').caixa
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]).sort()
    for (const k of chaves) {
      expect(typeof pt[k], `pt caixa.${k}`).toBe('string')
      expect(typeof zh[k], `zh caixa.${k}`).toBe('string')
      expect(vars(zh[k]), `placeholders de caixa.${k}`).toEqual(vars(pt[k]))
    }
    expect(vars(pt.recibo.parcelas_n)).toEqual(['n'])
    expect(vars(zh.recibo.parcelas_n)).toEqual(['n'])
  })
})
