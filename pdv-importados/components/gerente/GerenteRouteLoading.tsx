/**
 * Loader de rota do gerente.
 *
 * Antes: ghost-table estático (linhas cinzas paradas) que lia como "tabela
 * quebrada" e passava impressão de bug. Agora: loader central limpo com a marca
 * (祿) + barra indeterminada varrendo — claramente "carregando", on-brand e sem
 * listras. Os nomes de export antigos são mantidos como aliases para não quebrar
 * os vários `loading.tsx` que já os importam.
 */

export function GerenteRouteLoader() {
  return (
    <div
      className="flex min-h-[42vh] w-full items-center justify-center px-4 py-10"
      role="status"
      aria-label="Carregando"
    >
      <div className="flex flex-col items-center gap-4">
        <span
          className="gerente-loader-mark select-none font-serif text-5xl leading-none text-amber-400/85"
          aria-hidden
        >
          祿
        </span>
        <span className="block h-[3px] w-28 overflow-hidden rounded-full bg-white/[0.07]">
          <span className="gerente-loader-sweep block h-full w-1/2 rounded-full bg-amber-400/80" />
        </span>
      </div>
    </div>
  )
}

/* ── Aliases retrocompatíveis (todos renderizam o mesmo loader) ───────────── */

export function GerenteSegmentRouteSkeleton() {
  return <GerenteRouteLoader />
}

export function GerenteListPageRouteSkeleton(_props?: { cols?: number[]; rows?: number }) {
  return <GerenteRouteLoader />
}

export function GerenteTableRouteSkeleton(_props?: { cols?: number[]; rows?: number }) {
  return <GerenteRouteLoader />
}
