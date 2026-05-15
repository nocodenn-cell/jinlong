import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Jinlong Dragon variants
        dragon:
          "app-btn-accent border-[var(--dragon-gold)] bg-gradient-to-b from-[var(--dragon-gold)] to-[var(--dragon-gold-light,#f59e0b)] text-[#1a1a1a] font-semibold hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(212,175,55,0.3)]",
        dragonJade:
          "border border-[var(--dragon-jade)] bg-gradient-to-b from-[var(--dragon-jade)] to-[var(--dragon-jade-dark,#059669)] text-white font-semibold hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)]",
        dragonOutline:
          "border border-[var(--dragon-gold,#d4af37)] bg-transparent text-[var(--dragon-gold,#d4af37)] hover:bg-[var(--dragon-gold,#d4af37)]/10",
        dragonGhost:
          "text-[var(--dragon-gold,#d4af37)] hover:bg-[var(--dragon-gold,#d4af37)]/10 hover:text-[var(--dragon-gold,#d4af37)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
