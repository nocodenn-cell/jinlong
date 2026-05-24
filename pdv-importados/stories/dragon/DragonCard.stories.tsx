import type { Meta, StoryObj } from '@storybook/react'
import { DragonCard, DragonSection } from '@/components/dragon'

const meta: Meta<typeof DragonCard> = {
  title: 'Dragon UI/Layout/DragonCard',
  component: DragonCard,
  parameters: {
    docs: {
      description: {
        component:
          'Card canônico Dragon UI. Substitui os 39 card wrappers ad-hoc com border/bg inconsistentes. Sempre importar de `@/components/dragon`.',
      },
    },
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'elevated', 'soft'],
    },
    padded: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'default',
    padded: true,
    children: <p className="text-jl-fg-2 text-sm">Conteúdo do card padrão</p>,
  },
}

export const Elevated: Story = {
  args: {
    variant: 'elevated',
    padded: true,
    children: <p className="text-jl-fg-2 text-sm">Card elevado — para modais e painéis internos</p>,
  },
}

export const Soft: Story = {
  args: {
    variant: 'soft',
    padded: true,
    children: <p className="text-jl-fg-2 text-sm">Card soft — frosted glass para inputs e chips</p>,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <DragonCard variant="default" padded>
        <p className="text-xs font-semibold text-jl-fg-3 uppercase tracking-wide mb-1">Default</p>
        <p className="text-sm text-jl-fg-2">Fundo base da página</p>
      </DragonCard>
      <DragonCard variant="elevated" padded>
        <p className="text-xs font-semibold text-jl-fg-3 uppercase tracking-wide mb-1">Elevated</p>
        <p className="text-sm text-jl-fg-2">TopBar, modais, panels</p>
      </DragonCard>
      <DragonCard variant="soft" padded>
        <p className="text-xs font-semibold text-jl-fg-3 uppercase tracking-wide mb-1">Soft</p>
        <p className="text-sm text-jl-fg-2">Inputs, chips, frosted glass</p>
      </DragonCard>
    </div>
  ),
}

export const WithDragonSection: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <DragonSection label="Resumo do Turno">
        <DragonCard padded>
          <p className="text-sm text-jl-fg-2">R$ 1.250,00 em vendas</p>
        </DragonCard>
      </DragonSection>
      <DragonSection label="Métodos de Pagamento">
        <DragonCard padded>
          <p className="text-sm text-jl-fg-2">Dinheiro, Cartão, Pix</p>
        </DragonCard>
      </DragonSection>
    </div>
  ),
}
