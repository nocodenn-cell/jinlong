'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { SuspensaoStatus } from './actions'
import { atualizarSuspensaoVendas, carregarSuspensaoVendas } from './actions'

type Props = Readonly<{ idioma: Idioma }>

export function SuspensaoPageClient({ idioma }: Props) {
  const m = getMessages(idioma).gerente_suspensao
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
    () => ({ successMessage: m.salvo }),
    [m.salvo],
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
      <GerenteFilterBar title={m.titulo} />
      <p className="gerente-fin-muted -mt-2 text-sm leading-relaxed">
        {m.descricao}
      </p>

      <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
        {m.voltar_painel}
      </Link>

      {carregando ? (
        <div className="gerente-fin-muted text-sm">{getMessages(idioma).comum.carregando}</div>
      ) : (
        <section className="dragon-glass-card space-y-5 rounded-xl p-5">
          {/* Toggle principal */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{m.suspender_label}</p>
              <p className="gerente-fin-muted mt-0.5 text-xs">
                {suspensas ? m.suspensas_sim : m.suspensas_nao}
              </p>
            </div>
            <button
              type="button"
              disabled={salvando}
              onClick={() => handleToggle(!suspensas)}
              className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                suspensas ? 'bg-red-500' : 'bg-[#334155]'
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
              <span className="font-semibold">{m.atencao_label}</span> {m.atencao_texto}
            </div>
          )}

          {/* Motivo */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium gerente-fin-muted">
              {m.motivo_label}
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={m.motivo_placeholder}
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
                {salvando ? '…' : m.salvar_motivo}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
