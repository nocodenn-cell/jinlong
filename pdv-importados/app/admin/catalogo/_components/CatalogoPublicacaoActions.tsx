'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { inativarProduto, publicarProduto } from '@/app/gerente/produtos/actions'
import type { StatusPublicacao } from '@/core/ports/produto'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  produtoId: string
  status: StatusPublicacao
  labels: { publicar: string; inativar: string }
}>

export function CatalogoPublicacaoActions({ produtoId, status, labels }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (action: 'publicar' | 'inativar') => {
    startTransition(async () => {
      const result =
        action === 'publicar'
          ? await publicarProduto(produtoId)
          : await inativarProduto(produtoId)
      if (result.success) router.refresh()
    })
  }

  const btnClass = cn(
    'rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50',
    pending && 'pointer-events-none opacity-50',
  )

  if (status === 'PUBLICADO') {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run('inativar')}
        className={cn(btnClass, 'border border-[#3a2020] text-red-400 hover:bg-red-500/10')}
      >
        {labels.inativar}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run('publicar')}
      className={cn(btnClass, 'border border-jl-accent/35 text-jl-accent hover:bg-jl-accent/10')}
    >
      {labels.publicar}
    </button>
  )
}
