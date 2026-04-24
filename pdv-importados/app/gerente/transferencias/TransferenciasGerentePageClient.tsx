'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { executarTransferencia } from './actions'

export type TransferenciaLojaRow = { id: string; nome: string; codigo: string }
export type TransferenciaProdutoOpt = { id: string; nome: string }

type Props = Readonly<{
  idioma: Idioma
  lojas: TransferenciaLojaRow[]
  produtos: TransferenciaProdutoOpt[]
}>

export function TransferenciasGerentePageClient({ idioma, lojas, produtos }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])

  const { mutate, loading } = useGerenteMutation(
    async (p: {
      loja_origem_id: string
      loja_destino_id: string
      produto_id: string
      quantidade: number
      observacao: string
    }) => {
      const r = await executarTransferencia({
        loja_origem_id: p.loja_origem_id,
        loja_destino_id: p.loja_destino_id,
        produto_id: p.produto_id,
        quantidade: p.quantidade,
        observacao: p.observacao || undefined,
      })
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Transferência concluída.' },
  )

  const podeTransferir = lojas.length >= 2

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
      <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
        ← {m.gerente.inicio}
      </Link>
      <h1 className="gerente-fin-page-title mt-4 text-2xl font-semibold tracking-tight">{m.gerente.nav_transferencias}</h1>
      <p className="gerente-fin-muted mt-2 text-sm leading-relaxed">
        Saída na origem e entrada no destino, com log de movimento (gerente).
      </p>

      {!podeTransferir ? (
        <div
          className="mt-6 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"
          role="status"
        >
          <strong>Operação indisponível com uma loja.</strong> A transferência exige pelo menos duas lojas cadastradas e
          ativas. Com loja única, todo o estoque já está na mesma unidade; use ajustes de entrada/saída (recebimento ou
          movimentos de estoque) quando existirem no fluxo do gerente.
        </div>
      ) : null}

      {podeTransferir ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            void mutate({
              loja_origem_id: readFormDataString(fd, 'origem'),
              loja_destino_id: readFormDataString(fd, 'destino'),
              produto_id: readFormDataString(fd, 'produto_id'),
              quantidade: Number(fd.get('quantidade')),
              observacao: readFormDataString(fd, 'observacao'),
            })
          }}
          className="dragon-glass-card mt-6 flex flex-col gap-3 rounded-xl p-5"
        >
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">Loja origem</span>
            <select name="origem" required className="gerente-fin-input rounded-lg border px-3 py-2 text-sm">
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">Loja destino</span>
            <select name="destino" required className="gerente-fin-input rounded-lg border px-3 py-2 text-sm">
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">Produto</span>
            <select name="produto_id" required className="gerente-fin-input rounded-lg border px-3 py-2 text-sm">
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">Quantidade</span>
            <input
              name="quantidade"
              type="number"
              min={0.001}
              step="0.001"
              required
              className="gerente-fin-input max-w-[220px] rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">Observação</span>
            <input name="observacao" className="gerente-fin-input rounded-lg border px-3 py-2 text-sm" />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-[filter] hover:from-emerald-500 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-[160px]"
          >
            {loading ? 'Transferindo...' : 'Transferir'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
