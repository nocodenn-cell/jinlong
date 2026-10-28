import Link from 'next/link'
import { sitePath, type SiteLocale } from '@/lib/locales'

/** Marca: emblema oficial 金龍 + JINLONG / 金龙 · linha de apoio. */
export function Brand({ locale, label, tagline }: { locale: SiteLocale; label: string; tagline: string }) {
  return (
    <Link className="jl-brand" href={sitePath(locale)} aria-label={label}>
      <Logo />
      <span className="jl-wordmark" aria-hidden="true">
        <b>JINLONG</b>
        <small>
          <span lang="zh-CN">金龙</span> · {tagline}
        </small>
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
        <img src="/brand/jinlong-logo-64.png" srcSet="/brand/jinlong-logo-128.png 2x" alt="" width={44} height={44} />
      </picture>
    </span>
  )
}
