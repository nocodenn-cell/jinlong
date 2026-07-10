# 🏗️ Arquitetura — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[03_ARQUITETURA]] (2026-07-10)
> [[Home]] | [[Dashboard]]

---

## Visão Geral

```
┌────────────────────────────────────────────────────────────────┐
│                         MONOREPO                               │
│                    (npm workspaces + Turborepo)                │
│                                                                │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │
│  │pdv-importados│   │  pdv-local  │   │      backend        │  │
│  │  Next.js 15  │   │  Tauri 2    │   │  Supabase (PG 17)  │  │
│  │  React 19    │   │  React 19   │   │  Edge Functions     │  │
│  │  App Router  │   │  Vite + SQLite│  │  (Deno 2)          │  │
│  └──────┬──────┘   └──────┬──────┘   └──────────┬──────────┘  │
│         │                 │                      │              │
│         └────────┬────────┘                      │              │
│                  │                               │              │
│         ┌────────▼────────┐                      │              │
│         │  shared-core    │──────────────────────┘              │
│         │  TypeScript puro│                                     │
│         └─────────────────┘                                     │
└────────────────────────────────────────────────────────────────┘
```

---

## Frontend — pdv-importados (Next.js 15)

### Stack
- **Next.js 15** (App Router, Server Components, Server Actions)
- **React 19** (hooks, suspense, transitions)
- **TypeScript 5.7** (strict mode)
- **Tailwind CSS 3.4** (utility-first)
- **shadcn/ui** (componentes que o dev owna)
- **Zustand 5** (state: carrinho, desconto gerente)
- **Recharts 3.8** (gráficos de relatórios)
- **Zod 3.23** (validação de schemas)

### Estrutura de Rotas

```
app/
├── login/                 → Autenticação (POST → perfil → redirecionar)
├── caixa/                 → OPERADOR (PT fixo)
│   ├── page.tsx          → PDV principal
│   ├── CaixaPageClient.tsx → Carrinho, scan, pagamento
│   ├── actions.ts        → Server Actions (finalizar venda)
│   └── scan-pipeline/    → Máquina de estados do scan
├── gerente/               → GERENTE + DONO (PT/ZH)
│   ├── produtos/         → CRUD + import NF
│   ├── estoque/          → Saldo, ajuste, kardex, etiquetas, compras
│   ├── vendas/           → Histórico, detalhes, cancelar
│   ├── financeiro/       → Contas receber + (a pagar em andamento)
│   ├── relatorios/       → Vendas, estoque, margem, ABC
│   ├── clientes/         → Gerenciamento
│   ├── fornecedores/     → CRUD
│   ├── categorias-*/     → Produtos + financeiras
│   ├── comissoes/        → Por operador
│   └── configuracoes/    → Loja, PDV, descontos
├── admin/                 → ADMIN (painel v2 — consolidação SSoT + diagnóstico-caixa)
│   ├── dashboard/        → KPIs, gráficos
│   ├── catalogo/         → Produtos (paginação server-side)
│   ├── estoque/          → Gestão completa + kardex + importar-nfe
│   ├── vendas/           → Histórico com detalhe + cancelar
│   ├── financeiro/       → Contas receber
│   └── relatorios/       → 4 seções
├── api/
│   └── caixa/scan-telemetry/ → Telemetria de scan
├── layout.tsx            → Root layout + providers
└── middleware.ts         → Validação sessão + redir por perfil
```

### Responsabilidades dos Componentes

| Pasta | Responsabilidade |
|---|---|
| `components/ui/` | Base shadcn/ui, botões, inputs, cards, DataTable |
| `components/caixa/` | PDV específico (loading states, modais de valores, banners) |
| `components/gerente/` | Tabelas, filtros, CRUD modal, DataTablePage genérico |
| `components/charts/` | Chart.js wrappers com lazy load |
| `components/theme/` | AppThemeProvider (modo escuro) |
| `components/security/` | SessionIdleLogout (auto-logout por inatividade) |
| `components/forms/` | FormField acessível (ARIA completo) |

### Camadas de Dados

```
Browser → Server Component → Server Action → Supabase (via @supabase/ssr)
                ↓
         Stores Zustand (carrinho, desconto gerente)
```

---

## Backend — Supabase

### Stack
- **PostgreSQL 17** (banco principal)
- **Supabase Auth** (JWT + sessões)
- **PostgREST** (REST API auto-gerada com RLS)
- **Deno 2.x** (Edge Functions)
- **Docker** (ambiente local via Supabase CLI)

