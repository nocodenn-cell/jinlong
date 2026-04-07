# PDV Importados - Frontend

Sistema de ponto de venda para lojas de importados no Brasil, desenvolvido com Next.js 15.

## Funcionalidades

- **Interface PDV**: Adição de produtos por código de barras, carrinho interativo
- **Preços Atacado**: Cálculo automático de descontos baseado em regras por produto/categoria
- **Offline-First**: Funciona sem internet, sincroniza quando disponível
- **Bilíngue**: Português para operadores, Mandarim para donos
- **PWA**: Instalável como app nativo

## Tecnologias

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Zustand (gerenciamento de estado)
- next-intl (internacionalização)
- Supabase (banco + auth)

## Estrutura

```
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx    # Layout com i18n
│   │   └── page.tsx      # Página principal PDV
│   └── globals.css       # Estilos globais
├── components/
│   ├── ui/               # Componentes shadcn/ui
│   ├── PDV.tsx           # Componente principal
│   └── LanguageSwitcher.tsx
├── lib/
│   ├── pricing/          # Lógica de preços
│   └── utils.ts
├── stores/               # Zustand stores
├── messages/             # Traduções i18n
└── public/               # Assets estáticos
```

## Desenvolvimento

1. Instalar dependências:
   ```bash
   npm install
   ```

2. Configurar variáveis de ambiente:
   ```bash
   cp .env.example .env.local
   # Editar com chaves do Supabase
   ```

3. Executar em desenvolvimento:
   ```bash
   npm run dev
   ```

4. Build para produção:
   ```bash
   npm run build
   npm start
   ```

## Deploy

- **Vercel**: Deploy automático com preview
- **PWA**: Instalável em dispositivos móveis
- **Offline**: Service Worker para cache básico

## Regras de Preço

- **Produto específico**: Ex: 5+ unidades de produto X = 10% desconto
- **Categoria**: Ex: 3+ itens da categoria Eletrônicos = R$5 desconto fixo
- **Recálculo automático**: Ao mudar quantidade, todos os itens são recalculados

## Próximos Passos

- Integração completa com Supabase
- Autenticação de usuários
- Gestão de produtos e regras
- Relatórios e dashboards
- Sincronização offline/online