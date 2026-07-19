import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { resolveSsotDeepLink } from '@/lib/admin/intelligence/resolveSsotDeepLink'

type Props = {
  hint: string | null | undefined
  label?: string
}

/** Link SSoT — só renderiza se o hint for rota oficial validada. */
export function SsotDeepLink({ hint, label = 'Abrir módulo' }: Props) {
  const href = resolveSsotDeepLink(hint)
  if (!href) return null
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-caption font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
    >
      {label}
      <ExternalLink className="size-3.5" aria-hidden />
    </Link>
  )
}
