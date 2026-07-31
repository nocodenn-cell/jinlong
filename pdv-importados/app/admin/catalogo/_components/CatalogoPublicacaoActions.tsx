'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import {
  inativarProduto,
  publicarProduto,
  reativarProduto,
} from '@/app/gerente/produtos/actions'
import { isInativo, podePublicarProduto } from '@/core/catalog/statusPublicacao'
import type { StatusPublicacao } from '@/core/ports/produto'
import { Button } from '@/components/ui/button'
import { emitGerenteToast } from '@/lib/gerente/toast'

type Props = Readonly<{
  produtoId: string
  status: StatusPublicacao
  labels: { publicar: string; inativar: string; reativar: string }
  erroGenerico: string
}>

/**
 * Vocabulário honesto por status (decisão em
 * `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`):
 *   DRAFT     → "Publicar"  (estreia; único caso que `podePublicarProduto` libera)
 *   PUBLICADO → "Inativar"
 *   INATIVO   → "Reativar"  (retorno, não estreia)
 *
 * Antes a decisão era `ativoFromStatusPublicacao(status)`, que oferecia
 * "Publicar" para INATIVO — contra a regra declarada no core.
 */
export function CatalogoPublicacaoActions({ produtoId, status, labels, erroGenerico }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (acao: 'publicar' | 'inativar' | 'reativar') => {
    startTransition(async () => {
      const result =
        acao === 'publicar'
          ? await publicarProduto(produtoId)
          : acao === 'reativar'
            ? await reativarProduto(produtoId)
            : await inativarProduto(produtoId)
      if (result.success) {
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
        variant="secondary"
        disabled={pending}
        onClick={() => run('reativar')}
      >
        {labels.reativar}
      </Button>
    )
  }

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
