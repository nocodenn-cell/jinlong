'use client'

/**
 * Toolbar de filtros do Catálogo — composição local sobre FilterBar.
 * Não altera o default do FilterBar: busca + pills sempre visíveis;
 * selects avançados ficam atrás de “Mais filtros” (abertos se já houver filtro ativo).
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { Button } from '@/components/ui/button'

type Props = Readonly<{
  primaryFilters: FilterDef[]
  advancedFilters: FilterDef[]
  advancedActive: boolean
  maisFiltrosLabel: string
  menosFiltrosLabel: string
  clearLabel: string
  filtrosAriaLabel: string
  limparAriaLabel: string
}>

export function CatalogoFiltrosBar({
  primaryFilters,
  advancedFilters,
  advancedActive,
  maisFiltrosLabel,
  menosFiltrosLabel,
  clearLabel,
  filtrosAriaLabel,
  limparAriaLabel,
}: Props) {
  const [open, setOpen] = useState(advancedActive)

  useEffect(() => {
    if (advancedActive) setOpen(true)
  }, [advancedActive])

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar
          layout="grid"
          filters={primaryFilters}
          extraClearKeys={advancedFilters.map((filter) => filter.key)}
          resetPageOnChange
          clearLabel={clearLabel}
          ariaLabel={filtrosAriaLabel}
          clearAriaLabel={limparAriaLabel}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-caption text-fg-subtle"
          aria-expanded={open}
          aria-controls="catalogo-filtros-avancados"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? menosFiltrosLabel : maisFiltrosLabel}
          {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </Button>
      </div>

      {open ? (
        <div id="catalogo-filtros-avancados">
          <FilterBar
            layout="grid"
            filters={advancedFilters}
            resetPageOnChange
            clearable={false}
            ariaLabel={filtrosAriaLabel}
            clearAriaLabel={limparAriaLabel}
            className="w-full"
          />
        </div>
      ) : null}
    </div>
  )
}
