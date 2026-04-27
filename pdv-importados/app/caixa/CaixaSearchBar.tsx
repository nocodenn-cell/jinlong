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
  },
  ref,
) {
  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Input
          ref={ref}
          autoFocus
          value={codigo}
          onChange={(e) => onCodigoChange(e.target.value)}
          placeholder={m.caixa.busca_placeholder}
          aria-label={m.caixa.busca_placeholder}
          disabled={buscando || carregandoRegras}
          className="flex-1 app-input"
        />
        <div className="flex gap-2 sm:shrink-0">
          <Button
            type="submit"
            disabled={buscando || carregandoRegras}
            aria-busy={buscando}
            className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 min-w-[7rem] app-btn-accent"
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
            className="flex-1 sm:flex-none app-btn-neutral"
          >
            {m.caixa.novo_cupom}
          </Button>
        </div>
      </form>
      <p className="text-[11px] app-subtle leading-snug">{m.caixa.busca_dica}</p>
      {categoriasAtalho.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide app-subtle">
            {m.caixa.atalhos_categoria}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categoriasAtalho.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={buscando || carregandoRegras}
                onClick={() => onCodigoChange(c.nome)}
                className="rounded-full border px-2.5 py-0.5 text-[11px] app-chip disabled:opacity-50"
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
