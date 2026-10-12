'use client'

import { useMemo } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import { PalmBarcodeScanner } from '@/components/palm/PalmBarcodeScanner'
import { PalmVendasView } from '@/components/palm/PalmVendasView'
import { usePalmVendas } from '@/app/palm/vendas/usePalmVendas'

export function PalmVendasClient({ m }: { m: Mensagens }) {
  const estado = usePalmVendas(m)
  const rotulos = useMemo(() => ({
    lendo: m.palm.camera_lendo,
    permissao: m.palm.camera_permissao,
    incompativel: m.palm.camera_incompativel,
    fechar: m.palm.camera_fechar,
  }), [m])
  return (
    <>
      <PalmVendasView {...estado} m={m} />
      <PalmBarcodeScanner aberto={estado.camera} rotulos={rotulos} onCodigo={estado.onCodigo} onFechar={estado.onFecharCamera} />
    </>
  )
}
