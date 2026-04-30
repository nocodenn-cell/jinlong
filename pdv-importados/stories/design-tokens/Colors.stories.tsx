import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'Design Tokens/Colors',
  parameters: {
    docs: {
      description: {
        component: 'Cores do sistema Dragon POS com variantes por tema.',
      },
    },
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const BrandColors: Story = {
  render: () => (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4 app-accent-text">Cores da Marca</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 app-accent-bg"></div>
            <p className="text-sm font-medium">Dragon Gold</p>
            <p className="text-xs app-muted">#fbbf24</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-green-500"></div>
            <p className="text-sm font-medium">Dragon Jade</p>
            <p className="text-xs app-muted">#10b981</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-red-600"></div>
            <p className="text-sm font-medium">Imperial Red</p>
            <p className="text-xs app-muted">#dc2626</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 app-surface border app-border">
              <span className="app-muted">Dragon Night</span>
            </div>
            <p className="text-sm font-medium">Dragon Night</p>
            <p className="text-xs app-muted">#0f172a</p>
          </div>
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-4 app-accent-text">Cores Semânticas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-green-500"></div>
            <p className="text-sm font-medium">Success</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-yellow-500"></div>
            <p className="text-sm font-medium">Warning</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-red-500"></div>
            <p className="text-sm font-medium">Danger</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 app-surface border app-border">
              <span className="app-muted">Neutral</span>
            </div>
            <p className="text-sm font-medium">Neutral</p>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const ThemeVariations: Story = {
  render: () => (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4 app-accent-text">Variações por Tema</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Tema Noturno</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded app-surface border app-border"></div>
                <span className="text-sm">Surface</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded app-surface-soft border app-border"></div>
                <span className="text-sm">Surface Soft</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded app-accent-bg"></div>
                <span className="text-sm">Accent</span>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-3">Tema Novem</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-white border border-gray-200"></div>
                <span className="text-sm">Surface</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-gray-50 border border-gray-200"></div>
                <span className="text-sm">Surface Soft</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-amber-600"></div>
                <span className="text-sm">Accent</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}