### Edge Functions

| Função | Propósito | Autenticação |
|---|---|---|
| `sync-outbox` | Sync desktop → Supabase (venda, catálogo, config, validar gerente) | HMAC SHA256 (não JWT) |
| `validar-gerente` | Emitir token curto-prazo para desconto gerente | JWT normal |
| `fiscal-worker` | Processar fila de documentos fiscais (NFC-e/NF-e) | Cron/triggered |

### Tabelas Principais

| Tabela | Propósito | RLS |
|---|---|---|
| `usuarios` | Perfis + idioma | SELECT próprio; dono vê loja |
| `produtos` | Catálogo | SELECT autenticado; UPDATE gerente+ |
| `categorias` | Hierarquia | SELECT autenticado; UPDATE gerente+ |
| `estoque` | Saldo por loja | SELECT mesma loja; UPDATE via RPC |
| `vendas` | Transações | SELECT própria/loja; INSERT via RPC |
| `itens_venda` | Linhas de venda | SELECT via join; INSERT via RPC |
| `caixas` | Turno de caixa | SELECT autenticado; INSERT via RPC |
| `documentos_fiscais_pendentes` | Fila NFC-e | INSERT via RPC; worker processa |
| `contas_receber` | Financeiro | SELECT gerente+ |
| `vendas_eventos_ledger` | Auditoria imutável | SELECT gerente+ |
| `sync_request_nonces` | Anti-replay | INSERT edge; SELECT edge |
| `tokens_desconto_gerente` | Auditoria/revogação | SELECT gerente+ |

### RPCs Principais

**Finalização de Venda:**
- `finalizar_venda_transacional_canonica_v4(...)` — **Padrão atual**, idempotente, com captura de eventos
- `registrar_venda_com_itens(...)` — **Legado desktop**, mantido para compatibilidade

**Estoque:**
- `decrementar_estoque_seguro(...)` — RPC com `FOR UPDATE + version` (anti-oversell)
- `ajustar_estoque_manual(...)` — Ajuste gerencial com trilha no kardex

**Preço:**
- `calcular_preco_produto(...)` — Autoridade de preço no servidor
- `calcular_preco_produto_security_definer(...)` — Com contexto de segurança

**Caixa:**
- `registrar_movimentacao(...)` — Sangria, retirada, depósito
- `aprovar_movimentacao(...)` — Gerente aprova acima do limite
- `fechar_caixa_atomico(...)` — Fechamento sem conferência (cego)

**Relatórios:**
- `relatorio_vendas_por_dia_periodo(p_de, p_ate, [p_tz])` — Agrupado por dia
- `relatorio_top_produtos_periodo(p_de, p_ate, [p_tz], [p_limit])` — Top N
- `dashboard_gerente_resumo(p_loja_id, p_periodo)` — KPIs
- `relatorio_margem_por_venda(...)` — Margem por transação

---

## Desktop — pdv-local (Tauri 2)

### Stack
- **Tauri 2** (Rust backend + WebView)
- **React 19** (UI = mesma geração do web)
- **Vite 6** (bundler)
- **SQLite 3** (banco local)
- **Zustand 5** (estado)
- **shared-core** via alias `@core`

### Banco Local (SQLite)

```sql
CREATE TABLE catalogo (
  id TEXT PRIMARY KEY,
  nome TEXT,
  preco_varejo REAL,
  estoque INTEGER,
  faixa_atacado JSON,
  atualizado_em INTEGER
);

CREATE TABLE vendas_outbox (
  id TEXT PRIMARY KEY,
  operador_id TEXT,
  itens JSON,
  status TEXT,  -- pending | synced | failed
  tentativas INTEGER,
  erro TEXT,
  criado_em INTEGER,
  sincronizado_em INTEGER
);
```

---

## shared-core (Domínio Puro)

### Responsabilidade
TypeScript puro, zero dependência de framework. Compartilhado entre web e desktop.

### Módulos

| Módulo | Exports |
|---|---|
| `pricing/` | `PricingService`, resolução de faixas atacado |
| `cart/` | `CartEngine` (add, remove, recalculate) |
| `caixa/` | `variantesChaveLeitura`, `mapRegrasPreco` |
| `pdv/` | Invariantes operacionais, pipeline scan |
| `money/` | `roundAbnt` (arredondamento ABNT) |
| `ledger/` | `LedgerEngine`, chart of accounts |
| `observability/` | Logger estruturado, métricas |

