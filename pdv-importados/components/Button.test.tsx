/**
 * Button Component Tests — Onda 5, Lote 1
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('renders with default size (md) and variant (primary)', () => {
    const { container } = render(<Button>Test</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('md')
    expect(button).toHaveClass('primary')
  })

  it('renders with custom size', () => {
    const { container } = render(<Button size="lg">Large</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('lg')
  })

  it('renders with custom variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('ghost')
  })

  it('renders with danger variant', () => {
    const { container } = render(<Button variant="danger">Delete</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('danger')
  })

  it('renders disabled state', () => {
    render(<Button disabled>Disabled</Button>)
    const button = screen.getByText('Disabled') as HTMLButtonElement
    expect(button).toBeDisabled()
  })

  it('renders with loading state', () => {
    const { container } = render(<Button loading>Loading...</Button>)
    const button = container.querySelector('button')
    expect(button).toBeDisabled()
    expect(button).toHaveClass('loading')
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    const button = screen.getByText('Click') as HTMLButtonElement

    button.click()
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn()
    render(
      <Button onClick={handleClick} disabled>
        Disabled
      </Button>
    )
    const button = screen.getByText('Disabled') as HTMLButtonElement

    button.click()
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('does not call onClick when loading', () => {
    const handleClick = vi.fn()
    render(
      <Button onClick={handleClick} loading>
        Loading
      </Button>
    )
    const button = screen.getByText('Loading') as HTMLButtonElement

    button.click()
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('accepts custom className', () => {
    const { container } = render(<Button className="custom">Test</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('custom')
  })

  it('renders all size variants correctly', () => {
    const { container, rerender } = render(<Button size="sm">Button</Button>)

    let button = container.querySelector('button')
    expect(button).toHaveClass('sm')

    rerender(<Button size="md">Button</Button>)
    button = container.querySelector('button')
    expect(button).toHaveClass('md')

    rerender(<Button size="lg">Button</Button>)
    button = container.querySelector('button')
    expect(button).toHaveClass('lg')
  })

  it('renders all variant types correctly', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger'] as const
    const { container, rerender } = render(<Button>Button</Button>)

    for (const variant of variants) {
      rerender(<Button variant={variant}>Button</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass(variant)
    }
  })
})
