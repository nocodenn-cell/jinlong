'use client'

import { useEffect, useState, type ReactNode } from 'react'

export function ClientOnly({ children }: Readonly<{ children: ReactNode }>) {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (!hasMounted) return null

  return <>{children}</>
}
