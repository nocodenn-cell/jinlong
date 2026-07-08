'use client'

type Props = Readonly<{
  title: string
}>

export function ProdutoFormSectionHeading({ title }: Props) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-0">
      <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-jl-accent">
        {title}
      </p>
      <div className="h-px flex-1 bg-[var(--color-border-secondary)]" aria-hidden />
    </div>
  )
}
