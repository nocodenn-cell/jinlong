import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'

/**
 * Loading institucional do painel admin (auditoria UX §1.4).
 *
 * Antes: bloco cinza vazio, que lia como tela travada/quebrada. Agora: o dragão
 * dourado da marca (金龙) em órbita + o caractere 福 (fú, "prosperidade") e o
 * texto "Carregando…". O texto explícito é proposital — evita que o símbolo
 * isolado pareça erro. Renderiza dentro do shell (sidebar persiste); só a área
 * de conteúdo mostra o loader durante a transição de rota.
 */
export function AdminRouteLoading() {
  return (
    <div
      className="flex min-h-[55vh] w-full flex-col items-center justify-center gap-3 px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <span
        className="select-none font-serif text-4xl leading-none text-[var(--color-dragon-gold-luxury,#d4af37)]"
        aria-hidden
      >
        福
      </span>
      <DragonOuroLoader iconClassName="h-7 w-7" />
      <span className="text-sm font-medium text-jl-fg-2">Carregando…</span>
    </div>
  )
}
