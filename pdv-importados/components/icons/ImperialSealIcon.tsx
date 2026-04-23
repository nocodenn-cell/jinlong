type Props = {
  className?: string
  /** Texto curto para leitores de tela quando o ícone carrega significado sozinho */
  title?: string
  /** Pulso leve — autoridade do gerente necessária */
  pulse?: boolean
}

/**
 * Selo estilo chop (vermelho imperial) — aprovação gerente / movimentação aprovada.
 */
export function ImperialSealIcon({ className, title, pulse }: Props) {
  const svg = (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <rect
        x="5"
        y="5"
        width="22"
        height="22"
        rx="1.5"
        fill="currentColor"
        fillOpacity={0.12}
        stroke="currentColor"
        strokeWidth="1.35"
        transform="rotate(-7 16 16)"
      />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontSize="13"
        fill="currentColor"
        fontFamily="ui-serif, 'Noto Serif SC', 'Songti SC', SimSun, serif"
        transform="rotate(-7 16 16)"
      >
        印
      </text>
    </svg>
  )

  if (pulse) {
    return <span className="inline-flex imperial-seal-pulse">{svg}</span>
  }

  return svg
}
