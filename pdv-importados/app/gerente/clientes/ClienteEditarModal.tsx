'use client'

/**
 * Modal create/edit de cliente — chrome DS (Onda 6).
 * Mesmo padrão de FornecedorEditarModal: Field/Input/Button/DragonModal.
 * Regras LGPD, masks e actions preservadas.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Checkbox } from '@/components/ui/forms'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { askConfirm } from '@/lib/ui/askConfirm'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { formatDecimalBRL, parseBRL } from '@/lib/format/money'
import { cn } from '@/lib/utils'
import {
  atualizarClienteAction,
  criarClienteAction,
} from '@/app/admin/clientes/actions'
import { type ClienteListRow, type ClienteInput } from './actions'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  messages?: Mensagens
  cliente: ClienteListRow | null
  onClose: () => void
  onSalvo: (c: ClienteListRow) => void
}>

function maskDoc(raw: string, tipo: 'PF' | 'PJ'): string {
  const x = raw.replace(/\D/g, '').slice(0, tipo === 'PF' ? 11 : 14)
  if (tipo === 'PF') {
    if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    return x.replace(/(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})/, (_, a, b, c, d) =>
      [a, b && `.${b}`, c && `.${c}`, d && `-${d}`].filter(Boolean).join(''),
    )
  }
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return x
}
function maskTel(raw: string): string {
  const x = raw.replace(/\D/g, '').slice(0, 11)
  if (x.length === 11) return x.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4')
  if (x.length === 10) return x.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return x
}

export function ClienteEditarModal({
  idioma,
  locale,
  messages,
  cliente,
  onClose,
  onSalvo,
}: Props) {
  const m = messages ?? getMessages(idioma)
  const editando = !!cliente

  const [tipo, setTipo] = useState<'PF' | 'PJ'>(cliente?.tipo ?? 'PF')
  const [nome, setNome] = useState(cliente?.nome ?? '')
  const [documento, setDocumento] = useState(cliente ? maskDoc(cliente.documento, cliente.tipo) : '')
  const [email, setEmail] = useState(cliente?.email ?? '')
  const [telefone, setTelefone] = useState(cliente?.telefone ? maskTel(cliente.telefone) : '')
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '')
  const [limite, setLimite] = useState(
    cliente ? formatDecimalBRL(Number(cliente.limite_crediario)) : '0,00',
  )
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)
  const [consentimentoLgpd, setConsentimentoLgpd] = useState(false)

  const nomeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => nomeRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  function sujo(): boolean {
    if (!editando) return !!(nome || documento || email || telefone || endereco || limite !== '0,00')
    return (
      nome !== cliente!.nome ||
      tipo !== cliente!.tipo ||
      documento.replace(/\D/g, '') !== cliente!.documento ||
      (email || '') !== (cliente!.email ?? '') ||
      telefone.replace(/\D/g, '') !== (cliente!.telefone ?? '') ||
      (endereco || '') !== (cliente!.endereco ?? '') ||
      (parseBRL(limite) ?? 0) !== Number(cliente!.limite_crediario)
    )
  }

  const fechar = useCallback(() => {
    void (async () => {
      if (sujo()) {
        const ok = await askConfirm({
          title: m.clientes.confirmar_descartar,
          description: m.clientes.confirmar_descartar,
          variant: 'neutral',
        })
        if (!ok) return
      }
      onClose()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, documento, email, telefone, endereco, limite, tipo, cliente, onClose, m])

  function handleTipo(t: 'PF' | 'PJ') {
    setTipo(t)
    setDocumento('')
  }
  function handleDoc(e: React.ChangeEvent<HTMLInputElement>) {
    setDocumento(maskDoc(e.target.value, tipo))
    if (erros.documento) setErros((x) => ({ ...x, documento: null }))
  }
  function handleTel(e: React.ChangeEvent<HTMLInputElement>) {
    setTelefone(maskTel(e.target.value))
    if (erros.telefone) setErros((x) => ({ ...x, telefone: null }))
  }
  function handleLimite(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^\d,]/g, '')
    const parts = v.split(',')
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('')
    setLimite(v)
  }

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = m.clientes.err_nome_obrigatorio
    else if (nome.trim().length < 2) e.nome = m.clientes.err_nome_curto
    const dDigits = documento.replace(/\D/g, '')
    if (!dDigits) e.documento = m.clientes.err_doc_obrigatorio
    else if (tipo === 'PF' && dDigits.length !== 11) e.documento = m.clientes.err_cpf_invalido
    else if (tipo === 'PJ' && dDigits.length !== 14) e.documento = m.clientes.err_cnpj_invalido
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = m.clientes.err_email
    const tDigits = telefone.replace(/\D/g, '')
    if (tDigits && tDigits.length < 10) e.telefone = m.clientes.err_telefone
    const lim = parseBRL(limite) ?? 0
    if (lim < 0) e.limite_crediario = m.clientes.err_limite_negativo
    if (!editando && !consentimentoLgpd) {
      e.consentimento_lgpd = m.clientes.err_consentimento_lgpd
    }
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    const now = new Date().toISOString()
    const input: ClienteInput = {
      id: cliente?.id,
      nome: nome.trim(),
      tipo,
      documento: documento.replace(/\D/g, ''),
      email: email.trim() || null,
      telefone: telefone.replace(/\D/g, '') || null,
      endereco: endereco.trim() || null,
      limite_crediario: parseBRL(limite) ?? 0,
      ...(!editando && consentimentoLgpd
        ? { termos_aceitos_em: now, consentimento_privacidade_em: now }
        : {}),
    }
    setSalvando(true)
    try {
      const r = editando ? await atualizarClienteAction(input) : await criarClienteAction(input)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      onSalvo(r.cliente)
    } finally {
      setSalvando(false)
    }
  }

  const Icon = editando ? UserCog : UserPlus
  const titulo = editando ? m.clientes.modal_editar_titulo : m.clientes.modal_novo_titulo

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={Icon}
      title={editando ? cliente!.nome : titulo}
      subtitle={
        editando && Number(cliente!.saldo_crediario) > 0 ? (
          <>
            {m.clientes.saldo_atual}:{' '}
            <strong className="tabular-nums text-[var(--color-warning-strong)]">
              {fmtGerenteBRL(Number(cliente!.saldo_crediario), locale)}
            </strong>
          </>
        ) : undefined
      }
      dismissable={!salvando}
      closeLabel={m.comum.cancelar}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={fechar} disabled={salvando}>
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="cliente-form" variant="primary" disabled={salvando}>
            {salvando
              ? (m.comum.carregando ?? '…')
              : editando
                ? m.clientes.modal_salvar
                : m.clientes.modal_cadastrar}
          </Button>
        </>
      }
    >
      <form id="cliente-form" onSubmit={submeter} className="space-y-4 pb-1">
        <div>
          <span className="mb-1.5 block text-small font-medium text-fg-subtle">
            {m.clientes.tipo_label}
          </span>
          <div
            role="radiogroup"
            aria-label={m.clientes.tipo_label}
            className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-1"
          >
            {(['PF', 'PJ'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                onClick={() => handleTipo(t)}
                disabled={salvando}
                className={cn(
                  'h-8 rounded-md text-caption font-medium transition-colors',
                  tipo === t
                    ? 'bg-[var(--color-info-bg)] font-semibold text-brand'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                {t === 'PF' ? m.clientes.tipo_pf : m.clientes.tipo_pj}
              </button>
            ))}
          </div>
        </div>

        <Field
          id="cli-nome"
          label={tipo === 'PJ' ? m.clientes.field_razao_social : m.clientes.field_nome}
          required
          error={erros.nome ?? undefined}
        >
          <Input
            ref={nomeRef}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              if (erros.nome) setErros((x) => ({ ...x, nome: null }))
            }}
            disabled={salvando}
            required
            maxLength={120}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            id="cli-doc"
            label={tipo === 'PF' ? m.clientes.field_cpf : m.clientes.field_cnpj}
            required
            error={erros.documento ?? undefined}
          >
            <Input
              inputMode="numeric"
              value={documento}
              onChange={handleDoc}
              disabled={salvando}
              required
              placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
              className="font-mono"
            />
          </Field>
          <Field id="cli-tel" label={m.clientes.field_telefone} error={erros.telefone ?? undefined}>
            <Input
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={handleTel}
              disabled={salvando}
              placeholder="(11) 9 0000-0000"
              className="tabular-nums"
            />
          </Field>
        </div>

        <Field id="cli-email" label={m.clientes.field_email} error={erros.email ?? undefined}>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (erros.email) setErros((x) => ({ ...x, email: null }))
            }}
            disabled={salvando}
            placeholder="cliente@example.com"
          />
        </Field>

        <Field id="cli-end" label={m.clientes.field_endereco}>
          <Input
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            disabled={salvando}
            maxLength={180}
            placeholder={m.clientes.placeholder_endereco}
          />
        </Field>

        <Field
          id="cli-limite"
          label={m.clientes.field_limite_crediario}
          hint={m.clientes.hint_limite}
          error={erros.limite_crediario ?? undefined}
        >
          <Input
            inputMode="decimal"
            value={limite}
            onChange={handleLimite}
            disabled={salvando}
            placeholder="0,00"
            className="text-right font-mono tabular-nums"
          />
        </Field>

        {!editando ? (
          <div className="border-t border-[var(--color-border)] pt-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                id="lgpd-consent"
                checked={consentimentoLgpd}
                onChange={(e) => {
                  setConsentimentoLgpd(e.target.checked)
                  if (erros.consentimento_lgpd) setErros((x) => ({ ...x, consentimento_lgpd: null }))
                }}
                disabled={salvando}
                aria-describedby={erros.consentimento_lgpd ? 'err-lgpd' : undefined}
                className="mt-0.5"
              />
              <span className="select-none text-caption leading-relaxed text-fg-subtle">
                Confirmo que os dados pessoais acima foram coletados com o consentimento do titular
                em conformidade com a LGPD.
                <span className="ml-0.5 text-brand">*</span>
              </span>
            </label>
            {erros.consentimento_lgpd ? (
              <p id="err-lgpd" className="mt-1 text-caption text-[var(--color-danger-strong)]" role="alert">
                {erros.consentimento_lgpd}
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    </DragonModal>
  )
}
