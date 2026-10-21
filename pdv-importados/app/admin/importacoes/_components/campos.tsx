'use client'

import { useId, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import type { Mensagens } from '@/i18n/getMessages'
import type { ResultadoAcao } from '../actions'

export type TextosImport = Mensagens['importacoes']

/** Executa uma server action com estado de carregamento, toast e refresh dos dados do servidor. */
export function useAcao(t: TextosImport) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function executar<T>(fn: () => Promise<ResultadoAcao<T>>, aoSucesso?: (data: T) => void, msgSucesso?: string) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) {
        const base = (t as Record<string, string>)[r.erro] ?? t.erro_generico
        const msg = r.detalhe ? `${base} ${r.detalhe}` : base
        setErro(msg)
        emitGerenteToast({ kind: 'error', message: msg })
        return
      }
      if (msgSucesso) emitGerenteToast({ kind: 'success', message: msgSucesso })
      aoSucesso?.(r.data)
      router.refresh()
    })
  }
  return { executar, pendente, erro, setErro }
}

type CampoProps = {
  rotulo: string
  dica?: string
  obrigatorio?: boolean
  className?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}

/** Rótulo + controle + dica, ligados por id (acessível por teclado e leitor de tela). */
export function Campo({ rotulo, dica, obrigatorio, className, children }: CampoProps) {
  const id = useId()
  const dicaId = dica ? `${id}-dica` : undefined
  return (
    <div className={className ?? 'flex flex-col gap-1'}>
      <label htmlFor={id} className="text-small font-medium text-fg">
        {rotulo}
        {obrigatorio ? <span aria-hidden="true" className="text-[var(--color-warning-strong)]"> *</span> : null}
      </label>
      {children(id, dicaId)}
      {dica ? (
        <p id={dicaId} className="text-xs text-fg-subtle">
          {dica}
        </p>
      ) : null}
    </div>
  )
}

export function Texto(props: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  dica?: string
  obrigatorio?: boolean
  tipo?: 'text' | 'date'
  modoNumerico?: boolean
  maxLength?: number
  desabilitado?: boolean
  testId?: string
  className?: string
}) {
  return (
    <Campo rotulo={props.rotulo} dica={props.dica} obrigatorio={props.obrigatorio} className={props.className}>
      {(id, describedBy) => (
        <input
          id={id}
          type={props.tipo ?? 'text'}
          inputMode={props.modoNumerico ? 'decimal' : undefined}
          className={`fp-control w-full text-small${props.modoNumerico ? ' tabular-nums text-right' : ''}`}
          value={props.valor}
          onChange={(e) => props.onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-required={props.obrigatorio || undefined}
          maxLength={props.maxLength}
          disabled={props.desabilitado}
          data-testid={props.testId}
          autoComplete="off"
          spellCheck={false}
        />
      )}
    </Campo>
  )
}

export function Selecao(props: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  opcoes: readonly { valor: string; rotulo: string }[]
  dica?: string
  obrigatorio?: boolean
  desabilitado?: boolean
  testId?: string
  className?: string
}) {
  return (
    <Campo rotulo={props.rotulo} dica={props.dica} obrigatorio={props.obrigatorio} className={props.className}>
      {(id, describedBy) => (
        <select
          id={id}
          className="fp-control w-full text-small"
          value={props.valor}
          onChange={(e) => props.onChange(e.target.value)}
          aria-describedby={describedBy}
          disabled={props.desabilitado}
          data-testid={props.testId}
        >
          {props.opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      )}
    </Campo>
  )
}

/** Mensagem de erro anunciada (role=alert) junto ao formulário. */
export function ErroFormulario({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <p role="alert" className="rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-small text-[var(--color-warning-strong)]">
      {mensagem}
    </p>
  )
}

export const MOEDAS_COMUNS = ['USD', 'CNY', 'EUR', 'BRL', 'HKD', 'JPY'] as const
