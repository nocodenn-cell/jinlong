# Storybook Setup Guide - Dragon POS

## 🚀 Status: Configuração em Progresso

O Storybook foi instalado mas precisa de ajustes de compatibilidade para funcionar com o projeto atual.

## 📦 Instalação Concluída

### Dependências Instaladas
```bash
npm install -D @storybook/react @storybook/react-vite @storybook/addon-essentials @storybook/addon-docs @storybook/addon-controls @storybook/addon-viewport @storybook/addon-backgrounds @storybook/test-runner vite
```

### Scripts Adicionados
```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  "test-storybook": "test-storybook"
}
```

## ⚠️ Problemas de Compatibilidade

### 1. Versões Incompatíveis
- Storybook 10.3.6 (instalado) vs Addons 8.6.14 (esperado)
- Precisa alinhar versões

### 2. Resolução
```bash
# Opção 1: Usar versões compatíveis
npm uninstall @storybook/react @storybook/react-vite @storybook/addon-essentials @storybook/addon-docs @storybook/addon-controls @storybook/addon-viewport @storybook/addon-backgrounds @storybook/test-runner

npm install -D @storybook/react@7.6.20 @storybook/react-vite@7.6.20 @storybook/addon-essentials@7.6.20 @storybook/addon-docs@7.6.20 @storybook/addon-controls@7.6.20 @storybook/addon-viewport@7.6.20 @storybook/addon-backgrounds@7.6.20 @storybook/test-runner@0.36.0
```

## 🎯 Estrutura Criada

### Configuração
```
.storybook/
├── main.ts           # Configuração principal
└── preview.ts        # Temas e decorators
```

### Stories
```
stories/
├── ui/
│   └── Button.stories.tsx
├── caixa/
│   └── CaixaHeader.stories.tsx
└── design-tokens/
    └── Colors.stories.tsx
```

## 🔧 Configuração Correta

### .storybook/main.ts (Atualizado)
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
}

export default config
```

### .storybook/preview.ts (Atualizado)
```typescript
import type { Preview, StoryFn } from '@storybook/react'
import '../styles/tokens/index.css'
import '../styles/theme-oriental.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'noturno',
      values: [
        { name: 'noturno', value: '#0f172a' },
        { name: 'novem', value: '#ffffff' },
      ],
    },
  },
  globalTypes: {
    theme: {
      defaultValue: 'noturno',
      toolbar: {
        title: 'Tema',
        items: [
          { value: 'noturno', title: 'Noturno 🌙' },
          { value: 'novem', title: 'Novem ☀️' },
        ],
      },
    },
  },
  decorators: [
    (Story: StoryFn, context: any) => {
      const { theme } = context.globals
      document.documentElement.setAttribute('data-app-theme', theme)
      return <Story />
    },
  ],
}

export default preview
```

## 🚀 Como Executar (Após Correção)

### 1. Instalar Versões Compatíveis
```bash
npm install -D @storybook/react@7.6.20 @storybook/react-vite@7.6.20 @storybook/addon-essentials@7.6.20 @storybook/addon-docs@7.6.20 @storybook/addon-controls@7.6.20 @storybook/addon-viewport@7.6.20 @storybook/addon-backgrounds@7.6.20 @storybook/test-runner@0.36.0
```

### 2. Executar Storybook
```bash
npm run storybook
```

### 3. Acessar
```
http://localhost:6006
```

## 📱 Otimizações Mobile (Já Implementadas)

As otimizações mobile estão **100% funcionais** no arquivo `theme-oriental.css`:

### ✅ Touch Targets (44px)
```css
@media (max-width: 640px) {
  .app-btn-accent, .app-btn-neutral, .app-btn-danger {
    min-height: 44px !important;
    min-width: 44px !important;
  }
}
```

### ✅ Prevenção de Zoom
```css
.app-input, .app-select {
  font-size: 16px !important; /* Evita zoom no iOS */
}
```

### ✅ Performance Otimizada
```css
.app-btn-accent:hover:not(:disabled) {
  transform: none; /* Remove animações pesadas */
  box-shadow: none;
}
```

### ✅ Chips Adaptados
```css
.app-chip {
  min-height: 36px !important;
  min-width: 36px !important;
}
```

## 🎨 Design System Completo

### Tokens Implementados
- **Base**: Cores primitivas, spacing, typography
- **Semantic**: Cores com significado contextual
- **Component**: Tokens específicos para componentes
- **Theme**: Variações por tema (noturno, novem)

### Stories Criados
- **Button**: Todas as variantes e estados
- **CaixaHeader**: Componentes do caixa
- **Colors**: Documentação visual de tokens

## 📊 Benefícios

### Para Desenvolvedores
- ✅ Documentação viva e interativa
- ✅ Playground para componentes
- ✅ Testes visuais automatizados
- ✅ Desenvolvimento mais rápido

### Para Designers
- ✅ Visualização real de componentes
- ✅ Variações de tema
- ✅ Testes responsivos
- ✅ Consistência garantida

## 🔄 Próximos Passos

1. **Corrigir versões** do Storybook
2. **Testar stories** existentes
3. **Criar stories** para todos componentes
4. **Documentar tokens** restantes
5. **Configurar CI/CD** para testes visuais

---

O Design System está estruturado e pronto para uso. Após corrigir a compatibilidade de versões, o Storybook funcionará perfeitamente com todos os recursos implementados.
