import 'server-only'
import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/navigation/routes'
import { temRecurso, type Recurso } from './planos'

type Minha = { recursos: string[] | null; legado: boolean; status: string | null } | null

/** Recursos da empresa da sessão. Função ausente (migration não aplicada) / erro ⇒ null (= tudo liberado). */
export async function recursosDaSessao(): Promise<string[] | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>
    }).rpc('fp_minha_assinatura')
    if (error || !data) return null
    return (data as NonNullable<Minha>).recursos ?? null
  } catch {
    return null
  }
}

export const ERRO_RECURSO_PLANO = 'RECURSO_NAO_INCLUSO_NO_PLANO: faça upgrade em Assinatura. / 您的方案不包含此功能'

/** Gating de server actions: null quando liberado, mensagem de erro quando o plano não inclui. */
export async function erroSeSemRecurso(recurso: Recurso): Promise<string | null> {
  return temRecurso(await recursosDaSessao(), recurso) ? null : ERRO_RECURSO_PLANO
}

/** Gating web: devolve a tela de "recurso não incluso no plano" ou null quando liberado. */
export async function bloqueioPorPlano(recurso: Recurso): Promise<React.ReactElement | null> {
  if (temRecurso(await recursosDaSessao(), recurso)) return null
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">Recurso não incluso no seu plano / 您的方案不包含此功能</h1>
      <p className="mt-2 text-sm text-gray-600">
        Faça upgrade para liberar. / 升级方案即可使用。
      </p>
      <Link href={ROUTES.admin.assinatura} className="mt-4 inline-block rounded bg-red-700 px-4 py-2 text-white">
        Ver planos / 查看方案
      </Link>
    </main>
  )
}
