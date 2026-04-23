/**
 * Dragão minimalista (stroke) — tema "Digital Dragon" / guardião do saldo no caixa.
 * `currentColor` permite âmbar, jade ou slate via className Tailwind.
 */
export function DragonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 2C12 2 14.5 3 16 5M16 5C17.5 7 17.5 10 16 12C14.5 14 12 15 10 15C8 15 5 14 3 11M16 5L21 3M10 15C8 15 6 17 6 19C6 21 8 22 10 22C12 22 15 21 17 18M10 15L7 12M17 18L21 21M17 18L19 15" />
      <circle cx="9" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
