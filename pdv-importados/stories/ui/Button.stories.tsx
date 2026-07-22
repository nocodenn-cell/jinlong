import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'Button canônico do Design System (Fase 2 · Onda 2). Variantes: primary, secondary, outline, ghost, danger, success.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { children: 'Primary', variant: 'primary' },
}

export const Secondary: Story = {
  args: { children: 'Secondary', variant: 'secondary' },
}

export const Outline: Story = {
  args: { children: 'Outline', variant: 'outline' },
}

export const Ghost: Story = {
  args: { children: 'Ghost', variant: 'ghost' },
}

export const Danger: Story = {
  args: { children: 'Danger', variant: 'danger' },
}

export const Success: Story = {
  args: { children: 'Success', variant: 'success' },
}

export const Loading: Story = {
  args: { children: 'Salvando', variant: 'primary', loading: true },
}

export const Disabled: Story = {
  args: { children: 'Disabled', variant: 'primary', disabled: true },
}
