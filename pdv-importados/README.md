# Jīn Lóng - Frontend

Sistema de ponto de venda para lojas de importados no Brasil, desenvolvido com **Next.js 16** (App Router).

## Funcionalidades

- **Interface PDV**: Adição de produtos por código de barras, carrinho interativo
- **Preços Atacado**: Cálculo automático de descontos baseado em regras por produto/categoria
- **Online-first (este app):** o `pdv-importados` exige **Supabase/auth** em tempo real no navegador; não há fila de vendas “offline” no browser. Operação com **catálogo + outbox + sync** em máquina da loja usa o monorepo **`pdv-local`** (Tauri + SQLite).
- **Bilíngue**: Português para operadores, Mandarim / cantonês para gestão (mensagens em JSON)
- **PWA**: Instalável como app nativo

## Sistema de Temas (Design System Clássico)

A camada visual usa um sistema de temas por rota (`rota → tema` via
`[data-theme]`), extensível para multi-tema/multi-tenant. As regras são um
**contrato obrigatório**, com enforcement automatizado (`npm run guard:theme`,
incluído em `guard:all`/CI) e checklist de migração como critério de aceite.

➡️ **Leia antes de migrar qualquer tela:** [`docs/THEME_SYSTEM.md`](./docs/THEME_SYSTEM.md).
Baseline visual oficial: `/admin/dashboard`.

## Tecnologias

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS + componentes estilo shadcn em `components/ui/`
- Zustand (estado do carrinho e fluxos de UI)
- Internacionalização: **`getMessages`** + `src/lib/i18n/*.json` (pt, zh) — **sem** `next-intl`; rotas **sem** prefixo de locale (`/login`, `/caixa`, `/gerente/...`)
- Supabase (`@supabase/ssr`, Auth, Postgres com RLS — schema em `../backend/supabase/migrations/`)

## Importação CSV de produtos (gerente)

Comportamento na rota **`/gerente/produtos`** (server action `importarProdutosCsv` em `app/gerente/produtos/actions.ts`):

| Modo | Checkbox «atualizar por id» | Coluna `id` | Efeito |
|------|-------------------------------|-------------|--------|
| **Só criação** | Desligado | **Vazia** em todas as linhas | Cada linha válida cria um produto novo (com estoque inicial). |
| **Criação + atualização** | Ligado | **UUID** de produto existente | Atualiza nome, código de barras, preço varejo, origem, `tem_nf` e `ativo`. |
| **Criação + atualização** | Ligado | **Vazia** | Igual a só criação para essa linha. |

- **Cabeçalho**: tem de coincidir com o modelo (`lib/gerente/produtosCsvContract.ts` — `PRODUTO_IMPORT_CSV_HEADER_KEYS`). Colunas a mais ou nomes errados falham na validação; **não** há colunas para `created_at` nem alteração de chave — só os campos do modelo.
- **ID inexistente** (com atualizar por id): a linha é registada como falha com texto do tipo «Não existe produto com id …» (i18n `import_row_id_nao_encontrado`).
- **Permissões**: `assertGerenteOuDono` na action; no Postgres aplicam-se as policies RLS habituais do painel gerencial.
- **Export**: o download da lista usa o mesmo cabeçalho canónico para reimportação ou edição externa.

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
