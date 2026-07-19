import * as React from "react"
import { cn } from "@/lib/utils"

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Largura do skeleton (pode ser string com unidades ou número) */
  width?: string | number
  /** Altura do skeleton (pode ser string com unidades ou número) */
  height?: string | number
  /** Formato do skeleton */
  variant?: "default" | "text" | "circular" | "rounded"
  /** Se deve animar */
  animate?: boolean
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, width, height, variant = "default", animate = true, ...props }, ref) => {
    const variantClasses = {
      default: "rounded-control",
      text: "rounded-sm",
      circular: "rounded-full",
      rounded: "rounded-card",
    }

    const style: React.CSSProperties = {
      ...props.style,
      ...(width && { width }),
      ...(height && { height }),
    }

    return (
      <div
        ref={ref}
        className={cn(
          "shrink-0 bg-[var(--color-surface-muted)]",
          variantClasses[variant],
          animate && "animate-pulse",
          className,
        )}
        style={style}
        aria-hidden
        {...props}
      />
    )
  }
)
Skeleton.displayName = "Skeleton"

export { Skeleton }

// Componentes específicos para o caixa
export function CaixaSkeletonRow() {
  return (
    <div className="grid grid-cols-[minmax(0,2.55fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 items-center">
      <div className="flex flex-col min-w-0 gap-1">
        <Skeleton width="60%" height="1rem" variant="text" />
        <Skeleton width="40%" height="0.75rem" variant="text" />
        <Skeleton width="30%" height="0.875rem" variant="text" />
      </div>
      <div className="flex items-center justify-end gap-1">
        <Skeleton width="3rem" height="2rem" variant="rounded" />
        <Skeleton width="2rem" height="2rem" variant="rounded" />
      </div>
      <Skeleton width="4rem" height="1rem" variant="text" />
      <Skeleton width="4.5rem" height="1rem" variant="text" />
      <Skeleton width="3rem" height="1.5rem" variant="rounded" />
    </div>
  )
}

export function CaixaSkeletonCard() {
  return (
    <div className="p-3 space-y-2">
      <div className="flex justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton width="70%" height="0.875rem" variant="text" />
          <Skeleton width="50%" height="0.75rem" variant="text" />
          <Skeleton width="35%" height="0.8125rem" variant="text" />
        </div>
        <Skeleton width="2.5rem" height="1.25rem" variant="rounded" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <Skeleton width="2rem" height="0.75rem" variant="text" />
          <div className="flex items-center gap-2 mt-0.5">
            <Skeleton width="3rem" height="2.25rem" variant="rounded" />
            <Skeleton width="2rem" height="2.25rem" variant="rounded" />
          </div>
        </div>
        <div className="text-right space-y-1">
          <Skeleton width="2.5rem" height="0.75rem" variant="text" className="ml-auto" />
          <Skeleton width="3rem" height="0.875rem" variant="text" className="ml-auto" />
          <Skeleton width="3.5rem" height="0.875rem" variant="text" className="ml-auto" />
        </div>
      </div>
    </div>
  )
}

export function CaixaSkeletonButton() {
  return (
    <Skeleton width="6rem" height="2.75rem" variant="rounded" />
  )
}

export function CaixaSkeletonInput() {
  return (
    <Skeleton width="100%" height="2.75rem" variant="rounded" />
  )
}

export function CaixaSkeletonHeader() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton width="2rem" height="2rem" variant="circular" />
      <div className="flex-1 space-y-1">
        <Skeleton width="8rem" height="1.25rem" variant="text" />
        <Skeleton width="12rem" height="0.875rem" variant="text" />
      </div>
      <Skeleton width="4rem" height="2rem" variant="rounded" />
      <Skeleton width="5rem" height="2rem" variant="rounded" />
    </div>
  )
}
