'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type SwitchProps = {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  'aria-label'?: string
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      defaultChecked,
      onCheckedChange,
      disabled,
      id,
      name,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultChecked))
    const isControlled = typeof checked === 'boolean'
    const value = isControlled ? checked : uncontrolled

    const toggle = () => {
      if (disabled) return
      const next = !value
      if (!isControlled) setUncontrolled(next)
      onCheckedChange?.(next)
    }

    return (
      <>
        {name ? (
          <input type="hidden" name={name} value={value ? 'on' : 'off'} readOnly />
        ) : null}
        <button
          type="button"
          role="switch"
          id={id}
          ref={ref}
          aria-checked={value}
          aria-label={ariaLabel}
          disabled={disabled}
          data-state={value ? 'checked' : 'unchecked'}
          className={cn('fp-switch', className)}
          onClick={toggle}
        >
          <span className="fp-switch__thumb" aria-hidden />
        </button>
      </>
    )
  },
)
Switch.displayName = 'Switch'
