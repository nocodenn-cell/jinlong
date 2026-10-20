import { homePt } from './home.pt'
import { homeZh } from './home.zh'
import type { HomeContent } from './types'

/**
 * Caracteres chineses por papel tipográfico. O site só baixa fonte CJK da web para estes papéis;
 * o resto do texto chinês usa a fonte do sistema (PingFang SC / Microsoft YaHei).
 *
 *  - 900 (marca):       logo 金 e o nome 金龙
 *  - 500 (interface):   nomes de idioma e 金龙 do rodapé
 *  - 700 (títulos zh):  h1/h2/h3 da página em chinês
 */
export type CjkWeight = 500 | 700 | 900

export const CJK_WEIGHTS: readonly CjkWeight[] = [500, 700, 900]

const CJK = /[　-〿㐀-鿿＀-￯]/g

function headingStrings(content: HomeContent): string[] {
  const { hero, benefits, steps, panel, final, footer } = content
  return [
    hero.h1.line1,
    hero.h1.line2,
    benefits.title,
    ...benefits.items.map((item) => item.title),
    steps.title,
    ...steps.items.map((item) => item.title),
    panel.title,
    panel.topTitle,
    final.title,
    footer.productTitle,
    footer.companyTitle,
    footer.legalTitle,
  ]
}

function interfaceStrings(content: HomeContent): string[] {
  const { langSwitch } = content
  return [langSwitch.zh, langSwitch.zhShort, '金龙']
}

function uniqueCjk(strings: readonly string[]): string {
  const chars = new Set(strings.join('').match(CJK) ?? [])
  return [...chars].sort().join('')
}

export function cjkCharsByWeight(): Record<CjkWeight, string> {
  return {
    500: uniqueCjk([...interfaceStrings(homePt), ...interfaceStrings(homeZh)]),
    700: uniqueCjk(headingStrings(homeZh)),
    900: uniqueCjk(['金龙', '中']),
  }
}
