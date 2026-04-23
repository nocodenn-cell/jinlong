import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dragon-login',
})

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={`${inter.className} ${inter.variable}`}>{children}</div>
}
