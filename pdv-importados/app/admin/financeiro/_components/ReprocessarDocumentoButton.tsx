'use client'

import { useRouter } from 'next/navigation'
import { ConfirmActionButton } from '@/components/gerente/ConfirmActionButton'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { reprocessarDocumentoFiscal } from '@/app/gerente/financeiro/actions'

type Props = Readonly<{
  documentoId: string
  label: string
  loadingLabel: string
  confirmMessage: string
  successMessage: string
}>

export function ReprocessarDocumentoButton({
  documentoId,
  label,
  loadingLabel,
  confirmMessage,
  successMessage,
}: Props) {
  const router = useRouter()

  const { mutate, loading } = useGerenteMutation(
    async () => {
      const r = await reprocessarDocumentoFiscal(documentoId)
      if (!r.success) throw new Error(r.error)
      router.refresh()
      return null
    },
    { successMessage },
  )

  return (
    <ConfirmActionButton
      type="button"
      disabled={loading}
      confirmMessage={confirmMessage}
      onClick={() => void mutate(null)}
      className="shrink-0 text-caption"
    >
      {loading ? loadingLabel : label}
    </ConfirmActionButton>
  )
}
