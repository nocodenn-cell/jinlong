"use client"

import { forwardRef, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { DragonOuroLoader } from "@/components/branding/DragonOuroLoader"

type CategoriaChip = { id: string; nome: string }

type Props = {
  m: Mensagens
  codigo: string
  onCodigoChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onNovoCupom: () => void
  buscando: boolean
  carregandoRegras: boolean
  categoriasAtalho?: CategoriaChip[]
  somAtivo: boolean
  onToggleSom: () => void
}

export const CaixaSearchBar = forwardRef<HTMLInputElement, Props>(function CaixaSearchBar(
  {
    m,
    codigo,
    onCodigoChange,
    onSubmit,
    onNovoCupom,
    buscando,
    carregandoRegras,
    categoriasAtalho = [],
    somAtivo,
    onToggleSom,
  },
  ref,
) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold text-foreground/95">
          {m.caixa.busca_label_principal}
        </label>
        <button
          type="button"
          onClick={onToggleSom}
          className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground/90 hover:bg-accent"
        >
          {somAtivo ? m.caixa.som_feedback_ligado : m.caixa.som_feedback_desligado}
        </button>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Input
          ref={ref}
          autoFocus
          value={codigo}
          onChange={(e) => onCodigoChange(e.target.value)}
          placeholder={m.caixa.busca_placeholder}
          aria-label={m.caixa.busca_placeholder}
          disabled={buscando || carregandoRegras}
          className="flex-1 bg-background border-2 border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.25)] text-foreground placeholder:text-foreground/70 rounded-md px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-300"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              onCodigoChange("")
            }
          }}
        />
        <div className="flex gap-2 sm:shrink-0">
          <Button
            type="submit"
            disabled={buscando || carregandoRegras}
            aria-busy={buscando}
            className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 min-w-[7rem] bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-base font-semibold transition-colors"
          >
            {buscando ? (
              <>
                <DragonOuroLoader iconClassName="h-4 w-4" />
                {m.caixa.buscando}
              </>
            ) : (
              m.caixa.adicionar_enter
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onNovoCupom}
            className="flex-1 sm:flex-none bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 rounded-md px-3 py-2 text-base font-semibold transition-colors"
          >
            {m.caixa.novo_cupom}
          </Button>
        </div>
      </form>
      <p className="text-sm text-foreground/85 leading-snug">{m.caixa.busca_dica}</p>
      {categoriasAtalho.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {m.caixa.atalhos_categoria}
          </p>
          <div className="flex flex-wrap gap-2">
            {categoriasAtalho.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={buscando || carregandoRegras}
                onClick={() => onCodigoChange(c.nome)}
                title={c.nome}
                className="min-h-9 shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

CaixaSearchBar.displayName = "CaixaSearchBar"
