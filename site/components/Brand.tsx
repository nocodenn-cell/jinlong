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
      <Logo />
      <span className="jl-wordmark" aria-hidden="true">
        <b>Jinlong</b>
      </span>
    </Link>
  )
}

/** Logo oficial: emblema dourado 金龍 (fundo transparente; lê sobre branco e sobre fundo escuro). */
export function Logo() {
  return (
    <span className="jl-logo" aria-hidden="true">
      <picture>
        <source srcSet="/brand/jinlong-logo-64.webp 1x, /brand/jinlong-logo-128.webp 2x" type="image/webp" />
        <img src="/brand/jinlong-logo-64.png" srcSet="/brand/jinlong-logo-128.png 2x" alt="" width={40} height={40} />
      </picture>
    </span>
  )
}
