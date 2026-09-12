'use client'

import { AlertTriangle } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { ConsequenciaOperacao } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'

/**
 * Confirmação de cancelamento de ordem de compra.
 *
 * **Não pede motivo de propósito.** `ordens_compra` não tem coluna para guardar
 * justificativa, e `atualizarStatusOC` só troca o status. Um campo de texto aqui
 * seria descartado no submit — pior do que não existir, porque daria ao operador
 * a impressão de que alguém vai ler aquilo depois. Se a justificativa passar a
 * ser requisito, é decisão de negócio com coluna nova, não improviso de tela.
 *
 * O que o modal faz é o que dá para fazer com honestidade: declarar as
 * consequências antes de confirmar, no mesmo padrão de NF-e e recebimento.
 */

type Props = Readonly<{
  idioma: Idioma
  identificacao: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}>

export function CancelarOcModal({ idioma, identificacao, pending, onCancel, onConfirm }: Props) {
  const m = getMessages(idioma)
  const c = m.compras

  return (
    <DragonModal
      open
      onClose={onCancel}
      title={c.cancelar_titulo}
      subtitle={identificacao}
      icon={AlertTriangle}
      variant="danger"
      size="md"
      dismissable={!pending}
      closeLabel={m.comum.fechar}
      data-testid="cancelar-oc-modal"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {m.comum.cancelar}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? c.enviando : c.cancelar_confirmar}
          </Button>
        </>
      }
    >
      <ConsequenciaOperacao
        titulo={c.cancelar_consequencia}
        efeitos={[
          { tom: 'documento', texto: c.cancelar_efeito_ordem },
          { tom: 'estoque', texto: c.cancelar_efeito_estoque },
          { tom: 'alerta', texto: c.cancelar_efeito_irreversivel },
        ]}
      />
    </DragonModal>
  )
}
