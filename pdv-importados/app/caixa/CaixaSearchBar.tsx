"use client"

import type { FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/src/lib/i18n/getMessages"

type Props = {
  m: Mensagens
  codigo: string
  onCodigoChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onNovoCupom: () => void
  buscando: boolean
  carregandoRegras: boolean
}

export function CaixaSearchBar({
  m,
  codigo,
  onCodigoChange,
  onSubmit,
  onNovoCupom,
  buscando,
  carregandoRegras,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      <Input
        autoFocus
        value={codigo}
        onChange={(e) => onCodigoChange(e.target.value)}
        placeholder={m.caixa.busca_placeholder}
        aria-label={m.caixa.busca_placeholder}
        disabled={buscando || carregandoRegras}
        className="flex-1 bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
      />
      <div className="flex gap-2 sm:shrink-0">
        <Button
          type="submit"
          disabled={buscando || carregandoRegras}
          aria-busy={buscando}
          className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {buscando ? m.caixa.buscando : m.caixa.adicionar_enter}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onNovoCupom}
          className="flex-1 sm:flex-none bg-slate-700 text-slate-100 hover:bg-slate-600 border-0"
        >
          {m.caixa.novo_cupom}
        </Button>
      </div>
    </form>
  )
}
