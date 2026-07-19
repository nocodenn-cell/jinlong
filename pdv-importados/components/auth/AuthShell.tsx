import type { ReactNode } from 'react'
import type { AppLocale } from '@shared-core/src/i18n'

type Props = {
  locale?: AppLocale
  brandSubtitle: string
  children: ReactNode
}

/** Shell visual compartilhado das telas de auth (login / senha). */
export function AuthShell({ locale, brandSubtitle, children }: Props) {
  return (
    <div
      data-theme="login"
      className="login-premium-root flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-10 sm:py-14"
      data-locale={locale}
    >
      <div className="flex w-full max-w-[380px] flex-col items-center">
        <div className="login-premium-art-wrap mb-2 w-full">
          <div className="login-premium-dragon-frame">
            <div className="login-premium-dragon-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/brand-double-dragon.png"
                alt=""
                width={240}
                height={240}
                className="login-premium-dragon-img mx-auto block"
                draggable={false}
              />
            </div>
            <div className="login-premium-vignette" aria-hidden />
          </div>
        </div>
        <h1 className="login-premium-wordmark mb-8 text-center text-2xl">
          <span className="login-premium-wordmark-han">{brandSubtitle}</span>
          <span className="mx-2 text-[#bfa76a]/45" aria-hidden>
            |
          </span>
          <span>Jīn Lóng</span>
        </h1>
        <div className="login-premium-form-block w-full">{children}</div>
      </div>
    </div>
  )
}
