"use client"

import { memo } from "react"
import type { ItemCarrinho } from "@shared-core/src/stores/unifiedCartStore"

type Props = Readonly<{
  items: ItemCarrinho[]
  editable: boolean
  onCommand: (command: string, payload: { itemId: string; quantidade?: number }) => void
}>

function SaleListImpl({ items, editable, onCommand }: Props) {
  if (items.length === 0) {
    return (
      <div data-testid="sale-list-empty" className="py-8 text-center text-sm opacity-60">
        Nenhum item
      </div>
    )
  }

  return (
    <ul data-testid="sale-list" className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 py-2">
          <span className="flex-1">{item.nome}</span>
          <span data-testid={`sale-list-qtd-${item.id}`}>{item.quantidade}</span>
          {editable ? (
            <button
              type="button"
              aria-label={`Remover ${item.nome}`}
              onClick={() => onCommand("CMD_ITEM_REMOVE", { itemId: item.id })}
              className="text-sm underline"
            >
              remover
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export const SaleList = memo(SaleListImpl)
