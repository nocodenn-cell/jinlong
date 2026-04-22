# PDV Importados - Frontend

Sistema de ponto de venda para lojas de importados no Brasil, desenvolvido com **Next.js 16** (App Router).

## Funcionalidades

- **Interface PDV**: Adição de produtos por código de barras, carrinho interativo
- **Preços Atacado**: Cálculo automático de descontos baseado em regras por produto/categoria
- **Online-first (este app):** o `pdv-importados` exige **Supabase/auth** em tempo real no navegador; não há fila de vendas “offline” no browser. Operação com **catálogo + outbox + sync** em máquina da loja usa o monorepo **`pdv-local`** (Tauri + SQLite).
- **Bilíngue**: Português para operadores, Mandarim / cantonês para gestão (mensagens em JSON)
- **PWA**: Instalável como app nativo

## Tecnologias

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS + componentes estilo shadcn em `components/ui/`
- Zustand (estado do carrinho e fluxos de UI)
- Internacionalização: **`getMessages`** + `src/lib/i18n/*.json` (pt, zh, zh-HK) — **sem** `next-intl`; rotas **sem** prefixo de locale (`/login`, `/caixa`, `/gerente/...`)
- Supabase (`@supabase/ssr`, Auth, Postgres com RLS — schema em `../backend/supabase/migrations/`)

## Estrutura

```
├── app/                    # Rotas e layouts (login, caixa, gerente/*, admin/*)
│   ├── caixa/              # Views e modais do PDV web + server actions
│   ├── gerente/
│   ├── admin/
│   ├── login/
│   └── globals.css
├── components/             # Ver components/README.md (ui/, caixa/, gerente/, …)
│   ├── ui/                 # Primitivos (button, input, …)
│   ├── caixa/
│   └── gerente/
├── core/                   # Domínio compartilhado (ex.: pricing)
├── lib/                    # Supabase, adapters, utilitários
├── stores/                 # Zustand
├── src/lib/i18n/           # Traduções JSON + getMessages
├── middleware.ts           # Sessão Supabase + proteção de rotas
└── e2e/                    # Playwright
```

Convenção de manutenção: **lógica de página e server actions** em `app/<área>/`; **blocos de UI com props estáveis** (apresentação, `data-testid`) em `components/<área>/` quando fizer sentido extrair de arquivos grandes.

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

## Testes e qualidade

- `npm run lint` — ESLint (zero warnings)
- `npm run test` — Vitest
- `npm run test:e2e` — Playwright (`e2e/`)
- `npm run env:check` — validação de env

## Deploy

- **Vercel**: Deploy automático com preview
- **PWA**: Instalável em dispositivos móveis
- Service Worker / cache: conforme configuração atual do Next (sem promessa de operação offline de vendas no browser)

## Regras de Preço

- **Produto específico**: Ex.: 5+ unidades de produto X = 10% desconto
- **Categoria**: Ex.: 3+ itens da categoria Eletrônicos = R$5 desconto fixo
- **Recálculo automático**: Ao mudar quantidade, todos os itens são recalculados

## Documentação adicional

- Regras do módulo (i18n, rotas, stack): `.cursorrules`
- Detalhes de mensagens: `src/lib/i18n/README.md`
- Monorepo: `../README.md`
