import type { Meta, StoryObj } from '@storybook/react'
import { DragonLoadingState, DragonDisabledSection } from '@/components/dragon'
import { DragonCard } from '@/components/dragon'

// ─── LoadingState ─────────────────────────────────────────────────────────────

const loadingMeta: Meta<typeof DragonLoadingState> = {
  title: 'Dragon UI/Operational/DragonLoadingState',
  component: DragonLoadingState,
  parameters: {
    docs: {
      description: {
        component:
          'Loading state de página canônico. Para loading inline de botão, usar `<DragonOuroLoader>` diretamente com `disabled aria-busy`.',
      },
    },
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    label: { control: 'text' },
  },
}

export default loadingMeta
type LoadingStory = StoryObj<typeof loadingMeta>

export const Default: LoadingStory = { args: { size: 'md' } }
export const WithLabel: LoadingStory = { args: { size: 'md', label: 'Carregando produtos...' } }
export const Small: LoadingStory = { args: { size: 'sm', label: 'Aguarde' } }
export const Large: LoadingStory = { args: { size: 'lg', label: 'Iniciando caixa...' } }

export const AllSizes: LoadingStory = {
  render: () => (
    <div className="flex gap-8 items-start">
      <DragonLoadingState size="sm" label="sm" />
      <DragonLoadingState size="md" label="md" />
      <DragonLoadingState size="lg" label="lg" />
    </div>
  ),
}

export const InsideCard: LoadingStory = {
  render: () => (
    <DragonCard variant="elevated" padded className="w-80">
      <DragonLoadingState size="md" label="Buscando movimentações..." />
    </DragonCard>
  ),
}

// ─── DisabledSection ─────────────────────────────────────────────────────────

export const DisabledSectionDemo: StoryObj = {
  name: 'DragonDisabledSection — Caixa fechado',
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <p className="text-xs text-jl-fg-3 uppercase tracking-wide font-semibold">Caixa FECHADO</p>
      <DragonDisabledSection disabled>
        <DragonCard padded>
          <p className="text-sm text-jl-fg-2">Opções bloqueadas enquanto caixa está fechado.</p>
          <p className="text-xs text-jl-fg-3 mt-1">Realize uma venda, sangria ou suprimento</p>
        </DragonCard>
      </DragonDisabledSection>
      <p className="text-xs text-jl-fg-3 uppercase tracking-wide font-semibold mt-2">Caixa ABERTO</p>
      <DragonDisabledSection disabled={false}>
        <DragonCard padded>
          <p className="text-sm text-jl-fg-2">Opções disponíveis — caixa ativo.</p>
          <p className="text-xs text-jl-fg-3 mt-1">Realize uma venda, sangria ou suprimento</p>
        </DragonCard>
      </DragonDisabledSection>
    </div>
  ),
}
