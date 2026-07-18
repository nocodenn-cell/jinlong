'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { formatDecimalBRL, parseBRL } from '@/lib/format/money'
import {
  atualizarClienteAction,
  criarClienteAction,
} from '@/app/admin/clientes/actions'
import { type ClienteListRow, type ClienteInput } from './actions'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  /** Bundle opcional (admin 5.3); senão getMessages(idioma). */
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

/**
 * Modal de criação/edição de cliente.
 * - Mesmo componente para create e update (baseado em `cliente !== null`).
 * - a11y: role=dialog, aria-modal, foco volta para a linha de origem,
 *   ESC fecha (com confirmação se o form estiver sujo), focus trap simples.
 * - Validação no client + server: create → `criarClienteAction` (Writer);
 *   update → `atualizarClienteAction` (Updater).
 */
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

  // DragonModal cuida de Escape, scroll-lock e foco-trap; aqui só o foco inicial.
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
    if (sujo() && !confirm(m.clientes.confirmar_descartar)) return
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, documento, email, telefone, endereco, limite, tipo, cliente, onClose, m])

  function handleTipo(t: 'PF' | 'PJ') {
    setTipo(t)
    setDocumento('') // reset porque o length difere
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
      // Registra o momento do consentimento LGPD apenas para novos clientes
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
  const titulo = editando ? `${m.clientes.modal_editar_titulo}` : m.clientes.modal_novo_titulo
  const finIn = 'h-10 w-full rounded-md px-3 text-sm app-input'

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
            <strong className="tabular-nums text-amber-400">
              {fmtGerenteBRL(Number(cliente!.saldo_crediario), locale)}
            </strong>
          </>
        ) : undefined
      }
      dismissable={!salvando}
      closeLabel={m.comum.cancelar}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            className="app-btn-neutral"
            onClick={fechar}
            disabled={salvando}
          >
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="cliente-form" className="app-btn-accent" disabled={salvando}>
            {salvando
              ? m.comum.carregando ?? '…'
              : editando
                ? m.clientes.modal_salvar
                : m.clientes.modal_cadastrar}
          </Button>
        </>
      }
    >
        <form id="cliente-form" onSubmit={submeter} className="space-y-4 pb-1">
            {/* Tipo PF/PJ */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-jl-fg-3">
                {m.clientes.tipo_label}
              </span>
              <div
                role="radiogroup"
                aria-label={m.clientes.tipo_label}
                className="grid grid-cols-2 gap-1 rounded-lg app-border border bg-jl-surface-soft p-1"
              >
                {(['PF', 'PJ'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => handleTipo(t)}
                    disabled={salvando}
                    className={`h-8 rounded-md text-xs font-medium transition-colors ${
                      tipo === t
                        ? 'bg-gradient-to-b from-amber-300 to-amber-600 font-semibold text-slate-900'
                        : 'text-jl-fg-3 hover:text-jl-fg-1'
                    }`}
                  >
                    {t === 'PF' ? m.clientes.tipo_pf : m.clientes.tipo_pj}
                  </button>
                ))}
              </div>
            </div>

            {/* Nome */}
            <label className="block text-xs font-medium text-jl-fg-3">
              {tipo === 'PJ' ? m.clientes.field_razao_social : m.clientes.field_nome}
              <span className="ml-0.5 text-[color:var(--accent)]">*</span>
              <input
                ref={nomeRef}
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                  if (erros.nome) setErros((x) => ({ ...x, nome: null }))
                }}
                disabled={salvando}
                required
                maxLength={120}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? 'err-nome' : undefined}
                className={`${finIn} mt-1 ${erros.nome ? 'border-red-400/60' : ''}`}
              />
              {erros.nome && <span id="err-nome" className="mt-1 block text-xs text-red-300">{erros.nome}</span>}
            </label>

            {/* Documento + Telefone */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-jl-fg-3">
                {tipo === 'PF' ? m.clientes.field_cpf : m.clientes.field_cnpj}
                <span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input
                  inputMode="numeric"
                  value={documento}
                  onChange={handleDoc}
                  disabled={salvando}
                  required
                  aria-invalid={!!erros.documento}
                  aria-describedby={erros.documento ? 'err-doc' : undefined}
                  placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  className={`${finIn} mt-1 font-mono ${erros.documento ? 'border-red-400/60' : ''}`}
                />
                {erros.documento && (
                  <span id="err-doc" className="mt-1 block text-xs text-red-300">{erros.documento}</span>
                )}
              </label>

              <label className="block text-xs font-medium text-jl-fg-3">
                {m.clientes.field_telefone}
                <input
                  type="tel"
                  inputMode="tel"
                  value={telefone}
                  onChange={handleTel}
                  disabled={salvando}
                  aria-invalid={!!erros.telefone}
                  aria-describedby={erros.telefone ? 'err-tel' : undefined}
                  placeholder="(11) 9 0000-0000"
                  className={`${finIn} mt-1 tabular-nums ${erros.telefone ? 'border-red-400/60' : ''}`}
                />
                {erros.telefone && (
                  <span id="err-tel" className="mt-1 block text-xs text-red-300">{erros.telefone}</span>
                )}
              </label>
            </div>

            {/* E-mail */}
            <label className="block text-xs font-medium text-jl-fg-3">
              {m.clientes.field_email}
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (erros.email) setErros((x) => ({ ...x, email: null }))
                }}
                disabled={salvando}
                aria-invalid={!!erros.email}
                aria-describedby={erros.email ? 'err-email' : undefined}
                placeholder="cliente@example.com"
                className={`${finIn} mt-1 ${erros.email ? 'border-red-400/60' : ''}`}
              />
              {erros.email && <span id="err-email" className="mt-1 block text-xs text-red-300">{erros.email}</span>}
            </label>

            {/* Endereço */}
            <label className="block text-xs font-medium text-jl-fg-3">
              {m.clientes.field_endereco}
              <input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                disabled={salvando}
                maxLength={180}
                placeholder={m.clientes.placeholder_endereco}
                className={`${finIn} mt-1`}
              />
            </label>

            {/* Limite */}
            <label className="block text-xs font-medium text-jl-fg-3">
              {m.clientes.field_limite_crediario}
              <div className="mt-1 flex items-center gap-2">
                <span className="flex h-10 items-center rounded-md app-border border bg-jl-surface-soft px-3 text-sm text-jl-fg-3">
                  R$
                </span>
                <input
                  inputMode="decimal"
                  value={limite}
                  onChange={handleLimite}
                  disabled={salvando}
                  aria-invalid={!!erros.limite_crediario}
                  aria-describedby={erros.limite_crediario ? 'err-lim' : 'hint-lim'}
                  placeholder="0,00"
                  className={`${finIn} flex-1 text-right font-mono tabular-nums ${erros.limite_crediario ? 'border-red-400/60' : ''}`}
                />
              </div>
              <span id="hint-lim" className="mt-1 block text-[11px] text-jl-fg-3">
                {m.clientes.hint_limite}
              </span>
              {erros.limite_crediario && (
                <span id="err-lim" className="mt-1 block text-xs text-red-300">{erros.limite_crediario}</span>
              )}
            </label>

          {/* Consentimento LGPD — obrigatório apenas para novos clientes */}
          {!editando && (
            <div className="border-t border-jl-border-1 px-5 py-3 sm:px-6">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  id="lgpd-consent"
                  type="checkbox"
                  checked={consentimentoLgpd}
                  onChange={(e) => {
                    setConsentimentoLgpd(e.target.checked)
                    if (erros.consentimento_lgpd) setErros((x) => ({ ...x, consentimento_lgpd: null }))
                  }}
                  disabled={salvando}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-400"
                  aria-describedby={erros.consentimento_lgpd ? 'err-lgpd' : undefined}
                />
                <span className="select-none text-xs leading-relaxed text-jl-fg-3">
                  Confirmo que os dados pessoais acima foram coletados com o consentimento
                  do titular em conformidade com a LGPD.
                  <span className="ml-0.5 text-[color:var(--accent)]">*</span>
                </span>
              </label>
              {erros.consentimento_lgpd && (
                <p id="err-lgpd" className="mt-1 text-xs text-red-300" role="alert">
                  {erros.consentimento_lgpd}
                </p>
              )}
            </div>
          )}

        </form>
    </DragonModal>
  )
}
