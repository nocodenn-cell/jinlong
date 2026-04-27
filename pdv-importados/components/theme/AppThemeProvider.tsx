'use client'

import type { ReactNode } from 'react'
import { GerenteUiThemeProvider } from '@/components/gerente/GerenteThemeContext'

export function AppThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <GerenteUiThemeProvider>{children}</GerenteUiThemeProvider>
}
