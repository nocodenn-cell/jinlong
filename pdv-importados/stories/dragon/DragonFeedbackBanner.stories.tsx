import type { Meta, StoryObj } from '@storybook/react'
import { DragonFeedbackBanner, DragonDisabledSection, DragonLoadingState } from '@/components/dragon'

// ─── FeedbackBanner ───────────────────────────────────────────────────────────

const bannerMeta: Meta<typeof DragonFeedbackBanner> = {
  title: 'Dragon UI/Operational/DragonFeedbackBanner',
  component: DragonFeedbackBanner,
  parameters: {
    docs: {
      description: {
        component:
          'Banner de feedback inline. Hierarquia de urgência: error > warning > success > info. Role automático: error usa `role="alert"`, demais usam `role="status"`.',
      },
    },
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    variant: { control: 'select', options: ['success', 'warning', 'error', 'info'] },
  },
}

export default bannerMeta
type BannerStory = StoryObj<typeof bannerMeta>

export const Success: BannerStory = {
  args: { variant: 'success', children: 'Venda finalizada com sucesso. Troco: R$ 5,00' },
}
export const Warning: BannerStory = {
  args: { variant: 'warning', children: 'Estoque baixo: 3 unidades restantes de Produto X.' },
}
export const Error: BannerStory = {
  args: { variant: 'error', children: 'Falha ao processar pagamento. Tente novamente.' },
}
export const Info: BannerStory = {
  args: { variant: 'info', children: 'Sincronização em andamento. Aguarde a confirmação.' },
}

export const AllVariants: BannerStory = {
  render: () => (
    <div className="flex flex-col gap-2 w-96">
      <DragonFeedbackBanner variant="success">Venda finalizada com sucesso.</DragonFeedbackBanner>
      <DragonFeedbackBanner variant="warning">Estoque abaixo do mínimo.</DragonFeedbackBanner>
      <DragonFeedbackBanner variant="error">Falha na conexão. Operando offline.</DragonFeedbackBanner>
      <DragonFeedbackBanner variant="info">Sincronizando dados do turno...</DragonFeedbackBanner>
    </div>
  ),
}

export const OperacoesCaixa: BannerStory = {
  name: 'PDV — Operações caixa',
  render: () => (
    <div className="flex flex-col gap-2 w-96">
      <DragonFeedbackBanner variant="success">
        Caixa aberto. Saldo inicial: <strong className="tabular-nums">R$ 500,00</strong>
      </DragonFeedbackBanner>
      <DragonFeedbackBanner variant="warning">
        Sangria pendente de aprovação do gerente.
      </DragonFeedbackBanner>
      <DragonFeedbackBanner variant="error">
        Desconto acima do limite autorizado. Requer senha do gerente.
      </DragonFeedbackBanner>
    </div>
  ),
}
