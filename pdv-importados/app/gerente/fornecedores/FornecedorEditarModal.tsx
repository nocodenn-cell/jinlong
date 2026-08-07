'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/forms'
import { DragonModal } from '@/components/ui/DragonModal'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { askConfirm } from '@/lib/ui/askConfirm'
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

  useEffect(() => {
    const t = setTimeout(() => document.getElementById('forn-nome')?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

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
    void (async () => {
      if (sujo()) {
        const ok = await askConfirm({
          title: m.fornecedores.confirmar_descartar,
          description: m.fornecedores.confirmar_descartar,
          variant: 'neutral',
        })
        if (!ok) return
      }
      onClose()
    })()
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

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={Building2}
      title={
        <>
          <span className="mb-1 block text-caption font-bold uppercase tracking-[0.14em] text-fg-subtle">
            {editando ? m.fornecedores.modal_editar_titulo : m.fornecedores.modal_novo_titulo} · 供应商
          </span>
          <span className="block truncate">
            {editando ? fornecedor!.nome : m.fornecedores.modal_novo_titulo}
          </span>
        </>
      }
      dismissable={!salvando}
      closeLabel={m.comum.fechar ?? 'Fechar'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={fechar} disabled={salvando}>
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="forn-form" variant="primary" disabled={salvando}>
            {salvando ? m.comum.carregando ?? '…' : editando ? m.fornecedores.modal_salvar : m.fornecedores.modal_cadastrar}
          </Button>
        </>
      }
    >
      <form id="forn-form" onSubmit={submeter} className="space-y-4 pb-1">
        <div>
          <span className="mb-1.5 block text-small font-medium text-fg-subtle">{m.fornecedores.tipo_label}</span>
          <div
            role="radiogroup"
            aria-label={m.fornecedores.tipo_label}
            className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-1"
          >
            {(['PJ', 'PF'] as const).map((t) => (
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
                {t === 'PJ' ? m.fornecedores.tipo_pj : m.fornecedores.tipo_pf}
              </button>
            ))}
          </div>
        </div>

        <Field
          id="forn-nome"
          label={tipo === 'PJ' ? m.fornecedores.field_razao_social : m.fornecedores.field_nome}
          required
          error={erros.nome ?? undefined}
        >
          <Input
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
            id="forn-doc"
            label={tipo === 'PF' ? m.fornecedores.field_cpf : m.fornecedores.field_cnpj}
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
          <Field id="forn-tel" label={m.fornecedores.field_telefone}>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="forn-email" label={m.fornecedores.field_email} error={erros.email ?? undefined}>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (erros.email) setErros((x) => ({ ...x, email: null }))
              }}
              disabled={salvando}
              placeholder="compras@fornecedor.com.br"
            />
          </Field>
          <Field id="forn-contato" label={m.fornecedores.field_contato}>
            <Input
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              disabled={salvando}
              placeholder={m.fornecedores.placeholder_contato}
            />
          </Field>
        </div>

        <Field id="forn-categoria" label={m.fornecedores.field_categoria}>
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={salvando}
            placeholder={m.fornecedores.placeholder_categoria}
          />
        </Field>

        <div className="mt-2 border-t border-dashed border-[var(--color-border)] pt-4">
          <div className="mb-3 flex items-center gap-2.5 text-caption font-bold uppercase tracking-[0.12em] text-fg-subtle">
            {m.fornecedores.section_endereco}
            <span className="text-small font-medium tracking-[0.08em] text-brand" style={{ fontFamily: 'var(--font-serif-han)' }}>
              地址
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_100px]">
            <Field id="forn-cep" label={m.fornecedores.field_cep} error={erros.cep ?? undefined}>
              <Input
                inputMode="numeric"
                value={cep}
                onChange={handleCep}
                disabled={salvando}
                placeholder="00000-000"
                className="font-mono tabular-nums"
              />
            </Field>
            <Field id="forn-logradouro" label={m.fornecedores.field_logradouro}>
              <Input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} disabled={salvando} />
            </Field>
            <Field id="forn-numero" label={m.fornecedores.field_numero}>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} disabled={salvando} />
            </Field>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="forn-complemento" label={m.fornecedores.field_complemento}>
              <Input value={complemento} onChange={(e) => setComplemento(e.target.value)} disabled={salvando} />
            </Field>
            <Field id="forn-bairro" label={m.fornecedores.field_bairro}>
              <Input value={bairro} onChange={(e) => setBairro(e.target.value)} disabled={salvando} />
            </Field>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <Field id="forn-cidade" label={m.fornecedores.field_cidade}>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={salvando} />
            </Field>
            <Field id="forn-uf" label={m.fornecedores.field_uf}>
              <Select value={uf} onChange={(e) => setUf(e.target.value)} disabled={salvando}>
                {UFs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </form>
    </DragonModal>
  )
}
