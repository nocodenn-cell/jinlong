/** Arte principal imperial em amarelo com fundo transparente. */
const OUROBOROS_SRC = '/branding/dragon-imperial-amber.png'

/**
 * Emblema Jīn Lóng com fundo transparente.
 * Paleta: traços em `#fde047`.
 */
export function DragonEmblemIcon({
  className,
  title,
}: Readonly<{
  className?: string
  title?: string
}>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <image href={OUROBOROS_SRC} x="0" y="0" width="80" height="80" preserveAspectRatio="xMidYMid meet" />
    </svg>
  )
}

