'use client'
import { usePathname, useRouter } from 'next/navigation'

export function SeletorMes({ competencia, rotulo }: { competencia: string; rotulo: string }) {
  const router = useRouter()
  const path = usePathname()
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-semibold">{rotulo}</span>
      <input
        type="month"
        value={competencia}
        data-testid="comissao-mes"
        className="rounded-md border border-jl-border-1 bg-jl-surface px-2 py-1"
        onChange={(e) => e.target.value && router.push(`${path}?mes=${e.target.value}`)}
      />
    </label>
  )
}
