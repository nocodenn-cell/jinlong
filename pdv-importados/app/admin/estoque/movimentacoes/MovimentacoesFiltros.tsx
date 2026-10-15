'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'

type Labels = {
  busca: string
  periodo: string
  de: string
  ate: string
  tipo: string
  todosTipos: string
  todos: string
  entradas: string
  saidas: string
  limpar: string
  regiao: string
  limparAria: string
}

type Props = {
  labels: Labels
  tipos: ReadonlyArray<{ value: string; label: string }>
}

export function MovimentacoesFiltros({ labels, tipos }: Props) {
  const busca: FilterDef = {
    type: 'search',
    key: 'q',
    placeholder: labels.busca,
    className: 'w-full min-w-0 basis-full',
    inputClassName: 'w-full min-w-0',
  }
  const tipo: FilterDef = {
    type: 'select',
    key: 'tipo',
    label: labels.tipo,
    showLabel: true,
    defaultValue: '',
    options: [{ value: '', label: labels.todosTipos }, ...tipos],
  }
  const sentido: FilterDef = {
    type: 'pills',
    key: 'sentido',
    defaultValue: '',
    options: [
      { value: '', label: labels.todos },
      { value: 'entrada', label: labels.entradas },
      { value: 'saida', label: labels.saidas },
    ],
  }

  return (
    <div
      className="flex w-full min-w-0 basis-full flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      data-testid="mov-filtros"
    >
      <FilterBar
        filters={[busca]}
        clearable={false}
        resetPageOnChange
        ariaLabel={labels.regiao}
        className="w-full"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,16rem)] lg:items-end">
        <p className="text-caption font-medium text-fg-subtle sm:col-span-2 lg:col-span-3">{labels.periodo}</p>
        <CampoDia label={labels.de} param="de" />
        <CampoDia label={labels.ate} param="ate" />
        <FilterBar filters={[tipo]} clearable={false} resetPageOnChange ariaLabel={labels.tipo} />
      </div>
      <FilterBar
        filters={[sentido]}
        resetPageOnChange
        ariaLabel={labels.regiao}
        clearAriaLabel={labels.limparAria}
        clearLabel={labels.limpar}
        extraClearKeys={['q', 'de', 'ate', 'tipo']}
      />
    </div>
  )
}

function CampoDia({ label, param }: { label: string; param: 'de' | 'ate' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const valor = searchParams.get(param) ?? ''

  function gravar(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set(param, next)
    else params.delete(param)
    params.delete('page')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <label className="grid gap-1 text-caption font-medium text-fg-subtle">
      {label}
      <input
        type="date"
        value={valor}
        aria-label={label}
        onChange={(event) => gravar(event.target.value)}
        className="fp-control min-h-11 w-full"
      />
    </label>
  )
}
