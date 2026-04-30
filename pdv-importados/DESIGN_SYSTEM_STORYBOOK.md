# Design System Completo com Storybook

## 🎯 Visão Geral

Design System completo para o Dragon POS com Storybook para documentação, testes e desenvolvimento de componentes.

## 📁 Estrutura Proposta

```
pdv-importados/
├── .storybook/                    # Configuração do Storybook
│   ├── main.ts                   # Configuração principal
│   ├── preview.ts                # Configuração global
│   ├── theme.ts                  # Tema Storybook (oriental)
│   └── addons.ts                 # Addons configurados
├── stories/                      # Stories dos componentes
│   ├── ui/                       # Componentes UI base
│   │   ├── Button.stories.tsx
│   │   ├── Input.stories.tsx
│   │   ├── Badge.stories.tsx
│   │   ├── Card.stories.tsx
│   │   └── Tooltip.stories.tsx
│   ├── caixa/                    # Componentes do caixa
│   │   ├── CaixaHeader.stories.tsx
│   │   ├── CaixaFooter.stories.tsx
│   │   ├── CaixaSearchBar.stories.tsx
│   │   └── CaixaCartList.stories.tsx
│   └── design-tokens/           # Documentação de tokens
│       ├── Colors.stories.tsx
│       ├── Typography.stories.tsx
│       ├── Spacing.stories.tsx
│       └── Components.stories.tsx
├── design-system/                # Sistema de design
│   ├── tokens/                   # Tokens (já existe)
│   │   ├── base.css
│   │   ├── semantic.css
│   │   ├── component.css
│   │   └── theme.css
│   ├── components/               # Componentes do DS
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.stories.tsx
│   │   │   ├── Button.test.tsx
│   │   │   └── index.ts
│   │   ├── Input/
│   │   ├── Badge/
│   │   ├── Card/
│   │   └── Tooltip/
│   ├── hooks/                    # Hooks do DS
│   │   ├── useTheme.ts
│   │   └── useTokens.ts
│   └── utils/                    # Utilitários
│       ├── cn.ts
│       └── token-utils.ts
└── docs/                         # Documentação
    ├── getting-started.md
    ├── components.md
    ├── tokens.md
    └── guidelines.md
```

## 🛠️ Configuração do Storybook

### 1. Instalação de Dependências
```bash
npm install -D @storybook/react @storybook/react-vite @storybook/addon-essentials @storybook/addon-docs @storybook/addon-controls @storybook/addon-viewport @storybook/addon-backgrounds @storybook/test-runner storybook
```

### 2. Arquivo .storybook/main.ts
```typescript
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-docs',
    '@storybook/addon-controls',
    '@storybook/addon-viewport',
    '@storybook/addon-backgrounds',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
}

export default config
```

### 3. Arquivo .storybook/preview.ts
```typescript
import type { Preview } from '@storybook/react'
import '../styles/tokens/index.css'
import '../styles/theme-oriental.css'

const preview: Preview = {
  parameters: {
    docs: {
      toc: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: {
      default: 'noturno',
      values: [
        {
          name: 'noturno',
          value: '#0f172a',
        },
        {
          name: 'novem',
          value: '#ffffff',
        },
        {
          name: 'dragon-light',
          value: '#f8fafc',
        },
        {
          name: 'dragon-dark',
          value: '#020617',
        },
      ],
    },
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: {
            width: '375px',
            height: '667px',
          },
        },
        tablet: {
          name: 'Tablet',
          styles: {
            width: '768px',
            height: '1024px',
          },
        },
        desktop: {
          name: 'Desktop',
          styles: {
            width: '1200px',
            height: '800px',
          },
        },
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'Tema do Dragon POS',
      defaultValue: 'noturno',
      toolbar: {
        title: 'Tema',
        icon: 'paintbrush',
        items: [
          { value: 'noturno', title: 'Noturno' },
          { value: 'novem', title: 'Novem' },
          { value: 'dragon-light', title: 'Dragon Light' },
          { value: 'dragon-dark', title: 'Dragon Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
}

export default preview
```

## 🎨 Stories de Componentes

