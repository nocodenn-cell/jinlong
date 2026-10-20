import type { ReactNode } from 'react'

/** Ícones no traço do lucide (mesmo conjunto do Venddi), inline para não adicionar dependência. */
function Svg({ size, className, children }: { size: number; className?: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  )
}

type P = { size?: number; className?: string }

export const IconCart = ({ size = 24, className }: P) => (
  <Svg size={size} className={className}>
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </Svg>
)
export const IconPackage = ({ size = 24, className }: P) => (
  <Svg size={size} className={className}>
    <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
    <path d="M12 22V12" />
    <path d="m3.3 7 7.7 4.4a2 2 0 0 0 2 0L20.7 7" />
    <path d="m7.5 4.27 9 5.15" />
  </Svg>
)
export const IconTrend = ({ size = 24, className }: P) => (
  <Svg size={size} className={className}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </Svg>
)
export const IconTag = ({ size = 24, className }: P) => (
  <Svg size={size} className={className}>
    <path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
  </Svg>
)
export const IconLanguages = ({ size = 24, className }: P) => (
  <Svg size={size} className={className}>
    <path d="m5 8 6 6" />
    <path d="m4 14 6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" />
    <path d="M14 18h6" />
  </Svg>
)
export const IconZap = ({ size = 16, className }: P) => (
  <Svg size={size} className={className}>
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </Svg>
)
export const IconArrowRight = ({ size = 16, className }: P) => (
  <Svg size={size} className={className}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
)
export const IconCheckCircle = ({ size = 16, className }: P) => (
  <Svg size={size} className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
)
