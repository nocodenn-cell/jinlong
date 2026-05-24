import type { Meta, StoryObj } from '@storybook/react'
import { SectionLabel } from '@/components/dragon'
import { DragonCard } from '@/components/dragon'

const meta: Meta<typeof SectionLabel> = {
  title: 'Dragon UI/Layout/SectionLabel',
  component: SectionLabel,
  parameters: {
    docs: {
      description: {
        component:
          'Label de seção canônico. Substitui 25 ocorrências de `text-xs font-semibold uppercase tracking-wide` espalhadas no codebase. Sempre usar este componente — nunca a combinação de classes.',
      },
    },
    backgrounds: { default: 'dark' },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: 'Resumo do Turno' },
}

export const ExemplosReais: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <SectionLabel>Métodos de Pagamento</SectionLabel>
      <SectionLabel>Movimentações</SectionLabel>
      <SectionLabel>Resumo do Caixa</SectionLabel>
      <SectionLabel>Produtos em Estoque</SectionLabel>
      <SectionLabel>Configurações Fiscais</SectionLabel>
    </div>
  ),
}

export const NoContexto: Story = {
  name: 'No contexto — com DragonCard abaixo',
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <div className="flex flex-col gap-1">
        <SectionLabel>Resumo Financeiro</SectionLabel>
        <DragonCard padded>
          <div className="flex items-center justify-between">
            <span className="text-sm text-jl-fg-2">Total em vendas</span>
            <span className="text-sm font-bold tabular-nums text-jl-accent">R$ 1.250,00</span>
          </div>
        </DragonCard>
      </div>
      <div className="flex flex-col gap-1">
        <SectionLabel>Última Movimentação</SectionLabel>
        <DragonCard padded>
          <p className="text-sm text-jl-fg-2">Sangria — R$ 100,00 às 14:32</p>
        </DragonCard>
      </div>
    </div>
  ),
}
