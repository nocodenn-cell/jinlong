'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/forms'
import { DragonModal } from '@/components/ui/DragonModal'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { salvarFornecedorAction, type FornecedorInput, type FornecedorListRow } from './actions'
import { maskCnpj } from './fornecedoresListUi'
import { normalizarCnpj } from './fornecedorContrato'

type Props = Readonly<{
  idioma: Idioma
  fornecedor: FornecedorListRow | null
  onClose: () => void
  onSalvo: (f: FornecedorListRow) => void
}>

export function FornecedorEditarModal({ idioma, fornecedor, onClose, onSalvo }: Props) {
  const m = getMessages(idioma)
  const editando = !!fornecedor

  const [nome, setNome] = useState(fornecedor?.nome ?? '')
  const [cnpj, setCnpj] = useState(fornecedor ? maskCnpj(fornecedor.cnpj) : '')
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => document.getElementById('forn-nome')?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  function sujo(): boolean {
    if (!editando) return !!(nome || cnpj)
    return (
      nome !== fornecedor!.nome || normalizarCnpj(cnpj) !== fornecedor!.cnpj
    )
  }

  const fechar = useCallback(() => {
    if (sujo() && !confirm(m.fornecedores.confirmar_descartar)) return
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sujo lê estado atual do form
  }, [nome, cnpj, fornecedor, onClose, m])

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!nome.trim()) e.nome = m.fornecedores.err_nome_obrigatorio
    else if (nome.trim().length < 2) e.nome = m.fornecedores.err_nome_curto
    const digits = normalizarCnpj(cnpj)
    if (!digits) e.cnpj = m.fornecedores.err_doc_obrigatorio
    else if (digits.length !== 14) e.cnpj = m.fornecedores.err_cnpj_invalido
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    const input: FornecedorInput = {
      id: fornecedor?.id,
      nome: nome.trim(),
      cnpj: normalizarCnpj(cnpj),
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

  const titulo = editando ? m.fornecedores.modal_editar_titulo : m.fornecedores.modal_novo_titulo

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="sm"
      icon={Building2}
      title={editando ? fornecedor!.nome : titulo}
      dismissable={!salvando}
      closeLabel={m.comum.fechar ?? 'Fechar'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={fechar} disabled={salvando}>
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="forn-form" variant="primary" disabled={salvando}>
            {salvando
              ? (m.comum.carregando ?? '…')
              : editando
                ? m.fornecedores.modal_salvar
                : m.fornecedores.modal_cadastrar}
          </Button>
        </>
      }
    >
      <form id="forn-form" onSubmit={submeter} className="space-y-4 pb-1">
        <Field
          id="forn-nome"
          label={m.fornecedores.field_razao_social}
          required
          error={erros.nome ?? undefined}
        >
          <Input
            value={nome}
            onChange={(ev) => {
              setNome(ev.target.value)
              if (erros.nome) setErros((x) => ({ ...x, nome: null }))
            }}
            disabled={salvando}
            required
            maxLength={120}
          />
        </Field>

        <Field
          id="forn-cnpj"
          label={m.fornecedores.field_cnpj}
          required
          error={erros.cnpj ?? undefined}
        >
          <Input
            inputMode="numeric"
            value={cnpj}
            onChange={(ev) => {
              setCnpj(maskCnpj(ev.target.value))
              if (erros.cnpj) setErros((x) => ({ ...x, cnpj: null }))
            }}
            disabled={salvando}
            required
            placeholder="00.000.000/0000-00"
            className="font-mono"
          />
        </Field>
      </form>
    </DragonModal>
  )
}
