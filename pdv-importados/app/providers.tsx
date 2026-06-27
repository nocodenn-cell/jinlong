'use client'

import { ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'

// Importa configuração do Sentry client
import '../sentry.client.config'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return <>{children}</>
}

// Wrapper com error boundary do Sentry
export const ErrorBoundary = Sentry.ErrorBoundary
