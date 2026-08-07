'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { ROUTES } from '@shared-core/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import { emitToast } from '@/lib/gerente/toast'
import { criarTituloReceber, liquidarTitulo } from '@/app/gerente/financeiro/actions'
import { buscarClientesPaginadosAction } from '@/app/admin/clientes/actions'
import { Button } from '@/components/ui/button'
import { EntityLookup, type EntityLookupOption } from '@/components/ui/forms'
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
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteLabel, setClienteLabel] = useState('')

  function refresh() {
    router.refresh()
  }

  const searchClientes = useCallback(async (query: string): Promise<EntityLookupOption[]> => {
    const r = await buscarClientesPaginadosAction(1, query)
    if (!r.ok) return []
    return r.clientes.map((c) => ({ value: c.id, label: c.nome }))
  }, [])

  function handleLiquidar(tituloId: string, form: HTMLFormElement) {
    const fd = new FormData(form)
    const valor = Number(fd.get('valor'))
    const forma = String(fd.get('forma') ?? 'DINHEIRO') as (typeof FORMAS)[number]
    if (!Number.isFinite(valor) || valor <= 0) {
      emitToast({ kind: 'error', message: 'Informe um valor válido.' })
      return
    }
    startTransition(async () => {
      const r = await liquidarTitulo({ titulo_id: tituloId, valor, forma_pagamento: forma })
      if (!r.success) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      emitToast({ kind: 'success', message: 'Liquidação registrada.' })
      refresh()
    })
  }

  function handleNovoTitulo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!clienteId) {
      emitToast({ kind: 'error', message: 'Selecione um cliente.' })
      return
    }
    const fd = new FormData(e.currentTarget)
    const valor = Number(fd.get('valor_total'))
    startTransition(async () => {
      const r = await criarTituloReceber({
        cliente_id: clienteId,
        valor_total: valor,
        descricao: String(fd.get('descricao') ?? '') || undefined,
        vencimento: String(fd.get('vencimento') ?? '') || undefined,
      })
      if (!r.success) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      emitToast({ kind: 'success', message: 'Título criado.' })
      e.currentTarget.reset()
      setClienteId(null)
      setClienteLabel('')
      refresh()
    })
  }

  const abertas = contas.filter((c) => c.valor_aberto > 0)

  return (
    <div className="admin-v2-stack mt-4">
      {abertas.length > 0 ? (
        <div className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Liquidar título
          </h3>
          <ul className="space-y-2">
            {abertas.slice(0, 8).map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-md border border-[var(--color-border-secondary)] bg-jl-surface-base p-2 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 text-xs">
                  <span className="font-medium text-fg">{c.cliente_nome}</span>
                  <span className="ml-2 text-fg-subtle">{formatBRL(c.valor_aberto)} em aberto</span>
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
                  <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                    Liquidar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Novo título a receber</h3>
          <Link href={ROUTES.admin.clientes} className="text-caption font-medium text-brand hover:underline">
            Gerenciar clientes
          </Link>
        </div>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={handleNovoTitulo}>
          <div className="sm:col-span-2">
            <EntityLookup
              value={clienteId}
              selectedLabel={clienteLabel}
              onSelect={(opt) => {
                setClienteId(opt?.value ?? null)
                setClienteLabel(opt?.label ?? '')
              }}
              onSearch={searchClientes}
              placeholder="Buscar cliente…"
              aria-label="Cliente"
              emptyLabel={
                clientesIniciais.length === 0
                  ? 'Nenhum cliente cadastrado'
                  : 'Nenhum cliente encontrado'
              }
            />
          </div>
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
          <Button
            type="submit"
            size="sm"
            disabled={pending || !clienteId}
            className="sm:col-span-2 sm:justify-self-end"
          >
            Criar título
          </Button>
        </form>
        {clientesIniciais.length === 0 ? (
          <p className="mt-2 text-caption text-fg-subtle">
            Cadastre um cliente em{' '}
            <Link href={ROUTES.admin.clientes} className="text-brand hover:underline">
              Clientes
            </Link>{' '}
            antes de lançar títulos.
          </p>
        ) : null}
      </div>
    </div>
  )
}
