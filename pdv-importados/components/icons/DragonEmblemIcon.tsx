/** Arte ouroboros raster, recortada em círculo (sem máscara SVG). */
const OUROBOROS_SRC = '/branding/dragon-ouroboros-mark.png'

/**
 * Emblema ouroboros — mesma silhueta da referência (PNG em `public/branding`).
 * Paleta: fundo `#0f172a`, traço fino e dragão `#fde047`.
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
      <defs>
        <clipPath id="dragon-ouroboros-clip">
          <circle cx="40" cy="40" r="36" />
        </clipPath>
      </defs>
      <circle cx="40" cy="40" r="38" fill="#0f172a" stroke="#fde047" strokeWidth="1.2" />
      <g clipPath="url(#dragon-ouroboros-clip)">
        <image href={OUROBOROS_SRC} x="0" y="0" width="80" height="80" preserveAspectRatio="xMidYMid meet" />
      </g>
    </svg>
  )
}

