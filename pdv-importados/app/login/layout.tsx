import React, { type ReactNode } from 'react'
import '@fontsource/cinzel/latin-400.css'
import '@fontsource/noto-serif-sc/chinese-simplified-600.css'

const CINZEL_VARS = { ['--font-login-cinzel' as string]: "'Cinzel'" } as React.CSSProperties

/** Noto Serif SC: subset chinês + peso 600 via @fontsource (self-host em node_modules, sem Google Fonts). */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-0 antialiased" style={CINZEL_VARS}>{children}</div>
}
