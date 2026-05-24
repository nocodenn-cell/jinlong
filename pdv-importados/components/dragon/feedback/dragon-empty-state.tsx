import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  icon?: ReactNode
  title: string
  description?: string
  /** Botão de ação ou shortcut hint. */
  action?: ReactNode
  className?: string
  /** compact: padding reduzido para uso dentro de painéis. */
  size?: "default" | "compact"
}

/**
 * Estado vazio canônico Dragon UI.
 *
 * Substitui os 49 empty states ad-hoc identificados na auditoria.
 * Garante ícone centralizado, hierarquia textual e espaçamento consistente.
 */
export function DragonEmptyState({ icon, title, description, action, className, size = "default" }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "default" ? "gap-3 py-12 px-6" : "gap-2 py-6 px-4",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "shrink-0 text-foreground/20",
            size === "default" ? "[&_svg]:h-16 [&_svg]:w-16" : "[&_svg]:h-10 [&_svg]:w-10",
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <p
        className={cn(
          "font-semibold text-foreground/50",
          size === "default" ? "text-base" : "text-sm",
        )}
      >
        {title}
      </p>
      {description && (
        <p className="max-w-[22rem] text-sm leading-relaxed text-foreground/35">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
