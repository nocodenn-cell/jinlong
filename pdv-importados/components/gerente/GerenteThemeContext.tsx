'use client'

import type { ReactNode } from 'react'
import type { GerenteUiTheme } from './gerenteUiTheme'

type Ctx = Readonly<{
  theme: GerenteUiTheme
  setTheme: (t: GerenteUiTheme) => void
}>

const _noop = () => {}
const _fixed: Ctx = { theme: 'noturno', setTheme: _noop }

/** @deprecated Theme is locked to 'noturno'. This provider is a no-op stub. */
export function GerenteUiThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>
}

/** @deprecated Theme is always 'noturno'. Use the fixed value directly. */
export function useGerenteUiTheme(): Ctx {
  return _fixed
}
