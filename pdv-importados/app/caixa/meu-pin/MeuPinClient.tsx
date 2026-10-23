'use client'

import { useState, useTransition } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import { definirMeuPinAction, listarPinsEquipeAction, resetarPinOperadorAction, type PinEquipeLinha } from './actions'

type M = Mensagens['meu_pin']

export function MeuPinClient({ m, inicial, indisponivel }: { m: M; inicial: PinEquipeLinha[]; indisponivel: boolean }) {
  const [linhas, setLinhas] = useState(inicial)
  const [pin, setPin] = useState('')
  const [conf, setConf] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(indisponivel ? { tipo: 'erro', texto: m.erro_indisponivel } : null)
  const [pendente, start] = useTransition()
  const eu = linhas.find((l) => l.eu)
  const equipe = linhas.filter((l) => !l.eu)

  const erroTexto = (e: string) =>
    ({ formato: m.erro_formato, obvio: m.erro_obvio, confirmacao: m.erro_confirmacao, sessao: m.erro_sessao, permissao: m.erro_permissao })[e] ??
    m.erro_indisponivel

  const recarregar = async () => {
    const r = await listarPinsEquipeAction()
    if (r.ok) setLinhas(r.data ?? [])
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-3 rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const r = await definirMeuPinAction(pin, conf)
            setPin('')
            setConf('')
            if (r.ok) {
              setMsg({ tipo: 'ok', texto: m.salvo })
              await recarregar()
            } else setMsg({ tipo: 'erro', texto: erroTexto(r.erro) })
          })
        }}
      >
        <h2 className="font-medium">{eu?.tem_pin ? m.trocar_meu : m.definir_meu}</h2>
        <p className="text-xs text-muted-foreground">{m.regra}</p>
        <label className="text-sm">
          {m.novo_pin}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            pattern="[0-9]{4}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="mt-1 block w-40 rounded-md border px-3 py-2 text-lg tracking-[0.5em]"
          />
        </label>
        <label className="text-sm">
          {m.confirmar_pin}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            pattern="[0-9]{4}"
            value={conf}
            onChange={(e) => setConf(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="mt-1 block w-40 rounded-md border px-3 py-2 text-lg tracking-[0.5em]"
          />
        </label>
        <button type="submit" disabled={pendente || pin.length !== 4} className="w-fit rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
          {m.salvar}
        </button>
        {msg ? (
          <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={msg.tipo === 'erro' ? 'text-sm text-destructive' : 'text-sm text-green-700'}>
            {msg.texto}
          </p>
        ) : null}
      </form>

      {equipe.length > 0 ? (
        <section className="rounded-lg border p-4">
          <h2 className="mb-1 font-medium">{m.equipe_titulo}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{m.equipe_sub}</p>
          <ul className="divide-y">
            {equipe.map((l) => (
              <li key={l.usuario_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {l.nome} <span className="text-xs text-muted-foreground">· {l.papel}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={l.bloqueado ? 'text-destructive' : l.tem_pin ? 'text-green-700' : 'text-muted-foreground'}>
                    {l.bloqueado ? m.status_bloqueado : l.tem_pin ? m.status_com_pin : m.status_sem_pin}
                  </span>
                  {l.tem_pin ? (
                    <button
                      type="button"
                      disabled={pendente}
                      className="rounded-md border px-3 py-1 text-xs"
                      onClick={() =>
                        start(async () => {
                          if (!globalThis.confirm(m.resetar_confirmar.replace('{nome}', l.nome))) return
                          const r = await resetarPinOperadorAction(l.usuario_id)
                          setMsg(r.ok ? { tipo: 'ok', texto: m.resetado } : { tipo: 'erro', texto: erroTexto(r.erro) })
                          await recarregar()
                        })
                      }
                    >
                      {m.resetar}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
