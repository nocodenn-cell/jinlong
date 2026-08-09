'use client'

/**
 * Toolbar de filtros do Catálogo — composição local sobre FilterBar.
 * Limpar é local e remove primary + advanced + page (evita regressão do split).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { FilterBar, type FilterBarAriaLabels, type FilterDef } from '@/components/ui/FilterBar'
import { Button } from '@/components/ui/button'

type Props = Readonly<{
  primaryFilters: FilterDef[]
  advancedFilters: FilterDef[]
  advancedActive: boolean
  maisFiltrosLabel: string
  menosFiltrosLabel: string
  clearLabel: string
  ariaLabels?: FilterBarAriaLabels
}>

function filterIsActive(
  filter: FilterDef,
  searchParams: URLSearchParams,
): boolean {
  const current = searchParams.get(filter.key)
  if (current === null) return false
  if (filter.type !== 'search' && current === filter.defaultValue) return false
  return current.length > 0
}

export function CatalogoFiltrosBar({
  primaryFilters,
  advancedFilters,
  advancedActive,
  maisFiltrosLabel,
  menosFiltrosLabel,
  clearLabel,
  ariaLabels,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(advancedActive)

  useEffect(() => {
    if (advancedActive) setOpen(true)
  }, [advancedActive])

  const allFilters = useMemo(
    () => [...primaryFilters, ...advancedFilters],
    [primaryFilters, advancedFilters],
  )

  const hasAnyActive = useMemo(
    () => allFilters.some((f) => filterIsActive(f, searchParams)),
    [allFilters, searchParams],
  )

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    for (const f of allFilters) params.delete(f.key)
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [allFilters, searchParams, router, pathname])

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar
          filters={primaryFilters}
          resetPageOnChange
          clearable={false}
          className="min-w-0 flex-1"
          ariaLabels={ariaLabels}
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
        {hasAnyActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            aria-label={clearLabel}
            className="gap-1 text-caption text-fg-subtle"
          >
            <X size={12} strokeWidth={2.5} aria-hidden />
            {clearLabel}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div id="catalogo-filtros-avancados">
          <FilterBar
            filters={advancedFilters}
            resetPageOnChange
            clearable={false}
            className="w-full"
            ariaLabels={ariaLabels}
          />
        </div>
      ) : null}
    </div>
  )
}
