"use client"

import { Skeleton, CaixaSkeletonRow, CaixaSkeletonCard, CaixaSkeletonHeader } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const dividerY = "divide-y divide-jl-border-1"
const tableHeaderRow =
  "grid grid-cols-[minmax(0,2.55fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 text-caption text-jl-fg-3 border-b border-jl-border-1"

export function CaixaCartListSkeleton({ isDesktop = false }: { isDesktop?: boolean }) {
  return (
    <div className="h-full min-h-[14rem] flex flex-col">
      {isDesktop ? (
        <div className="hidden md:block">
          <div className={tableHeaderRow} aria-hidden>
            <div className="h-4 rounded animate-pulse bg-[var(--color-surface-muted)]" />
            <div className="h-4 rounded animate-pulse bg-[var(--color-surface-muted)] ml-auto" />
            <div className="h-4 rounded animate-pulse bg-[var(--color-surface-muted)] ml-auto" />
            <div className="h-4 rounded animate-pulse bg-[var(--color-surface-muted)] ml-auto" />
            <div className="h-4 rounded animate-pulse bg-[var(--color-surface-muted)] ml-auto" />
          </div>
          <ul className={dividerY}>
            <CaixaSkeletonRow />
            <CaixaSkeletonRow />
            <CaixaSkeletonRow />
          </ul>
        </div>
      ) : (
        <ul className={`md:hidden ${dividerY}`}>
          <CaixaSkeletonCard />
          <CaixaSkeletonCard />
          <CaixaSkeletonCard />
        </ul>
      )}
    </div>
  )
}

export function CaixaSearchBarSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando busca">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Skeleton className="flex-1" height="2.75rem" />
        <div className="flex gap-2 sm:shrink-0">
          <Skeleton width="7rem" height="2.75rem" />
          <Skeleton width="5rem" height="2.75rem" />
        </div>
      </div>
      <Skeleton width="60%" height="1rem" variant="text" />
    </div>
  )
}

export function CaixaFooterSkeleton() {
  return (
    <footer
      className="shrink-0 border-t border-border bg-jl-surface-elev text-jl-fg-1 backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 shadow-sm"
      aria-busy="true"
      aria-label="Carregando rodapé do caixa"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between text-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton width="4rem" height="2.25rem" variant="rounded" />
            <Skeleton width="4rem" height="2.25rem" variant="rounded" />
            <Skeleton width="5rem" height="2.25rem" variant="rounded" />
            <Skeleton width="5rem" height="2.25rem" variant="rounded" />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-4 sm:gap-6 md:gap-8">
          <div className="text-right text-caption text-jl-fg-3">
            <Skeleton width="3rem" height="0.875rem" variant="text" className="ml-auto" />
            <Skeleton width="4rem" height="1.25rem" variant="text" className="ml-auto mt-1" />
          </div>
          <div className="text-right text-caption text-jl-fg-2">
            <Skeleton width="4rem" height="0.875rem" variant="text" className="ml-auto" />
            <Skeleton width="4rem" height="1.25rem" variant="text" className="ml-auto mt-1" />
          </div>
          <div className="text-right min-w-[7rem]">
            <Skeleton width="5rem" height="0.875rem" variant="text" className="ml-auto" />
            <Skeleton width="6rem" height="1.5rem" variant="text" className="ml-auto mt-1" />
          </div>
        </div>
      </div>
    </footer>
  )
}

export function CaixaHeaderSkeleton() {
  return (
    <header
      className="shrink-0 px-4 sm:px-6 py-3 border-b border-jl-border-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between bg-jl-surface-soft"
      aria-busy="true"
      aria-label="Carregando cabeçalho do caixa"
    >
      <CaixaSkeletonHeader />
      <div className="text-caption text-jl-fg-3 sm:text-right sm:max-w-xl min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Skeleton width="6rem" height="2rem" variant="rounded" />
        </div>
        <Skeleton width="12rem" height="0.875rem" variant="text" className="mt-1" />
        <Skeleton width="8rem" height="0.875rem" variant="text" className="mt-1" />
        <Skeleton width="10rem" height="0.75rem" variant="text" className="mt-2" />
      </div>
    </header>
  )
}

/** Exemplo de atalhos com `title` nativo (tooltips DS reativados quando estável). */
export function CaixaButtonsWithTooltips() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" title="Adicionar dinheiro ao caixa (Ctrl+Shift+S)">
        Suprimento (+)
      </Button>
      <Button variant="destructive" title="Retirar dinheiro do caixa (Ctrl+Shift+R)">
        Sangria (-)
      </Button>
      <Button variant="outline" title="Validar senha de gerente para aplicar descontos">
        Validar Gerente
      </Button>
      <Button variant="default" title="Finalizar venda (F4)">
        Finalizar Venda
      </Button>
    </div>
  )
}

export function CaixaPageSkeleton() {
  return (
    <div className="min-h-[100dvh] caixa-oriental-root flex flex-col" aria-busy="true" aria-label="Carregando caixa">
      <CaixaHeaderSkeleton />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 px-4 sm:px-6 pt-4 pb-2 space-y-3">
          <CaixaSearchBarSkeleton />
          <Skeleton className="w-full" height="1.5rem" variant="rounded" />
        </div>
        <section className="flex-1 min-h-0 flex flex-col mx-4 sm:mx-6 rounded-lg border border-jl-border-1 overflow-hidden mb-2 bg-jl-surface-elev">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <CaixaCartListSkeleton isDesktop={true} />
          </div>
        </section>
      </div>
      <CaixaFooterSkeleton />
    </div>
  )
}
