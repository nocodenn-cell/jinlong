'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import React, { type ReactNode } from 'react'

// Server action para buscar feature flag
export async function getFeatureFlag(flagName: string): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('is_feature_enabled', {
      flag_name: flagName
    })
    
    if (error) {
      return false // Fail safe: desligado por segurança
    }
    
    return data ?? false
  } catch {
    return false // Fail safe: desligado por segurança
  }
}

// Cache simples para evitar chamadas repetidas
const featureCache = new Map<string, boolean>()
const cacheTimeout = 5 * 60 * 1000 // 5 minutos

function getCachedFlag(flagName: string): boolean | null {
  const cached = featureCache.get(flagName)
  if (cached !== undefined) {
    return cached
  }
  return null
}

function setCachedFlag(flagName: string, value: boolean): void {
  featureCache.set(flagName, value)
  
  // Limpar cache após timeout
  setTimeout(() => {
    featureCache.delete(flagName)
  }, cacheTimeout)
}

// Componente FeatureGate
interface FeatureGateProps {
  flagName: string
  children: ReactNode
  fallback?: ReactNode
  loadingComponent?: ReactNode
}

export function FeatureGate({ 
  flagName, 
  children, 
  fallback = null, 
  loadingComponent = <div className="h-4 w-20 rounded bg-white/[0.07]" aria-hidden /> 
}: FeatureGateProps) {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadFeatureFlag() {
      // Verificar cache primeiro
      const cached = getCachedFlag(flagName)
      if (cached !== null) {
        if (isMounted) {
          setIsEnabled(cached)
          setIsLoading(false)
        }
        return
      }

      try {
        setIsLoading(true)
        const enabled = await getFeatureFlag(flagName)
        
        if (isMounted) {
          setIsEnabled(enabled)
          setCachedFlag(flagName, enabled)
        }
      } catch {
        if (isMounted) {
          setIsEnabled(false) // Fail safe
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadFeatureFlag()

    return () => {
      isMounted = false
    }
  }, [flagName])

  // Loading state
  if (isLoading) {
    return <>{loadingComponent}</>
  }

  // Feature desabilitada
  if (!isEnabled) {
    return <>{fallback}</>
  }

  // Feature habilitada
  return <>{children}</>
}

// Hook para uso programático
export function useFeatureFlag(flagName: string) {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadFeatureFlag() {
      const cached = getCachedFlag(flagName)
      if (cached !== null) {
        if (isMounted) {
          setIsEnabled(cached)
          setIsLoading(false)
        }
        return
      }

      try {
        setIsLoading(true)
        const enabled = await getFeatureFlag(flagName)
        
        if (isMounted) {
          setIsEnabled(enabled)
          setCachedFlag(flagName, enabled)
        }
      } catch {
        if (isMounted) {
          setIsEnabled(false)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadFeatureFlag()

    return () => {
      isMounted = false
    }
  }, [flagName])

  return { isEnabled, isLoading }
}

// Componente de loading padrão
export function FeatureGateSkeleton({ width = 'w-20', height = 'h-4' }: { width?: string; height?: string }) {
  return (
    <div className={`${width} ${height} rounded bg-white/[0.07]`} aria-hidden />
  )
}

// Exemplos de uso:
/*
// Component wrapper
<FeatureGate flagName="importacao_xml">
  <button>Importar XML</button>
</FeatureGate>

// Com fallback
<FeatureGate 
  flagName="novo_relatorio_vendas" 
  fallback={<button>Relatório Padrão</button>}
>
  <button>Novo Relatório Avançado</button>
</FeatureGate>

// Hook programático
function MyComponent() {
  const { isEnabled, isLoading } = useFeatureFlag('etiqueta_gerente')
  
  if (isLoading) return <FeatureGateSkeleton />
  
  if (!isEnabled) return null
  
  return <div>Feature habilitada!</div>
}
*/
