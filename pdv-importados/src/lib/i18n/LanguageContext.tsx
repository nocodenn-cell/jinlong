'use client'

import { createContext, useContext, ReactNode, useState } from 'react'
import type { Idioma } from '../idioma/normalizeIdioma'

interface LanguageContextType {
  idioma: Idioma
  setIdioma: (idioma: Idioma) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>('pt')

  return (
    <LanguageContext.Provider value={{ idioma, setIdioma }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
