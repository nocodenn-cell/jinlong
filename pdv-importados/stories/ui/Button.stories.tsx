import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component: 'Botões do Dragon POS com tema oriental e micro-interações.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    disabled: {
      control: 'boolean',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Botão Padrão',
  },
}

export const Accent: Story = {
  args: {
    children: 'Botão Principal',
    className: 'app-btn-accent',
  },
}

export const Neutral: Story = {
  args: {
    children: 'Botão Secundário',
    className: 'app-btn-neutral',
  },
}

export const Danger: Story = {
  args: {
    children: 'Botão Perigo',
    className: 'app-btn-danger',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Button className="app-btn-accent">Principal</Button>
      <Button className="app-btn-neutral">Secundário</Button>
      <Button className="app-btn-danger">Perigo</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex gap-4 items-center flex-wrap">
      <Button className="app-btn-accent" size="sm">Pequeno</Button>
      <Button className="app-btn-accent" size="default">Padrão</Button>
      <Button className="app-btn-accent" size="lg">Grande</Button>
      <Button className="app-btn-accent" size="icon">🐉</Button>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Button className="app-btn-accent" disabled>Principal</Button>
      <Button className="app-btn-neutral" disabled>Secundário</Button>
      <Button className="app-btn-danger" disabled>Perigo</Button>
    </div>
  ),
}
