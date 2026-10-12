'use client'

import type { Mensagens } from '@/i18n/getMessages'
import { formatDecimalBRL } from '@/lib/format/money'
import type { PedidoPalmCard } from '@/app/palm/domain/tiposPalm'

type Props = {
  m: Mensagens
  pedidos: PedidoPalmCard[]
  carregando: boolean
  disabled: boolean
  onAssumir: (id: string) => void
  onAtualizar: () => void
}

export function PalmPedidosCaixaSection({ m, pedidos, carregando, disabled, onAssumir, onAtualizar }: Props) {
  return (
    <div className="border-t pt-2" data-testid="palm-pedidos-caixa">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.palm.caixa_secao}</p>
        <button type="button" className="min-h-11 text-xs underline" onClick={onAtualizar} disabled={disabled}>
          {m.palm.buscar}
        </button>
      </div>
      {carregando ? <p className="text-sm text-muted-foreground">{m.comum.carregando}</p> : null}
      {!carregando && pedidos.length === 0 ? <p className="text-sm text-muted-foreground">{m.palm.caixa_vazio}</p> : null}
      <ul className="mt-1 flex flex-col gap-2">
        {pedidos.map((pedido) => (
          <li key={pedido.id} className="rounded-md border border-dashed border-border p-2">
            <p className="text-sm font-semibold">
              #{pedido.numeroLocal} · {m.palm.moeda} {formatDecimalBRL(pedido.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              {pedido.vendedorNome ?? '—'} · {pedido.qtdItens}
            </p>
            <button
              type="button"
              disabled={disabled}
              className="mt-1 min-h-11 w-full rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
              onClick={() => onAssumir(pedido.id)}
            >
              {m.palm.caixa_assumir}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
