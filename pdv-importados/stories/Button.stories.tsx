/**
 * Button Stories — Storybook
 * Onda 5, Lote 1: Visual documentation
 */

import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/Button'

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'radio' },
      options: ['sm', 'md', 'lg'],
    },
    variant: {
      control: { type: 'radio' },
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
    disabled: {
      control: 'boolean',
    },
    loading: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// Default story
export const Default: Story = {
  args: {
    children: 'Click me',
    size: 'md',
    variant: 'primary',
  },
}

// Sizes
export const Small: Story = {
  args: {
    children: 'Small Button',
    size: 'sm',
  },
}

export const Medium: Story = {
  args: {
    children: 'Medium Button',
    size: 'md',
  },
}

export const Large: Story = {
  args: {
    children: 'Large Button',
    size: 'lg',
  },
}

// Variants
export const Primary: Story = {
  args: {
    children: 'Primary Button',
    variant: 'primary',
  },
}

export const Secondary: Story = {
  args: {
    children: 'Secondary Button',
    variant: 'secondary',
  },
}

export const Ghost: Story = {
  args: {
    children: 'Ghost Button',
    variant: 'ghost',
  },
}

export const Danger: Story = {
  args: {
    children: 'Delete',
    variant: 'danger',
  },
}

// States
export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
  },
}

export const Loading: Story = {
  args: {
    children: 'Loading...',
    loading: true,
  },
}

// Combinations
export const LargeGhost: Story = {
  args: {
    children: 'Large Ghost Button',
    size: 'lg',
    variant: 'ghost',
  },
}

export const SmallDanger: Story = {
  args: {
    children: 'Delete',
    size: 'sm',
    variant: 'danger',
  },
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        padding: '2rem',
      }}
    >
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
}

// All sizes grid
export const AllSizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        padding: '2rem',
      }}
    >
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
}

// Interactive playground
export const Playground: Story = {
  args: {
    children: 'Interactive Button',
    size: 'md',
    variant: 'primary',
    disabled: false,
    loading: false,
  },
  render: (args) => <Button {...args} onClick={() => alert('Clicked!')} />,
}
