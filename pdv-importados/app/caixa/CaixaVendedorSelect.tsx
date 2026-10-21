"use client"

import type { VendedorOpcao } from "@/app/caixa/caixaVendedor"

type Props = {
  label: string
  operadorSufixo: string
  operadorId: string | null
  vendedores: readonly VendedorOpcao[]
  value: string | null
  onChange: (id: string) => void
  disabled?: boolean
}

/** "Vendedor / 销售员" — quem atendeu recebe a comissão. Some quando a loja tem só o operador. */
export function CaixaVendedorSelect({ label, operadorSufixo, operadorId, vendedores, value, onChange, disabled }: Props) {
  if (!operadorId || vendedores.length < 2) return null
  return (
    <label className="flex items-center gap-2 text-sm text-jl-fg-2" data-testid="caixa-vendedor">
      <span className="shrink-0 font-semibold">{label}</span>
      <select
        className="min-h-9 w-full rounded-md border border-jl-border-1 bg-jl-surface px-2 text-jl-fg-1"
        value={value ?? operadorId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        data-testid="caixa-vendedor-select"
      >
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>
            {v.id === operadorId ? `${v.nome} ${operadorSufixo}` : v.nome}
          </option>
        ))}
      </select>
    </label>
  )
}
