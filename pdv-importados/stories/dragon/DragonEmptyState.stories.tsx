import type { Meta, StoryObj } from '@storybook/react'
import { ShoppingCart, Package, Search, AlertTriangle } from 'lucide-react'
import { DragonEmptyState } from '@/components/dragon'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof DragonEmptyState> = {
  title: 'Dragon UI/Feedback/DragonEmptyState',
  component: DragonEmptyState,
  parameters: {
    docs: {
      description: {
        component:
          'Estado vazio canônico Dragon UI. Toda lista vazia DEVE usar este componente — nunca texto solto. Regra de ouro #10.',
      },
    },
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    size: { control: 'select', options: ['default', 'compact'] },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const CarrinhoVazio: Story = {
  args: {
    icon: <ShoppingCart />,
    title: 'Carrinho vazio',
    description: 'Busque produtos pelo código de barras ou pelo nome para adicionar ao carrinho.',
    size: 'default',
  },
}

export const SemProdutos: Story = {
  args: {
    icon: <Package />,
    title: 'Nenhum produto encontrado',
    description: 'Tente ajustar os filtros ou cadastre um novo produto.',
    size: 'default',
  },
}

export const SemResultados: Story = {
  args: {
    icon: <Search />,
    title: 'Sem resultados',
    description: 'Nenhum item encontrado para esta busca.',
    size: 'compact',
  },
}

export const ComAcao: Story = {
  args: {
    icon: <Package />,
    title: 'Nenhum produto cadastrado',
    description: 'Comece cadastrando produtos para aparecerem aqui.',
    action: (
      <Button className="app-btn-accent" size="sm">
        Cadastrar produto
      </Button>
    ),
  },
}

export const Alerta: Story = {
  args: {
    icon: <AlertTriangle />,
    title: 'Caixa não encontrado',
    description: 'Não foi possível carregar os dados do caixa. Tente recarregar a página.',
    size: 'default',
  },
}

export const Compact: Story = {
  args: {
    icon: <Search />,
    title: 'Sem resultados',
    size: 'compact',
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="border border-jl-border-1 rounded-md">
        <DragonEmptyState
          icon={<ShoppingCart />}
          title="Default (py-12)"
          description="Padding generoso para página inteira."
        />
      </div>
      <div className="border border-jl-border-1 rounded-md">
        <DragonEmptyState
          icon={<ShoppingCart />}
          title="Compact (py-6)"
          description="Padding reduzido para uso dentro de painéis."
          size="compact"
        />
      </div>
    </div>
  ),
}
