'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ToggleLeft } from 'lucide-react'
import {
  inativarProduto,
  publicarProduto,
  reativarProduto,
} from '@/app/gerente/produtos/actions'
import { isInativo, podePublicarProduto } from '@/core/catalog/statusPublicacao'
import type { StatusPublicacao } from '@/core/ports/produto'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { emitGerenteToast } from '@/lib/gerente/toast'

type Props = Readonly<{
  produtoId: string
  produtoNome: string
  status: StatusPublicacao
  labels: {
    publicar: string
    inativar: string
    reativar: string
    confirmarTitulo: string
    confirmarTexto: string
    confirmar: string
    cancelar: string
    fechar: string
  }
  erroGenerico: string
}>

/**
 * Vocabulário honesto por status (decisão em
 * `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`):
 *   DRAFT     → "Publicar"  (estreia; único caso que `podePublicarProduto` libera)
 *   PUBLICADO → ícone Inativar + confirmação
 *   INATIVO   → "Reativar"  (retorno, não estreia)
 */
export function CatalogoPublicacaoActions({
  produtoId,
  produtoNome,
  status,
  labels,
  erroGenerico,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const run = (acao: 'publicar' | 'inativar' | 'reativar') => {
    startTransition(async () => {
      const result =
        acao === 'publicar'
          ? await publicarProduto(produtoId)
          : acao === 'reativar'
            ? await reativarProduto(produtoId)
            : await inativarProduto(produtoId)
      if (result.success) {
        setConfirmOpen(false)
        router.refresh()
        return
      }
      emitGerenteToast({ kind: 'error', message: result.error || erroGenerico })
    })
  }

  if (podePublicarProduto(status)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => run('publicar')}
      >
        {labels.publicar}
      </Button>
    )
  }

  if (isInativo(status)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run('reativar')}
      >
        {labels.reativar}
      </Button>
    )
  }

  const confirmTexto = labels.confirmarTexto.replace('{{nome}}', produtoNome)

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={pending}
        aria-label={labels.inativar}
        title={labels.inativar}
        onClick={() => setConfirmOpen(true)}
      >
        <ToggleLeft size={13} aria-hidden />
      </Button>
      <DragonModal
        open={confirmOpen}
        onClose={() => {
          if (!pending) setConfirmOpen(false)
        }}
        variant="danger"
        size="sm"
        title={labels.confirmarTitulo}
        dismissable={!pending}
        closeLabel={labels.fechar}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              {labels.cancelar}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              loading={pending}
              onClick={() => run('inativar')}
            >
              {labels.confirmar}
            </Button>
          </>
        }
      >
        <p className="text-body text-fg-muted">{confirmTexto}</p>
      </DragonModal>
    </>
  )
}
