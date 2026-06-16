/**
 * FastProduct — StockAlertBadge
 *
 * Badge numérico somente leitura para contagem de itens em estoque baixo
 * (fonte: view `v_estoque_baixo`). Não recalcula nada — apenas exibe a
 * contagem recebida via prop. Controlado por `pdv_config.show_stock_alerts`.
 */

export function StockAlertBadge({ count }: { count: number }) {
  if (count <= 0) return null

  return (
    <span
      className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-400"
      title="Itens com estoque baixo"
    >
      {count}
    </span>
  )
}
