'use client'

import type { ReactNode } from 'react'

export function AppThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>
}
