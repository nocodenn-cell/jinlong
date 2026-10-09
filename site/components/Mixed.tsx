import type { ReactNode } from 'react'
import type { SiteLocale } from '@/lib/locales'

const CJK_RUN = /([　-〿㐀-鿿＀-￯]+)/
const LATIN_LABELS = ['Português (Brasil)'] as const

function splitCjk(text: string): string[] {
  return text.split(CJK_RUN).filter((part) => part !== '')
}

/** Marca com `lang` o idioma contrário ao da página, para leitores de tela e fontes. */
export function Mixed({ text, locale }: { text: string; locale: SiteLocale }): ReactNode {
  if (locale === 'pt-BR') {
    return splitCjk(text).map((part, index) =>
      CJK_RUN.test(part) ? (
        <span key={index} lang="zh-CN">
          {part}
        </span>
      ) : (
        part
      )
    )
  }
  const label = LATIN_LABELS.find((candidate) => text.includes(candidate))
  if (!label) return text
  const [before, after] = text.split(label)
  return (
    <>
      {before}
      <span lang="pt-BR">{label}</span>
      {after}
    </>
  )
}
