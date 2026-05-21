'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { salvarFornecedorAction, type FornecedorInput, type FornecedorListRow } from './actions'

type Props = Readonly<{
  idioma: Idioma
  fornecedor: FornecedorListRow | null
  onClose: () => void
  onSalvo: (f: FornecedorListRow) => void
}>

const UFs = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

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
function maskCEP(raw: string): string {
  const x = raw.replace(/\D/g, '').slice(0, 8)
  if (x.length === 8) return x.replace(/(\d{5})(\d{3})/, '$1-$2')
  return x
}

export function FornecedorEditarModal({ idioma, fornecedor, onClose, onSalvo }: Props) {
  const m = getMessages(idioma)
  const editando = !!fornecedor

  const [tipo, setTipo] = useState<'PF' | 'PJ'>(fornecedor?.tipo ?? 'PJ')
  const [nome, setNome] = useState(fornecedor?.nome ?? '')
  const [documento, setDocumento] = useState(fornecedor ? maskDoc(fornecedor.documento, fornecedor.tipo) : '')
  const [email, setEmail] = useState(fornecedor?.email ?? '')
  const [telefone, setTelefone] = useState(fornecedor?.telefone ? maskTel(fornecedor.telefone) : '')
  const [contato, setContato] = useState(fornecedor?.contato_pessoa ?? '')
  const [categoria, setCategoria] = useState(fornecedor?.categoria ?? '')

  const [logradouro, setLogradouro] = useState(fornecedor?.endereco_logradouro ?? '')
  const [numero, setNumero] = useState(fornecedor?.endereco_numero ?? '')
  const [complemento, setComplemento] = useState(fornecedor?.endereco_complemento ?? '')
  const [bairro, setBairro] = useState(fornecedor?.endereco_bairro ?? '')
  const [cidade, setCidade] = useState(fornecedor?.endereco_cidade ?? '')
  const [uf, setUf] = useState(fornecedor?.endereco_uf ?? 'SP')
  const [cep, setCep] = useState(fornecedor?.endereco_cep ? maskCEP(fornecedor.endereco_cep) : '')

  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const nomeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const triggerEl = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => nomeRef.current?.focus(), 30)

    const onKey = (e: KeyboardEvent) => {
      if (salvando) return
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
        return
      }
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      triggerEl?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvando])

  function sujo(): boolean {
    if (!editando) {
      return !!(
        nome || documento || email || telefone || contato || categoria ||
        logradouro || numero || complemento || bairro || cidade || cep
      )
    }
    return (
      nome !== fornecedor!.nome ||
      tipo !== fornecedor!.tipo ||
      documento.replace(/\D/g, '') !== fornecedor!.documento ||
      (email || '') !== (fornecedor!.email ?? '') ||
      telefone.replace(/\D/g, '') !== (fornecedor!.telefone ?? '') ||
      (contato || '') !== (fornecedor!.contato_pessoa ?? '') ||
      (categoria || '') !== (fornecedor!.categoria ?? '') ||
      (logradouro || '') !== (fornecedor!.endereco_logradouro ?? '') ||
      (numero || '') !== (fornecedor!.endereco_numero ?? '') ||
      (complemento || '') !== (fornecedor!.endereco_complemento ?? '') ||
      (bairro || '') !== (fornecedor!.endereco_bairro ?? '') ||
      (cidade || '') !== (fornecedor!.endereco_cidade ?? '') ||
      uf !== (fornecedor!.endereco_uf ?? '') ||
      cep.replace(/\D/g, '') !== (fornecedor!.endereco_cep ?? '')
    )
  }

  const fechar = useCallback(() => {
    if (sujo() && !confirm(m.fornecedores.confirmar_descartar)) return
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nome, documento, email, telefone, contato, categoria,
    logradouro, numero, complemento, bairro, cidade, uf, cep, tipo,
    fornecedor, onClose, m,
  ])

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
  }
  function handleCep(e: React.ChangeEvent<HTMLInputElement>) {
    setCep(maskCEP(e.target.value))
  }

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = m.fornecedores.err_nome_obrigatorio
    else if (nome.trim().length < 2) e.nome = m.fornecedores.err_nome_curto
    const docDigits = documento.replace(/\D/g, '')
    if (!docDigits) e.documento = m.fornecedores.err_doc_obrigatorio
    else if (tipo === 'PF' && docDigits.length !== 11) e.documento = m.fornecedores.err_cpf_invalido
    else if (tipo === 'PJ' && docDigits.length !== 14) e.documento = m.fornecedores.err_cnpj_invalido
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = m.fornecedores.err_email
    const cepD = cep.replace(/\D/g, '')
    if (cepD && cepD.length !== 8) e.cep = m.fornecedores.err_cep
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    const input: FornecedorInput = {
      id: fornecedor?.id,
      nome: nome.trim(),
      tipo,
      documento: documento.replace(/\D/g, ''),
      email: email.trim() || null,
      telefone: telefone.replace(/\D/g, '') || null,
      contato_pessoa: contato.trim() || null,
      categoria: categoria.trim() || null,
      endereco_logradouro: logradouro.trim() || null,
      endereco_numero: numero.trim() || null,
      endereco_complemento: complemento.trim() || null,
      endereco_bairro: bairro.trim() || null,
      endereco_cidade: cidade.trim() || null,
      endereco_uf: uf || null,
      endereco_cep: cep.replace(/\D/g, '') || null,
    }
    setSalvando(true)
    try {
      const r = await salvarFornecedorAction(input)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      onSalvo(r.fornecedor)
    } finally {
      setSalvando(false)
    }
  }

  const finIn = 'h-10 w-full rounded-md px-3 text-sm app-input'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando) fechar()
      }}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forn-modal-titulo"
        className="dragon-glass-card flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-jl-border-1 px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" aria-hidden />
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-jl-fg-3">
                  {editando ? m.fornecedores.modal_editar_titulo : m.fornecedores.modal_novo_titulo} · 供应商
                </p>
                <CardTitle id="forn-modal-titulo" className="truncate text-lg font-semibold text-jl-fg-1">
                  {editando ? fornecedor!.nome : m.fornecedores.modal_novo_titulo}
                </CardTitle>
              </div>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label={m.comum.fechar ?? 'Fechar'}
              disabled={salvando}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md app-border border text-jl-fg-3 transition-colors hover:border-[color:var(--accent)] hover:text-jl-fg-1 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </CardHeader>

        <form onSubmit={submeter} className="flex flex-1 min-h-0 flex-col">
          <CardContent className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            {/* PF/PJ */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-jl-fg-3">{m.fornecedores.tipo_label}</span>
              <div role="radiogroup" aria-label={m.fornecedores.tipo_label} className="grid grid-cols-2 gap-1 rounded-lg app-border border bg-jl-surface-soft p-1">
                {(['PJ', 'PF'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => handleTipo(t)}
                    disabled={salvando}
                    className={cn(
                      'h-8 rounded-md text-xs font-medium transition-colors',
                      tipo === t
                        ? 'bg-gradient-to-b from-amber-300 to-amber-600 font-semibold text-slate-900'
                        : 'text-jl-fg-3 hover:text-jl-fg-1',
                    )}
                  >
                    {t === 'PJ' ? m.fornecedores.tipo_pj : m.fornecedores.tipo_pf}
                  </button>
                ))}
              </div>
            </div>

            {/* Nome */}
            <label className="block text-xs font-medium text-jl-fg-3">
              {tipo === 'PJ' ? m.fornecedores.field_razao_social : m.fornecedores.field_nome}
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
                className={cn(`${finIn} mt-1`, erros.nome && 'border-red-400/60')}
              />
              {erros.nome && <span id="err-nome" className="mt-1 block text-xs text-red-300">{erros.nome}</span>}
            </label>

            {/* Doc + Tel */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-jl-fg-3">
                {tipo === 'PF' ? m.fornecedores.field_cpf : m.fornecedores.field_cnpj}
                <span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input
                  inputMode="numeric"
                  value={documento}
                  onChange={handleDoc}
                  disabled={salvando}
                  required
                  placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  className={cn(`${finIn} mt-1 font-mono`, erros.documento && 'border-red-400/60')}
                  aria-invalid={!!erros.documento}
                />
                {erros.documento && <span className="mt-1 block text-xs text-red-300">{erros.documento}</span>}
              </label>
              <label className="block text-xs font-medium text-jl-fg-3">
                {m.fornecedores.field_telefone}
                <input
                  type="tel"
                  inputMode="tel"
                  value={telefone}
                  onChange={handleTel}
                  disabled={salvando}
                  placeholder="(11) 9 0000-0000"
                  className={`${finIn} mt-1 tabular-nums`}
                />
              </label>
            </div>

            {/* Email + Contato */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-jl-fg-3">
                {m.fornecedores.field_email}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (erros.email) setErros((x) => ({ ...x, email: null }))
                  }}
                  disabled={salvando}
                  placeholder="compras@fornecedor.com.br"
                  className={cn(`${finIn} mt-1`, erros.email && 'border-red-400/60')}
                  aria-invalid={!!erros.email}
                />
                {erros.email && <span className="mt-1 block text-xs text-red-300">{erros.email}</span>}
              </label>
              <label className="block text-xs font-medium text-jl-fg-3">
                {m.fornecedores.field_contato}
                <input
                  value={contato}
                  onChange={(e) => setContato(e.target.value)}
                  disabled={salvando}
                  placeholder={m.fornecedores.placeholder_contato}
                  className={`${finIn} mt-1`}
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-jl-fg-3">
              {m.fornecedores.field_categoria}
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={salvando}
                placeholder={m.fornecedores.placeholder_categoria}
                className={`${finIn} mt-1`}
              />
            </label>

            {/* Endereço */}
            <div className="mt-2 border-t border-dashed border-jl-border-1 pt-4">
              <div className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
                {m.fornecedores.section_endereco}
                <span className="text-xs font-medium tracking-[0.08em] text-[color:var(--accent)]" style={{ fontFamily: 'var(--font-serif-han)' }}>
                  地址
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_100px]">
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_cep}
                  <input
                    inputMode="numeric"
                    value={cep}
                    onChange={handleCep}
                    disabled={salvando}
                    placeholder="00000-000"
                    className={cn(`${finIn} mt-1 font-mono tabular-nums`, erros.cep && 'border-red-400/60')}
                  />
                  {erros.cep && <span className="mt-1 block text-xs text-red-300">{erros.cep}</span>}
                </label>
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_logradouro}
                  <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} disabled={salvando}
                    className={`${finIn} mt-1`} />
                </label>
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_numero}
                  <input value={numero} onChange={(e) => setNumero(e.target.value)} disabled={salvando}
                    className={`${finIn} mt-1`} />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_complemento}
                  <input value={complemento} onChange={(e) => setComplemento(e.target.value)} disabled={salvando}
                    className={`${finIn} mt-1`} />
                </label>
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_bairro}
                  <input value={bairro} onChange={(e) => setBairro(e.target.value)} disabled={salvando}
                    className={`${finIn} mt-1`} />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_cidade}
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={salvando}
                    className={`${finIn} mt-1`} />
                </label>
                <label className="block text-xs font-medium text-jl-fg-3">
                  {m.fornecedores.field_uf}
                  <select value={uf} onChange={(e) => setUf(e.target.value)} disabled={salvando}
                    className="app-select mt-1 h-10 w-full rounded-md px-3 text-sm">
                    {UFs.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-jl-border-1 px-5 py-3 sm:px-6">
            <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={salvando}>
              {m.comum.cancelar}
            </Button>
            <Button type="submit" className="app-btn-accent" disabled={salvando}>
              {salvando ? m.comum.carregando ?? '…' : editando ? m.fornecedores.modal_salvar : m.fornecedores.modal_cadastrar}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
