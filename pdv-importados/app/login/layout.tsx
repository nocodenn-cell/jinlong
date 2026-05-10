import React, { type ReactNode } from 'react'
import { Cinzel } from 'next/font/google'
import '@fontsource/noto-serif-sc/chinese-simplified-600.css'

const cinzel = Cinzel({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-login-cinzel',
})

/** Noto Serif SC: subset chinês + peso 600 via @fontsource (self-host em node_modules, sem Google Fonts). */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={`${cinzel.variable} min-h-0 antialiased`}>{children}</div>
}