---

## Fluxo de Autenticação

```
1. Usuario acessa qualquer rota
2. middleware.ts: supabase.auth.getUser()
   - Não autenticado → redirect /login
   - OPERADOR → permite /caixa; bloqueia /gerente /admin
   - GERENTE/DONO → permite /gerente/*; bloqueia /caixa
   - ADMIN → permite /admin/*
3. Login: POST credentials → supabase.auth.signInWithPassword()
4. Sessão: cookie httpOnly via @supabase/ssr
5. Idioma: lido de usuarios.idioma_preferido → React Context
```

---

## Fluxo PDV (Web)

```
Operador abre /caixa
  ↓
useCaixaScanPipeline (máquina de estados)
  ↓
Scan código → variantesChaveLeitura → lookup produtos
  ↓
CartEngine.addItem() → PricingService.resolve()
  ↓ (se cruza faixa atacado)
PricingService.recalculateAll() → atualiza todos os itens do produto
  ↓
Finalizar venda → Server Action → caixa/actions.ts
  ↓
supabase.rpc('finalizar_venda_transacional_canonica_v4')
  ↓
PostgreSQL: INSERT vendas + itens + decrementar_estoque_seguro
  ↓
(opcional) fiscal_enfileirar_documento_venda
  ↓
Retorna venda_id → limpa carrinho → exibe comprovante
```

---

## Fluxo Cadastro de Produto

```
Gerente → /gerente/produtos ou /admin/catalogo
  ↓
ProdutoFormModal (shadcn/ui + Zod)
  → EssencialSection: nome, código, categoria, marca
  → ComercialSection: preço varejo, atacado, margem
  → CompraSection: custo, fornecedor, NCM
  → EstoqueSection: saldo inicial, mínimo
  → FiscalSection: CFOP, CSOSN, CEST, CST, tem_nf
  ↓
Server Action → gerente/produtos/actions.ts
  ↓
supabase.from('produtos').insert/update
  ↓
Trigger BD: guard_margem_negativa (rejeita margem < 0)
```

---

## Fluxo Estoque

```
Baixa de estoque:
finalizar_venda_canonica_v4
  → decrementar_estoque_seguro (FOR UPDATE + version)
  → INSERT estoque_baixas (kardex)
  → UPDATE estoque.saldo

Ajuste manual:
Gerente → /gerente/estoque/ajuste
  → ajustar_estoque_manual RPC
  → INSERT estoque_movimentos (kardex)
  → UPDATE estoque.saldo

Transferência entre lojas:
  → transferir_estoque_seguro_idempotente RPC
  → INSERT em estoque_transferencias (auditoria)
  → UPDATE saldo origem e destino atomicamente
```

---

## Fluxo Financeiro

```
Contas a receber:
vendas com forma_pagamento = PRAZO
  → INSERT contas_receber
  → Gerente visualiza em /gerente/financeiro
  → (Conciliação bancária: P3 — não implementado)

Caixa:
Abertura: operador abre turno → INSERT caixas
Sangria: registrar_movimentacao('SANGRIA', valor, operador)
         → aprovar_movimentacao (gerente, se acima do limite)
Fechamento: fechar_caixa_atomico → UPDATE caixas.status = 'fechado'
```

---

## Fluxo Sync Desktop

```
PDV-local (Tauri) — modo offline
  ↓
Venda finalizada → INSERT vendas_outbox (status: pending)
  ↓
usePdvLocalOutboxSync detecta pending
  ↓
POST /functions/v1/sync-outbox
  Body: { operacao: "venda", nonce, timestamp, payload, hmac }
  ↓
Edge Function:
  1. Verifica HMAC SHA256
  2. Valida timestamp (dentro de 5 min)
  3. Busca nonce em sync_request_nonces (idempotência)
  4. Chama finalizar_venda_transacional_canonica_v4
  5. (Opcional) fiscal_enfileirar_documento_venda
  6. Retorna { venda_id, status: "ok" }
  ↓
Desktop: UPDATE vendas_outbox SET status = 'synced'
(Se falha: retry com backoff exponencial)
```

---

> Ver detalhes do PDV em [[PDV]] · Cadastro em [[Cadastro Produto]] · Design em [[Design System]]
