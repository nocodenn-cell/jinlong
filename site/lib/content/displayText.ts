import { homePt } from './home.pt'
import { homeZh } from './home.zh'
import type { HomeContent } from './types'

/**
 * Caracteres chineses por papel tipográfico. O site só baixa fonte CJK da web para estes papéis;
 * o resto do texto chinês usa a fonte do sistema (PingFang SC / Microsoft YaHei).
 *
 *  - 900 (marca):       金龙 e o 龍 decorativo
 *  - 500 (interface):   seletor de idioma, linha bilíngue e trilho de palavras
 *  - 700 (títulos zh):  h1/h2/h3 da página em chinês
 */
export type CjkWeight = 500 | 700 | 900

export const CJK_WEIGHTS: readonly CjkWeight[] = [500, 700, 900]

const CJK = /[　-〿㐀-鿿＀-￯]/g

function headingStrings(content: HomeContent): string[] {
  const { hero, statement, commandCenter, difference, wholesale, process, faq, final, form } = content
  return [
    ...Object.values(hero.h1),
    statement.title,
    statement.emphasis,
    statement.problemsTitle,
    ...statement.problems.map((item) => item.title),
    statement.audienceTitle,
    commandCenter.title,
    commandCenter.emphasis,
    ...Object.values(commandCenter.scenes).flatMap((scene) => [scene.title, scene.insightTitle]),
    ...difference.title,
    difference.emphasis,
    wholesale.title,
    wholesale.emphasis,
    process.title,
    process.emphasis,
    ...process.steps.map((item) => item.title),
    faq.title,
    final.title,
    final.emphasis,
    form.title,
    form.okTitle,
  ]
}

function interfaceStrings(content: HomeContent): string[] {
  const { langSwitch, statement, difference } = content
  return [langSwitch.zh, langSwitch.zhShort, ...statement.railZh, difference.artZh, '简体中文']
}

function uniqueCjk(strings: readonly string[]): string {
  const chars = new Set(strings.join('').match(CJK) ?? [])
  return [...chars].sort().join('')
}

export function cjkCharsByWeight(): Record<CjkWeight, string> {
  return {
    500: uniqueCjk([...interfaceStrings(homePt), ...interfaceStrings(homeZh)]),
    700: uniqueCjk(headingStrings(homeZh)),
    900: uniqueCjk(['金龙', '龍', '金']),
  }
}
