'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { SuspensaoStatus } from './actions'
import { atualizarSuspensaoVendas, carregarSuspensaoVendas } from './actions'

export function SuspensaoPageClient() {
  const [suspensas, setSuspensas] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    void (async () => {
      const r = await carregarSuspensaoVendas()
      if (r.success) {
        setSuspensas(r.data.suspensas)
        setMotivo(r.data.motivo)
      }
      setCarregando(false)
    })()
  }, [])

  const saveOpts = useCallback(
    () => ({ successMessage: 'Configuração salva.' }),
    [],
  )

  const { mutate: salvar, loading: salvando } = useGerenteMutation(
    async (payload: SuspensaoStatus) => {
      const r = await atualizarSuspensaoVendas(payload.suspensas, payload.motivo)
      if (!r.success) throw new Error(r.error)
      return null
    },
    saveOpts(),
  )

  const handleToggle = (v: boolean) => {
    setSuspensas(v)
    void salvar({ suspensas: v, motivo })
  }

  const handleSalvarMotivo = () => {
    void salvar({ suspensas, motivo })
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 md:px-6">
      <GerenteFilterBar title="Suspensão de Vendas" />
      <p className="gerente-fin-muted -mt-2 text-sm leading-relaxed">
        Quando ativada, o caixa bloqueia novas vendas para todos os operadores.
        Gerentes, donos e admins continuam autorizados.
      </p>

      <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
        ← Painel gerencial
      </Link>

      {carregando ? (
        <div className="gerente-fin-muted text-sm">Carregando…</div>
      ) : (
        <section className="dragon-glass-card space-y-5 rounded-xl p-5">
          {/* Toggle principal */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Suspender vendas</p>
              <p className="gerente-fin-muted mt-0.5 text-xs">
                {suspensas
                  ? 'Vendas estão suspensas no momento.'
                  : 'Vendas estão operando normalmente.'}
              </p>
            </div>
            <button
              type="button"
              disabled={salvando}
              onClick={() => handleToggle(!suspensas)}
              className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                suspensas ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              aria-pressed={suspensas}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  suspensas ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Status visual */}
          {suspensas && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <span className="font-semibold">Atenção:</span> vendas bloqueadas para operadores.
            </div>
          )}

          {/* Motivo */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium gerente-fin-muted">
              Motivo / mensagem para o operador
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ex: Inventário em andamento, retornaremos em breve."
              className="w-full rounded-md border px-3 py-2 text-sm app-border app-input resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] gerente-fin-muted">{motivo.length}/300</span>
              <button
                type="button"
                disabled={salvando}
                onClick={handleSalvarMotivo}
                className="rounded-md px-4 py-1.5 text-sm font-semibold app-btn-accent disabled:opacity-50"
              >
                {salvando ? '…' : 'Salvar motivo'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
