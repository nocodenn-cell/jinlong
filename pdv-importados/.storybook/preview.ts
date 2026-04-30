import type { Preview, StoryFn } from '@storybook/react'
import '../styles/tokens/index.css'
import '../styles/theme-oriental.css'

const preview: Preview = {
  parameters: {
    docs: {
      toc: true,
      description: {
        component: 'Dragon POS Design System - Componentes com tema oriental e glassmorphism',
      },
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
        'desktop-wide': {
          name: 'Desktop Wide',
          styles: {
            width: '1440px',
            height: '900px',
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
          { value: 'noturno', title: 'Noturno 🌙' },
          { value: 'novem', title: 'Novem ☀️' },
          { value: 'dragon-light', title: 'Dragon Light 🐉' },
          { value: 'dragon-dark', title: 'Dragon Dark 🌑' },
        ],
        dynamicTitle: true,
      },
    },
    reducedMotion: {
      description: 'Preferência de movimento reduzido',
      defaultValue: 'no-preference',
      toolbar: {
        title: 'Motion',
        icon: 'accessibility',
        items: [
          { value: 'no-preference', title: 'No Preference' },
          { value: 'reduce', title: 'Reduced Motion' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story: StoryFn, context: any) => {
      const { theme, reducedMotion } = context.globals
      
      // Aplicar tema ao documento
      if (typeof document !== 'undefined') {
        if (theme === 'dragon-light') {
          document.documentElement.setAttribute('data-gerente-ui-theme', 'dragon-light')
          document.documentElement.removeAttribute('data-app-theme')
        } else if (theme === 'dragon-dark') {
          document.documentElement.setAttribute('data-gerente-ui-theme', 'dragon-dark')
          document.documentElement.removeAttribute('data-app-theme')
        } else {
          document.documentElement.setAttribute('data-app-theme', theme)
          document.documentElement.removeAttribute('data-gerente-ui-theme')
        }
        
        // Aplicar preferência de movimento
        if (reducedMotion === 'reduce') {
          document.documentElement.style.setProperty('--motion', 'reduced')
        } else {
          document.documentElement.style.removeProperty('--motion')
        }
      }
      
      return (
        <div className="caixa-oriental-root min-h-screen">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
