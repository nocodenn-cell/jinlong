import Link from 'next/link'
import { sitePath, type SiteLocale } from '@/lib/locales'

/** Marca provisória: bloco vermelho 金龙. A decisão de identidade corporativa está pendente. */
export function Seal({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? 'jl-seal jl-seal--sm' : 'jl-seal'} aria-hidden="true">
      <span lang="zh-CN">金龙</span>
    </span>
  )
}

export function Brand({ locale, label }: { locale: SiteLocale; label: string }) {
  return (
    <Link className="jl-brand" href={sitePath(locale)} aria-label={label}>
      <Seal />
      <span className="jl-wordmark" aria-hidden="true">
        <b>Jinlong</b>
      </span>
    </Link>
  )
}
