'use client'

import { useCallback, useContext } from 'react'
import { AdminV2SessionContext } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { traduzir, type ExecT } from '@/lib/i18n/execTexts'

export { EXEC_TEXTS, traduzir, type ExecT, type ExecTextKey } from '@/lib/i18n/execTexts'

/** Tradutor dos painéis executivos; sem provider (testes) usa PT. */
export function useExecT(): ExecT {
  const ctx = useContext(AdminV2SessionContext)
  const idioma: 'pt' | 'zh' = ctx && ctx.idioma !== 'pt' ? 'zh' : 'pt'
  return useCallback((key, params) => traduzir(idioma, key, params), [idioma])
}