### 1. Button Stories
```typescript
// stories/ui/Button.stories.tsx
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
```

### 2. Design Tokens Stories
```typescript
// stories/design-tokens/Colors.stories.tsx
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
        <h2 className="text-2xl font-bold mb-4">Cores da Marca</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 app-accent-bg"></div>
            <p className="text-sm">Dragon Gold</p>
            <p className="text-xs text-muted">#fbbf24</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-green-500"></div>
            <p className="text-sm">Dragon Jade</p>
            <p className="text-xs text-muted">#10b981</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-red-600"></div>
            <p className="text-sm">Imperial Red</p>
            <p className="text-xs text-muted">#dc2626</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-slate-900"></div>
            <p className="text-sm">Dragon Night</p>
            <p className="text-xs text-muted">#0f172a</p>
          </div>
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-4">Cores Semânticas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-green-500"></div>
            <p className="text-sm">Success</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-yellow-500"></div>
            <p className="text-sm">Warning</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-red-500"></div>
            <p className="text-sm">Danger</p>
          </div>
          <div className="text-center">
            <div className="w-24 h-24 rounded-lg mb-2 bg-gray-500"></div>
            <p className="text-sm">Neutral</p>
          </div>
        </div>
      </div>
    </div>
  ),
}
```

## 📚 Documentação

### 1. Getting Started
```markdown
# Como Usar o Design System

## Instalação
```bash
npm install
npm run storybook
```

## Estrutura
- **Tokens**: CSS custom properties em `/styles/tokens/`
- **Componentes**: Componentes reutilizáveis em `/components/ui/`
- **Stories**: Documentação em `/stories/`

## Uso
```tsx
import { Button } from '@/components/ui/button'

<Button className="app-btn-accent">
  Finalizar Venda
</Button>
```
```

### 2. Guidelines
```markdown
# Guidelines do Dragon POS

## Princípios
- **Oriental**: Identidade visual asiática elegante
- **Glassmorphism**: Efeitos de vidro fosco
- **Performance**: Animações otimizadas
- **Acessibilidade**: WCAG 2.1 AA

## Cores
- **Gold**: Decisões, ações principais
- **Jade**: Sucesso, confirmações
- **Red**: Alertas, perigos
- **Night**: Fundos, superfícies

## Tipografia
- **Noto Sans SC**: Suporte a chinês
- **Inter**: Números e interface
- **Hierarquia clara**: 6 níveis de tamanho

## Espaçamento
- **Base**: 4px (0.25rem)
- **Escala**: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24
- **Semântico**: component, layout, section
```

## 🚀 Scripts Adicionais

### package.json
```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "test-storybook": "test-storybook",
    "chromatic": "npx chromatic --project-token=your-token"
  }
}
```

## 🔧 Integração com CI/CD

### GitHub Actions
```yaml
name: Storybook
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build-storybook
      - uses: chromaui/action@v1
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

## 📊 Benefícios

### Para Desenvolvedores
- **Documentação viva**: Sempre atualizada
- **Testes visuais**: Regressão automática
- **Playground**: Experimentação rápida
- **TypeScript**: Autocompletação segura

### Para Designers
- **Visualização**: Componentes reais
- **Temas**: Variações visuais
- **Responsivo**: Diferentes viewports
- **Consistência**: Tokens centralizados

### Para o Projeto
- **Escalabilidade**: Componentes reutilizáveis
- **Manutenibilidade**: Código organizado
- **Qualidade**: Testes automatizados
- **Performance**: Otimizações garantidas

## 🎯 Implementação Gradual

### Fase 1 (Semanas 1-2)
1. Configurar Storybook
2. Migrar componentes UI existentes
3. Criar stories básicos

### Fase 2 (Semanas 3-4)
1. Documentar tokens
2. Criar stories do caixa
3. Configurar testes visuais

### Fase 3 (Semanas 5-6)
1. Integração com CI/CD
2. Documentação completa
3. Guidelines e treinamento

Este Design System completo proporcionará uma base sólida para escalabilidade, consistência e manutenibilidade do Dragon POS.
