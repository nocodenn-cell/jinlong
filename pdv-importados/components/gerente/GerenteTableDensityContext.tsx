'use client'

import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type GerenteTableDensity = 'compact' | 'comfort'

const STORAGE_KEY = 'fastproduct.gerente.tableDensity'

const DensityContext = createContext<{
  density: GerenteTableDensity
  setDensity: (d: GerenteTableDensity) => void
} | null>(null)

function readStored(): GerenteTableDensity {
  if (typeof window === 'undefined') return 'comfort'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'compact' ? 'compact' : 'comfort'
  } catch {
    return 'comfort'
  }
}

export function GerenteTableDensityProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [density, setDensityState] = useState<GerenteTableDensity>('comfort')

  useEffect(() => {
    setDensityState(readStored())
  }, [])

  const setDensity = useCallback((d: GerenteTableDensity) => {
    setDensityState(d)
    try {
      window.localStorage.setItem(STORAGE_KEY, d)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity])

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}

export function useGerenteTableDensity(): GerenteTableDensity {
  const ctx = useContext(DensityContext)
  return ctx?.density ?? 'comfort'
}

export function useGerenteTableDensityControls() {
  const ctx = useContext(DensityContext)
  if (!ctx) {
    return {
      density: 'comfort' as const,
      setDensity: () => undefined,
    }
  }
  return ctx
}
