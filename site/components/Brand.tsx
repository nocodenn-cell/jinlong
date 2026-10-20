import Link from 'next/link'
import { sitePath, type SiteLocale } from '@/lib/locales'

/** Logo: quadrado verde arredondado (mesma forma do Venddi) com o 金 da marca Jinlong. */
export function Seal() {
  return (
    <span className="vd-logo" aria-hidden="true">
      <span lang="zh-CN">金</span>
    </span>
  )
}

export function Brand({ locale, label }: { locale: SiteLocale; label: string }) {
  return (
    <Link className="jl-brand" href={sitePath(locale)} aria-label={label}>
      <Seal />
      <span className="vd-wordmark" aria-hidden="true">
        Jinlong
      </span>
    </Link>
  )
}
