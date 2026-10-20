import Link from 'next/link'
import { sitePath, type SiteLocale } from '@/lib/locales'

/** Logo oficial: emblema dourado 金龍 (fundo transparente; lê sobre branco e sobre o rodapé escuro). */
export function Seal() {
  return (
    <span className="vd-logo" aria-hidden="true">
      <picture>
      <source srcSet="/brand/jinlong-logo-64.webp 1x, /brand/jinlong-logo-128.webp 2x" type="image/webp" />
      <img src="/brand/jinlong-logo-64.png" srcSet="/brand/jinlong-logo-128.png 2x" alt="" width={36} height={36} />
      </picture>
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
