import { NextResponse, type NextRequest } from 'next/server'
import { SITE_LOCALE_COOKIE, sitePath } from '@/lib/locales'
import { negotiateLocale } from '@/lib/negotiateLocale'
import { isLocalePublic } from '@/lib/publication'

/** Apenas a raiz: envia o visitante ao idioma escolhido ou ao do navegador. */
export function middleware(req: NextRequest) {
  const locale = negotiateLocale({
    cookie: req.cookies.get(SITE_LOCALE_COOKIE)?.value,
    acceptLanguage: req.headers.get('accept-language'),
    zhPublic: isLocalePublic('zh-CN'),
  })
  const response = NextResponse.redirect(new URL(sitePath(locale), req.url), 307)
  response.headers.set('Vary', 'Accept-Language, Cookie')
  return response
}

export const config = { matcher: ['/'] }
