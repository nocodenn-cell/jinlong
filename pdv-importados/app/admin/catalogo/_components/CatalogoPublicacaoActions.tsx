'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { inativarProduto, publicarProduto } from '@/app/gerente/produtos/actions'
import { ativoFromStatusPublicacao } from '@/core/catalog/statusPublicacao'
import type { StatusPublicacao } from '@/core/ports/produto'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'

type Props = Readonly<{
  produtoId: string
  status: StatusPublicacao
  labels: { publicar: string; inativar: string }
  erroGenerico: string
}>

export function CatalogoPublicacaoActions({ produtoId, status, labels, erroGenerico }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (action: 'publicar' | 'inativar') => {
    startTransition(async () => {
      const result =
        action === 'publicar'
          ? await publicarProduto(produtoId)
          : await inativarProduto(produtoId)
      if (result.success) {
        router.refresh()
        return
      }
      emitGerenteToast({ kind: 'error', message: result.error || erroGenerico })
    })
  }

  if (ativoFromStatusPublicacao(status)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => run('inativar')}
      >
        {labels.inativar}
      </Button>
    )
  }

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
