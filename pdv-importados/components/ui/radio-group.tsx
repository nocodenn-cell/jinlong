import * as React from "react"

import { cn } from "@/lib/utils"

type RadioGroupContextValue = {
  value: string
  onValueChange: (value: string) => void
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(
  null
)

export interface RadioGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string
  onValueChange: (value: string) => void
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ value, onValueChange, className, children, ...props }, ref) => {
    return (
      <RadioGroupContext.Provider value={{ value, onValueChange }}>
        <div
          ref={ref}
          role="radiogroup"
          className={cn("flex flex-col gap-1.5", className)}
          {...props}
        >
          {children}
        </div>
      </RadioGroupContext.Provider>
    )
  }
)
RadioGroup.displayName = "RadioGroup"

export interface RadioGroupItemProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "onClick"
  > {
  value: string
}

const RadioGroupItem = React.forwardRef<
  HTMLButtonElement,
  RadioGroupItemProps
>(({ value, className, disabled, ...props }, ref) => {
  const ctx = React.useContext(RadioGroupContext)
  if (!ctx) {
    throw new Error("RadioGroupItem must be used within a RadioGroup")
  }
  const selected = ctx.value === value

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        "relative rounded-md px-2 py-1.5 text-center text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onClick={() => ctx.onValueChange(value)}
      {...props}
    />
  )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
