'use client'

/**
 * Lookup de produto do recebimento — adapta EntityLookup (IX-LOOKUP).
 * Mantém `input[name=produto_id]` para o submit do formulário existente.
 */

import { useCallback, useState } from 'react'
import { EntityLookup, type EntityLookupOption } from '@/components/ui/forms'
import {
  buscarProdutosRecebimento,
  type RecebimentoProdutoBusca,
} from './actions'

type Props = Readonly<{
  disabled?: boolean
  placeholder: string
  semResultadosLabel: string
  minimoLabel: string
  limparLabel: string
}>

function toOption(p: RecebimentoProdutoBusca): EntityLookupOption {
  return {
    value: p.id,
    label: p.codigo_barras ? `${p.nome} · ${p.codigo_barras}` : p.nome,
    description: p.codigo_barras ?? undefined,
  }
}

export function ProdutoRecebimentoAutocomplete({
  disabled,
  placeholder,
  semResultadosLabel,
  minimoLabel,
  limparLabel,
}: Props) {
  const [value, setValue] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>()

  const onSearch = useCallback(async (query: string): Promise<EntityLookupOption[]> => {
    const r = await buscarProdutosRecebimento(query)
    if (!r.success) return []
    return r.data.map(toOption)
  }, [])

  return (
    <div>
      <input type="hidden" name="produto_id" value={value ?? ''} readOnly />
      <EntityLookup
        value={value}
        selectedLabel={selectedLabel}
        onSelect={(opt) => {
          setValue(opt?.value ?? null)
          setSelectedLabel(opt?.label)
        }}
        onSearch={onSearch}
        disabled={disabled}
        placeholder={placeholder}
        emptyLabel={semResultadosLabel}
        minCharsLabel={minimoLabel}
        clearLabel={limparLabel}
        minChars={2}
        debounceMs={260}
        aria-label={placeholder}
      />
    </div>
  )
}
