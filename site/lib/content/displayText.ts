import { homePt } from './home.pt'
import { homeZh } from './home.zh'
import type { HomeContent } from './types'

/**
 * Caracteres chineses por papel tipográfico. O site só baixa fonte CJK da web para estes papéis;
 * o resto do texto chinês usa a fonte do sistema (PingFang SC / Microsoft YaHei).
 *
 *  - 900 (marca):       bloco 金龙 e o ícone 中
 *  - 500 (interface):   linha-assinatura, nomes de idioma, chip bilíngue, 金龙 do CTA final
 *  - 700 (títulos zh):  h1/h2/h3 da página em chinês
 */
export type CjkWeight = 500 | 700 | 900

export const CJK_WEIGHTS: readonly CjkWeight[] = [500, 700, 900]

const CJK = /[　-〿㐀-鿿＀-￯]/g

function headingStrings(content: HomeContent): string[] {
  const { hero, benefits, screens, wholesale, languages, steps, final, niches, pains, panel, price, faq, form } = content
  return [
    hero.h1.line1,
    hero.h1.line2,
    hero.h1.emphasis,
    hero.h1.rest,
    benefits.title,
    ...benefits.items.map((item) => item.title),
    screens.title,
    screens.stock.captionTitle,
    screens.close.captionTitle,
    screens.panel.captionTitle,
    wholesale.title,
    wholesale.product,
    languages.title,
    steps.title,
    ...steps.items.map((item) => item.title),
    final.title,
    niches.title,
    ...niches.items.map((item) => item.title),
    pains.title,
    ...pains.items.map((item) => item.pain),
    panel.title,
    panel.topTitle,
    price.title,
    price.plan,
    faq.title,
    content.integrations.title,
    ...faq.items.map((item) => item.q),
    form.title,
    form.okTitle,
  ]
}

function interfaceStrings(content: HomeContent): string[] {
  const { hero, langSwitch, languages } = content
  const chip = [hero.chipFirst, hero.chipSecond].filter((part) => part.lang === 'zh-CN').map((part) => part.text)
  return [hero.signature, langSwitch.zh, langSwitch.zhShort, ...chip, '金龙', languages.title]
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
