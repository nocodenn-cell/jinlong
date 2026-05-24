import type { Meta, StoryObj } from '@storybook/react'
import { DragonStatusBadge } from '@/components/dragon'

const meta: Meta<typeof DragonStatusBadge> = {
  title: 'Dragon UI/Feedback/DragonStatusBadge',
  component: DragonStatusBadge,
  parameters: {
    docs: {
      description: {
        component:
          'Badge de status canônico Dragon UI. Substitui 26 padrões badge ad-hoc. Usar sempre `dot` para estados que mudam em tempo real (pago/pendente/cancelado).',
      },
    },
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'destructive', 'info', 'muted'],
    },
    dot: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { children: 'Padrão', variant: 'default' } }
export const Success: Story = { args: { children: 'Pago', variant: 'success', dot: true } }
export const Warning: Story = { args: { children: 'Pendente', variant: 'warning', dot: true } }
export const Destructive: Story = { args: { children: 'Cancelado', variant: 'destructive', dot: true } }
export const Info: Story = { args: { children: 'Em análise', variant: 'info' } }
export const Muted: Story = { args: { children: 'Inativo', variant: 'muted' } }

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <DragonStatusBadge variant="default">Padrão</DragonStatusBadge>
      <DragonStatusBadge variant="success" dot>Pago</DragonStatusBadge>
      <DragonStatusBadge variant="warning" dot>Pendente</DragonStatusBadge>
      <DragonStatusBadge variant="destructive" dot>Cancelado</DragonStatusBadge>
      <DragonStatusBadge variant="info">Em análise</DragonStatusBadge>
      <DragonStatusBadge variant="muted">Inativo</DragonStatusBadge>
    </div>
  ),
}

export const PDVContexto: Story = {
  name: 'PDV — Contexto real',
  render: () => (
    <div className="flex flex-col gap-3 p-4 bg-jl-surface-base rounded-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-jl-fg-2">Venda #0042</span>
        <DragonStatusBadge variant="success" dot>Finalizada</DragonStatusBadge>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-jl-fg-2">Venda #0043</span>
        <DragonStatusBadge variant="warning" dot>Aguardando</DragonStatusBadge>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-jl-fg-2">Sangria #001</span>
        <DragonStatusBadge variant="info">Aprovada</DragonStatusBadge>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-jl-fg-2">Venda #0041</span>
        <DragonStatusBadge variant="destructive" dot>Cancelada</DragonStatusBadge>
      </div>
    </div>
  ),
}
