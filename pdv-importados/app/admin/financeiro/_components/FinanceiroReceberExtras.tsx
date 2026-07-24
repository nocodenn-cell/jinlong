'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ROUTES } from '@shared-core/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { criarTituloReceber, liquidarTitulo } from '@/app/gerente/financeiro/actions'
import type { ContaLinha } from './ContasReceberTable'

type ClienteOpt = { id: string; nome: string }

type Props = {
  contas: ContaLinha[]
  clientesIniciais: ClienteOpt[]
}

const FORMAS = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'] as const

export function FinanceiroReceberExtras({ contas, clientesIniciais }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function refresh() {
    router.refresh()
  }

  function handleLiquidar(tituloId: string, form: HTMLFormElement) {
    const fd = new FormData(form)
    const valor = Number(fd.get('valor'))
    const forma = String(fd.get('forma') ?? 'DINHEIRO') as (typeof FORMAS)[number]
    if (!Number.isFinite(valor) || valor <= 0) {
      emitGerenteToast({ kind: 'error', message: 'Informe um valor válido.' })
      return
    }
    startTransition(async () => {
      const r = await liquidarTitulo({ titulo_id: tituloId, valor, forma_pagamento: forma })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: 'Liquidação registrada.' })
      refresh()
    })
  }

  function handleNovoTitulo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const valor = Number(fd.get('valor_total'))
    startTransition(async () => {
      const r = await criarTituloReceber({
        cliente_id: String(fd.get('cliente_id') ?? ''),
        valor_total: valor,
        descricao: String(fd.get('descricao') ?? '') || undefined,
        vencimento: String(fd.get('vencimento') ?? '') || undefined,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: 'Título criado.' })
      e.currentTarget.reset()
      refresh()
    })
  }

  const abertas = contas.filter((c) => c.valor_aberto > 0)

  return (
    <div className="admin-v2-stack mt-4">
      {abertas.length > 0 ? (
        <div className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-jl-fg-3">
            Liquidar título
          </h3>
          <ul className="space-y-2">
            {abertas.slice(0, 8).map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-md border border-[var(--color-border-secondary)] bg-jl-surface-base p-2 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 text-xs">
                  <span className="font-medium text-jl-fg-1">{c.cliente_nome}</span>
                  <span className="ml-2 text-jl-fg-3">{formatBRL(c.valor_aberto)} em aberto</span>
                </div>
                <form
                  className="flex flex-wrap items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleLiquidar(c.id, e.currentTarget)
                  }}
                >
                  <input
                    name="valor"
                    type="number"
                    min={0.01}
                    step="0.01"
                    defaultValue={c.valor_aberto}
                    className="admin-v2-input w-24 text-right text-xs"
                    aria-label="Valor a liquidar"
                  />
                  <select name="forma" className="admin-v2-input text-xs" defaultValue="DINHEIRO" aria-label="Forma de pagamento">
                    {FORMAS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={pending} className="admin-v2-btn-secondary text-xs">
                    Liquidar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-jl-fg-3">Novo título a receber</h3>
          <Link href={ROUTES.admin.clientes} className="text-[11px] font-medium text-amber-400 hover:underline">
            Gerenciar clientes
          </Link>
        </div>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={handleNovoTitulo}>
          <select name="cliente_id" required className="admin-v2-input text-sm sm:col-span-2">
            <option value="">Selecione o cliente</option>
            {clientesIniciais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <input
            name="valor_total"
            type="number"
            min={0.01}
            step="0.01"
            required
            placeholder="Valor total"
            className="admin-v2-input text-sm"
          />
          <input name="vencimento" type="date" className="admin-v2-input text-sm" />
          <input
            name="descricao"
            type="text"
            placeholder="Descrição (opcional)"
            className="admin-v2-input text-sm sm:col-span-2"
          />
          <button
            type="submit"
            disabled={pending || clientesIniciais.length === 0}
            className="admin-v2-btn-primary text-sm sm:col-span-2 sm:justify-self-end"
          >
            Criar título
          </button>
        </form>
        {clientesIniciais.length === 0 ? (
          <p className="mt-2 text-[11px] text-jl-fg-3">
            Cadastre um cliente em{' '}
            <Link href={ROUTES.admin.clientes} className="text-amber-400 hover:underline">
              Clientes
            </Link>{' '}
            antes de lançar títulos.
          </p>
        ) : null}
      </div>
    </div>
  )
}
