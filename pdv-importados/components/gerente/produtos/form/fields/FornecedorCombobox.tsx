'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { FornecedorEditarModal } from '@/app/gerente/fornecedores/FornecedorEditarModal'
import type { FornecedorListRow } from '@/app/gerente/fornecedores/actions'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { Mensagens } from '@/i18n/getMessages'
import { Button } from '@/components/ui/button'

type Props = Readonly<{
  p: Mensagens['produtos']
  fornecedores: { id: string; nome: string }[]
  value: string
  onChange: (id: string) => void
  onFornecedoresChange?: (fornecedores: { id: string; nome: string }[]) => void
  disabled: boolean
  selectClassName: string
  idioma: Idioma
}>

export function FornecedorCombobox({
  p,
  fornecedores,
  value,
  onChange,
  onFornecedoresChange,
  disabled,
  selectClassName,
  idioma,
}: Props) {
  const [filtro, setFiltro] = useState('')
  const [modalNovo, setModalNovo] = useState(false)

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return fornecedores
    return fornecedores.filter((f) => f.nome.toLowerCase().includes(q))
  }, [fornecedores, filtro])

  const onFornecedorCriado = (f: FornecedorListRow) => {
    const next = [...fornecedores, { id: f.id, nome: f.nome }]
    onFornecedoresChange?.(next)
    onChange(f.id)
    setModalNovo(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="search"
          className={`${selectClassName} flex-1`}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          disabled={disabled}
          placeholder={p.fornecedor_busca_placeholder}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 px-2"
          disabled={disabled}
          title={p.novo_fornecedor}
          aria-label={p.novo_fornecedor}
          onClick={() => setModalNovo(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <select
        className={`${selectClassName} mt-0`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{p.nenhum_fornecedor}</option>
        {filtrados.map((f) => (
          <option key={f.id} value={f.id}>{f.nome}</option>
        ))}
      </select>
      {modalNovo ? (
        <FornecedorEditarModal
          idioma={idioma}
          fornecedor={null}
          onClose={() => setModalNovo(false)}
          onSalvo={onFornecedorCriado}
        />
      ) : null}
    </div>
  )
}
