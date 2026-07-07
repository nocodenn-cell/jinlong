'use client'

import type { Mensagens } from '@/i18n/getMessages'
import type { MoneyInputBag } from '@/hooks/useMoneyInput'
import { formatBRL } from '@/lib/format/money'

type Props = Readonly<{
  p: Mensagens['produtos']
  fornecedorId: string
  onChangeFornecedorId: (value: string) => void
  fornecedores: { id: string; nome: string }[]
  custoCompraInput: MoneyInputBag
  /** null quando produto ainda não foi salvo (custo médio só existe após compras). */
  custoMedio: number | null
  disabled: boolean
  inputClassName: string
  selectClassName: string
}>

/** Aba "Compra e custo": fornecedor + custo de compra são editáveis; custo médio é
 *  somente leitura (calculado pelas entradas de compra — sem lógica nova aqui). */
export function CompraCustoTab({
  p,
  fornecedorId,
  onChangeFornecedorId,
  fornecedores,
  custoCompraInput,
  custoMedio,
  disabled,
  inputClassName,
  selectClassName,
}: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-xs font-medium text-jl-fg-3">
        {p.fornecedor_principal_label}
        <select
          className={`${selectClassName} mt-1`}
          value={fornecedorId}
          onChange={(e) => onChangeFornecedorId(e.target.value)}
          disabled={disabled}
        >
          <option value="">{p.nenhum_fornecedor}</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-jl-fg-3">
        {p.custo_compra_label}
        <input
          type="text"
          inputMode="decimal"
          className={`${inputClassName} mt-1 font-mono`}
          value={custoCompraInput.display}
          onChange={custoCompraInput.onChange}
          disabled={disabled}
          placeholder="—"
        />
      </label>

      <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
        <p className="text-xs font-medium text-jl-fg-3">{p.custo_medio_label}</p>
        <p className="mt-1 text-sm font-medium text-jl-fg-1">
          {custoMedio !== null ? formatBRL(custoMedio) : '—'}
        </p>
        <p className="mt-0.5 text-[10px] text-jl-fg-3">{p.custo_medio_hint}</p>
      </div>
    </div>
  )
}
