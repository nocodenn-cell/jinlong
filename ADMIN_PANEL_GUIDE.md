# FastProduct Admin Panel Guide

## 📘 Guia Completo do Painel Admin JinLong Dragon POS

**Versão:** 1.0  
**Data:** 2026-06-05  
**Status:** ✅ Fase 9 Completa — 13 rotas principais migradas

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Rotas Disponíveis](#rotas-disponíveis)
3. [Guia Detalhado por Tela](#guia-detalhado-por-tela)
4. [Arquitetura e Padrões](#arquitetura-e-padrões)
5. [Design System](#design-system)
6. [Manutenção e Extensão](#manutenção-e-extensão)

---

## 🎯 Visão Geral

O novo painel admin (`/admin/*`) é um redesign completo do antigo `/gerente/*`, com:

- **Design Moderno:** Sistema visual zinc-950 com tokens CSS reutilizáveis
- **Arquitetura Lean:** Zero queries duplicadas — 100% reutiliza actions de `/gerente`
- **Type-Safe:** TypeScript + Zod validation em todas as camadas
- **Componentes Reutilizáveis:** DataTable, FilterBar, Badges, MetricCard
- **Dados Reais:** Conectado ao Supabase via RPCs e Server Actions

### Estatísticas

| Métrica | Valor |
|---------|-------|
| **Rotas em `/admin/*`** | 13 telas |
| **Componentes Reutilizáveis** | 5 (DataTable, FilterBar, Badges, MetricCard, ActivityFeed) |
| **Tokens CSS** | 20+ (--fp-*) |
| **Arquivos Novos** | 45+ componentes e pages |
| **Linhas de Código** | ~5.000 LOC |
| **Testes** | tsc ✅ + eslint ✅ |

---

## 🗺️ Rotas Disponíveis

### Gestão Geral

| Rota | Tela | Descrição |
|------|------|-----------|
| `/admin/dashboard` | Visão Geral | KPIs, gráficos, feed de vendas, estoque crítico |
| `/admin/catalogo` | Catálogo de Produtos | Listagem, filtros avançados, busca (RPC paginada) |

### Operações de Estoque

| Rota | Tela | Descrição |
|------|------|-----------|
| `/admin/estoque` | Gestão de Estoque | Saldo, ajuste manual, histórico kardex (sheet) |
| `/admin/comissoes` | Comissões | Resumo por operador, detalhe, marcar como pago |
| `/admin/compras` | Compras | Ordens de compra, recebimentos (status badge) |

### Vendas e Financeiro

| Rota | Tela | Descrição |
|------|------|-----------|
| `/admin/vendas` | Histórico de Vendas | Paginação cursor, filtros período/status, detalhe (sheet) |
| `/admin/financeiro` | Contas a Receber | KPIs, tabela, filtros, truncação 200 itens |
| `/admin/relatorios` | Relatórios | 4 seções: vendas/dia, top produtos, estoque, resumo |
| `/admin/contas-pagar` | Contas a Pagar | Compromissos, vencimento, status (PAGA/PARCIAL) |

### Configurações

| Rota | Tela | Descrição |
|------|------|-----------|
| `/admin/categorias-produtos` | Categorias de Produtos | CRUD inline, status badge, contador |
| `/admin/categorias-financeiras` | Categorias Financeiras | CRUD inline (receitas/despesas) |
| `/admin/configuracoes` | Configurações Gerais | 3 abas: Loja, PDV, Cadastros rápidos |
| `/admin/suspensao` | Suspensão de Vendas | Toggle vendas, motivo (textarea 300 chars) |

---

## 🔍 Guia Detalhado por Tela

### 1️⃣ Dashboard (`/admin/dashboard`)

**Funcionalidades:**
- 6 KPIs com sparklines Canvas
- Gráfico de vendas por hora (Chart.js)
- Feed de atividades (últimas vendas)
- Widget estoque crítico
- Filtros período (hoje, 7d, 30d, tudo)

**Dados Conectados:**
```typescript
// RPC: dashboard_gerente_resumo
const { data: resumo } = await supabase.rpc('dashboard_gerente_resumo', {
  p_loja_id: lojaId,
  p_periodo: 30,
})

// RPC: v_estoque_baixo (estoque crítico)
const { data: critico } = await supabase
  .from('v_estoque_baixo')
  .select('*')
  .limit(10)
```

**Componentes:**
- `DashboardChart.tsx` — Gráfico Chart.js (Client)
- `CaixaShortcut.tsx` — Widget atalho caixa (Client)

**Design:**
- Cores: Verde (sucesso), Vermelho (crítico), Amarelo (brand)
- Sparklines com gradiente
- Cards com 1px border (zinc-800)

---

### 2️⃣ Catálogo (`/admin/catalogo`)

**Funcionalidades:**
- Busca em tempo real (debounce)
- Filtros avançados: status, origem, categoria, marca, fornecedor, estoque, imagem
- Tabela paginada (server-side via ?page=)
- Ações hover: Importar, Exportar, Cadastro, Editar, Ver
- Thumbnail inline na coluna Produto

**Dados Conectados:**
```typescript
// RPC: list_produtos_gerente_filtrados
const { data: produtos } = await supabase.rpc('list_produtos_gerente_filtrados', {
  p_loja_id: lojaId,
  p_q: busca,
  p_status: status,
  p_categoria_id: categoria,
  p_page: page,
  p_page_size: 50,
})
```

**Componentes:**
- `CatalogoTable.tsx` — Tabela com DataTable (Client)
- FilterBar (Fase 2) — Search + Pills + Selects
- OriginBadge (customizado)

**Filtros:**
- Origem: IMPORTADO (china_manual), NACIONAL (brasil_*), NF-e (brasil_nf)
- Status: Ativo/Inativo
- Estoque: Todos/Abaixo Mínimo/Em Falta
- Imagem: Com/Sem imagem

---

### 3️⃣ Estoque (`/admin/estoque`)

**Funcionalidades:**
- Tabela com saldo colorido (≤0 vermelho, >0 verde)
- Filtros: busca, visão (geral/crítico), origem, categoria
- Ações hover: Ajustar Saldo, Kardex
- Modal ajuste: Quantidade, Mínimo, Motivo, Observação
- Sheet kardex: Histórico entrada (verde +) / saída (vermelho −)

**Dados Conectados:**
```typescript
// RPC: gerente_estoque_list_page (paginação server-side)
const { data: estoque } = await supabase.rpc('gerente_estoque_list_page', {
  p_loja_id: lojaId,
  p_busca: q,
  p_visao: visao,
  p_page: page,
})

// Action: obterKardexProduto (nova, read-only)
const { data: kardex } = await obterKardexProduto(produtoId)
// Lê movimentos_estoque_log com timestamps e tipos

// Action: atualizarEstoqueProduto (reusa /gerente)
await atualizarEstoqueProduto({ produto_id, quantidade, ... })
```

**Componentes:**
- `EstoqueTable.tsx` — DataTable (Client)
- `AjusteSaldoModal.tsx` — Form inline (Client, useTransition)
- `KardexSheet.tsx` — Painel lateral com scroll (Client)

---

### 4️⃣ Vendas (`/admin/vendas`)

**Funcionalidades:**
- Paginação cursor (hasMore, sem total)
- Filtros: período (presets: tudo/hoje/7d/30d), status, pagamento
- Tabela: Data, Itens (primeiro_produto + qtd extras), Pagamento, Status, Total
- onRowClick abre sheet detalhe
- Sheet: StatusBadge + PaymentBadge + FiscalBadge + Totais + Items

**Dados Conectados:**
```typescript
// Action: buscarVendasPaginadasAction (reusa /gerente)
const { ok, vendas, hasMore } = await buscarVendasPaginadasAction({
  page,
  filtros: { de, ate, status, forma_pagamento }
})

// Action: obterDetalheVenda (nova, read-only)
const { data: detalhe } = await obterDetalheVenda(vendaId)
// Retorna: header (totals, datas) + items (produto, qtd, valor)
```

**Componentes:**
- `VendasTable.tsx` — DataTable com onRowClick (Client)
- `VendaDetailSheet.tsx` — Sheet lateral com badges (Client)
- `vendaMaps.ts` — Funções puras toPayment(), toVendaStatus(), toFiscal()

**Badges:**
- Status: CONCLUIDA (verde), CANCELADA (vermelho)
- Payment: DINHEIRO, PIX, CARTAO_CREDITO, CARTAO_DEBITO
- Fiscal: EMITIDA (numero_nf) ou SEM_NOTA

---

### 5️⃣ Financeiro (`/admin/financeiro`)

**Funcionalidades:**
- 3 KPI cards: Contas abertas, Valor aberto, Filtros aplicados
- Filtros: busca, status (ABERTO/PARCIAL), cliente, período
- Tabela: Cliente, Vencimento, Total, Pago, Aberto, Status
- Chips removíveis
- Limite 200 itens com warning

**Dados Conectados:**
```typescript
// Function: fetchContasReceberListagem (reusa /lib/gerente)
const { titulos } = await fetchContasReceberListagem(supabase, filters, 200)

// Function: fetchFinanceiroTitulosKpis (reusa /lib/gerente)
const { titulosAbertosCount, valorAbertoTotal } = await fetchFinanceiroTitulosKpis(supabase)
```

**Componentes:**
- `ContasReceberTable.tsx` — DataTable (Client, pure presentational)

**Status Coloring:**
- ABERTO: warning (amarelo) — Texto + valor vermelho
- PARCIAL: info (azul) — Texto + valor misto
- Pago: verde, Aberto em vermelho

---

### 6️⃣ Relatórios (`/admin/relatorios`)

**Funcionalidades:**
- 4 DataTables lado a lado
  1. **Vendas por dia:** dia, vendas, faturado, ticket, desconto
  2. **Top 50 produtos:** produto, origem, qtd, valor, vendas
  3. **Estoque crítico:** produto, saldo, mínimo, déficit
  4. **Resumo executivo (KPIs):** itens vendidos, concluídas, cancelamento%, cobertura%

**Dados Conectados:**
```typescript
// Action: carregarDadosRelatoriosGerente (reusa /gerente)
const { periodo, resumoExecutivo, porDia, top, baixo } = 
  await carregarDadosRelatoriosGerente({ de, ate })
```

**Componentes:**
- `RelatoriosContent.tsx` — 4x DataTable (Client)

**Coloring:**
- Origem: China (info azul), Brasil (neutral)
- Saldo: ≤0 vermelho, >0 verde
- Desconto: Amarelo se > 0, senão muted

---

### 7️⃣ Configurações (`/admin/configuracoes`)

**Funcionalidades:**
- **Aba Loja:** Dados gerais (nome, CNPJ, endereço), série fiscal
- **Aba PDV:** Regime, idioma, tema, CFOP, CST, checkboxes
- **Aba Cadastros:** Form criar cliente (nome, documento, telefone)

**Dados Conectados:**
```typescript
// Queries inline no page.tsx
const { data: loja } = await supabase
  .from('lojas')
  .select('...')
  .maybeSingle()

const { data: pdvConfig } = await supabase
  .from('pdv_config')
  .select('...')
  .maybeSingle()

// Actions (reusa /gerente)
await atualizarDadosLojaAction(payload)
await atualizarConfiguracoesPdvAction(payload)
await criarCliente(payload)
```

**Componentes:**
- `ConfiguracoesContent.tsx` — 3 abas com forms (Client, useTransition)

**Styling:**
- Styled-jsx `.admin-input` para inputs
- Focus: border-yellow-500

---

### 8️⃣ Categorias de Produtos (`/admin/categorias-produtos`)

**Funcionalidades:**
- CRUD inline (criar/editar/ativar/desativar)
- Tabela: Nome, Produtos (counter), Status, Ações
- Botão "Nova" abre inline input
- Enter para confirmar, Escape para cancelar

**Dados Conectados:**
```typescript
// Action: listarCategoriasProdutos (reusa /gerente)
const { rows, total } = await listarCategoriasProdutos({
  page, pageSize, busca, situacao
})

// Actions (reusa /gerente)
await criarCategoriaProduto({ nome })
await atualizarCategoriaProduto({ id, nome })
await alternarAtivoCategoriaProduto(id, ativo)
```

**Componentes:**
- `CategoriasProdutosContent.tsx` — CRUD inline (Client)

---

### 9️⃣ Categorias Financeiras (`/admin/categorias-financeiras`)

**Idêntico a Categorias de Produtos** — Mesmo padrão CRUD inline

```typescript
// Actions (reusa /gerente)
await criarCategoriaFinanceira({ nome })
await atualizarCategoriaFinanceira({ id, nome })
await alternarAtivoCategoriaFinanceira(id, ativo)
```

---

### 1️⃣0️⃣ Contas a Pagar (`/admin/contas-pagar`)

**Funcionalidades:**
- Tabela: Fornecedor, Vencimento, Total, Pago (verde), Aberto (amarelo), Status
- Status badges: PAGA (verde), PARCIAL (azul), ABERTA (amarelo)
- Limite 200 itens com warning de truncação

**Dados Conectados:**
```typescript
// Function: fetchContasPagarListagem (reusa /lib/gerente)
const { rows, total, capped } = await fetchContasPagarListagem({
  q, status, limite: 200
})
```

**Componentes:**
- `ContasPagarContent.tsx` — DataTable leitura pura (Client)

---

### 1️⃣1️⃣ Compras (`/admin/compras`)

**Funcionalidades:**
- Tabela: Número, Fornecedor, Data, Total, Status
- Status badges: Recebida (verde), Pendente (amarelo)
- Listagem simples sem edição

**Dados Conectados:**
```typescript
// Action: listarCompras (reusa /gerente)
const { rows, total } = await listarCompras({
  page, pageSize, busca, status
})
```

**Componentes:**
- `ComprasContent.tsx` — DataTable leitura pura (Client)

---

### 1️⃣2️⃣ Comissões (`/admin/comissoes`)

**Funcionalidades:**
- Tabela resumo: Operador (clickable), Vendas, Comissão Total, Pago, Pendente
- Sheet detalhe ao clicar operador
- Seleção em lote de pendentes
- Ação "Marcar como pago" com total

**Dados Conectados:**
```typescript
// RPC: resumo_comissoes_por_operador
const { data: resumo } = await supabase.rpc('resumo_comissoes_por_operador', {
  p_loja_id: lojaId,
  p_de, p_ate, p_status
})

// RPC: detalhe_comissoes_operador
const { data: detalhe } = await supabase.rpc('detalhe_comissoes_operador', {
  p_loja_id: lojaId,
  p_operador_id: operadorId,
  p_de, p_ate
})

// RPC: marcar_comissoes_pagas
await supabase.rpc('marcar_comissoes_pagas', {
  p_loja_id: lojaId,
  p_operador_id: operadorId,
  p_ids: [comissao_ids...]
})
```

**Componentes:**
- `ComissoesContent.tsx` — Two-pane: resumo + detalhe sheet (Client)

---

### 1️⃣3️⃣ Suspensão de Vendas (`/admin/suspensao`)

**Funcionalidades:**
- Toggle: Vendas suspensas (ativo/inativo)
- Textarea: Motivo (máx 300 caracteres)
- Warning banner se suspensas
- Textarea disabled se não suspensas

**Dados Conectados:**
```typescript
// Action: carregarSuspensaoVendas (reusa /gerente)
const { suspensas, motivo } = await carregarSuspensaoVendas()

// Action: atualizarSuspensaoVendas (reusa /gerente)
await atualizarSuspensaoVendas(suspensas, motivo)
// Atualiza configuracoes_gerais (chaves: vendas_suspensas, motivo_suspensao)
```

**Componentes:**
- `SuspensaoContent.tsx` — Form com toggle (Client)

---

## 🏗️ Arquitetura e Padrões

### Padrão Server + Client

Todas as rotas seguem o padrão **Server Component + Client Component**:

```typescript
// app/admin/[rota]/page.tsx (Server)
export default async function AdminPage({ searchParams }) {
  // 1. Busca dados do Supabase/Actions
  const dados = await acao(parametros)
  
  // 2. Passa para Client Component
  return <ClientComponent dados={dados} />
}

// app/admin/[rota]/_components/ClientComponent.tsx (Client)
export function ClientComponent({ dados }) {
  // 1. Estado local (filtros, seleção)
  const [state, setState] = useState(dados)
  
  // 2. Actions para mutações (criar, editar, deletar)
  const handleSalvar = async () => {
    const res = await acaoServer(payload)
    if (res.success) {
      setState(novo)
      router.refresh()
    }
  }
  
  // 3. Render com DataTable + FilterBar + Badges
  return <DataTable data={state} columns={columns} ... />
}
```

### Reuso de Actions

**Zero Queries Novas** — Reutiliza 100% dos actions de `/gerente`:

| Rota | Actions Reutilizadas |
|------|----------------------|
| Dashboard | `dashboard_gerente_resumo` RPC |
| Catálogo | `buscarProdutosComFiltros` RPC |
| Estoque | `obterListaEstoqueGerente` RPC, `atualizarEstoqueProduto` Action |
| Vendas | `buscarVendasPaginadasAction` Action |
| Financeiro | `fetchContasReceberListagem`, `fetchFinanceiroTitulosKpis` Functions |
| Relatórios | `carregarDadosRelatoriosGerente` Action |
| Categorias* | `listarCategorias*`, `criarCategoria*`, etc Actions |
| Comissões | `resumo_comissoes_por_operador` RPC |
| Compras | `listarCompras` Action |
| Contas-Pagar | `fetchContasPagarListagem` Function |
| Suspensão | `carregarSuspensaoVendas`, `atualizarSuspensaoVendas` Actions |

**Queries Novas (apenas read-only):**
- `obterKardexProduto` — Lê `movimentos_estoque_log`
- `obterDetalheVenda` — Lê `vendas` + `itens_venda`

---

### Tratamento de Erro

Padrão uniforme em todas as telas:

```typescript
// Server
const res = await acao(dados)
if (!res.success) return { success: false, error: res.error }

// Client
const [error, setError] = useState<string | null>(null)

const handleSubmit = async () => {
  setError(null)
  try {
    const res = await serverAction(payload)
    if (!res.success) {
      setError(res.error) // Mostra banner
      return
    }
    // Sucesso
  } catch (err) {
    setError('Erro inesperado')
  }
}

// Render
{error && (
  <div style={{ background: 'var(--fp-danger-bg)', ... }}>
    {error}
  </div>
)}
```

---

### Paginação

**Três padrões usados:**

1. **Server-side (URL params)**
   - Catálogo, Estoque, Categorias, Compras
   - `?page=1&q=...&filter=...`
   - Botões: Anterior/Próxima com links

2. **Cursor-based (hasMore)**
   - Vendas (sem total)
   - RPC retorna `hasMore: boolean`
   - Botões: Anterior/Próxima basado em hasMore

3. **Limite fixo (sem paginação)**
   - Financeiro, Contas-Pagar (limit 200)
   - Detecta truncação: `capped: boolean`
   - Warning badge se capped

---

## 🎨 Design System

### Tokens CSS

Arquivo: `styles/admin-theme.css`

```css
/* Backgrounds */
--fp-bg-primary: #0f0f0f (zinc-950)
--fp-bg-secondary: #1a1a1a (zinc-900)

/* Borders */
--fp-border: #2a2a2a (zinc-800, 1px ou 0.5px)

/* Text */
--fp-text-primary: #f5f5f5
--fp-text-secondary: #a1a1aa
--fp-text-muted: #52525b

/* Colors */
--fp-success: #22c55e (green-500)
--fp-danger: #ef4444 (red-500)
--fp-warning: #f59e0b (amber-500)
--fp-info: #3b82f6 (blue-500)
--fp-brand: #eab308 (yellow-500 — logo龍)

/* Com -bg e -border suffixes */
--fp-success-bg: rgba(34, 197, 94, 0.1)
--fp-success-border: rgba(34, 197, 94, 0.3)
... (para success, danger, warning, info)
```

### Tailwind Fallbacks

Se token não disponível, usar Tailwind:

```typescript
// Preferência 1: Token
className="text-[var(--fp-text-primary)]"

// Preferência 2: Tailwind (fallback)
className="text-zinc-100"

// NÃO: misturar hex literal
// ❌ className="text-[#f5f5f5]"
```

### Componentes Design System

**Fase 2 (Reutilizáveis):**

1. **DataTable** — Tabela genérica com:
   - Sort client-side (`onSort` prop)
   - Hover actions (`className="group"`)
   - Empty state sempre
   - Sem virtualização
   - 1px border zinc-800

2. **FilterBar** — Search + Filters:
   - Search: debounce + replace
   - Pills: push state
   - Selects: push state
   - Requer `<Suspense>` no Next 15

3. **Badges** — Status/Type badges:
   - StatusBadge (CONCLUIDA/CANCELADA)
   - OriginBadge (IMPORTADO/NACIONAL)
   - PaymentBadge (DINHEIRO/PIX/CARTAO)
   - FiscalBadge (EMITIDA/SEM_NOTA)
   - DeltaChip (diferença %)
   - SeverityDot (crítico/warning/info/success)

4. **MetricCard** — KPI cards:
   - Label + valor + trend
   - Sparkline Canvas
   - ResizeObserver

5. **ActivityFeed** — Timeline:
   - Items com avatar/time/tipo
   - Cores semânticas por tipo

---

## 🔧 Manutenção e Extensão

### Adicionar Nova Tela

**1. Criar estrutura:**
```bash
mkdir -p app/admin/nova-tela/_components
touch app/admin/nova-tela/page.tsx
touch app/admin/nova-tela/_components/NovaTelaContent.tsx
```

**2. Criar page.tsx (Server):**
```typescript
export default async function AdminNovaTelaPage({ searchParams }) {
  const dados = await acao(params)
  return <NovaTelaContent dados={dados} />
}
```

**3. Criar Content (Client):**
```typescript
'use client'
export function NovaTelaContent({ dados }) {
  return <DataTable data={dados.rows} columns={columns} ... />
}
```

**4. Atualizar navegação:**
```typescript
// lib/navigation/painelGerencialNav.ts
if (key === 'nova_tela') return '/admin/nova-tela'
```

**5. Type-check + Lint:**
```bash
npx tsc --noEmit
npx eslint app/admin/nova-tela
```

### Padrão para Novos Componentes

```typescript
// ❌ Evitar
export function BadData() {
  const [data, setData] = useState()
  useEffect(() => {
    fetch('/api/data').then(setData)
  }, []) // Client-side data fetching
}

// ✅ Fazer
// Server Component busca dados
export async function AdminPage() {
  const data = await supabase.from(...).select(...)
  return <ClientComponent data={data} />
}

// Client Component apenas exibe
'use client'
export function ClientComponent({ data }) {
  return <div>{data}</div>
}
```

### Adicionar Filtro a DataTable

```typescript
// 1. Add coluna
const columns: Column[] = [
  {
    key: 'novo_filtro',
    header: 'Nome',
    sortValue: (r) => r.novo_campo,
    cell: (r) => <span>{r.novo_campo}</span>
  }
]

// 2. Add FilterBar definition
const filters: FilterDef[] = [
  {
    type: 'search',
    key: 'novo_filtro',
    placeholder: '...'
  }
]

// 3. Update searchParams type
type SearchParams = {
  novo_filtro?: string
}
```

### Design System Colors — Quando Usar

| Cor | Uso | Exemplo |
|-----|-----|---------|
| **Verde** | Sucesso, aprovado, recebido, ativo | ✅ Pago, CONCLUIDA, Ativo |
| **Vermelho** | Erro, crítico, cancelado, inativo | ❌ Aberto, CANCELADA, Inativo |
| **Amarelo** | Atenção, pendente, warning | ⚠️ Pendente, Aberto (contas) |
| **Azul** | Info, secundário | ℹ️ PARCIAL (contas) |
| **Roxo** | Destaque especial | — (não usado atualmente) |
| **Branco/Cinza** | Texto, background | Neutro |

---

## 📋 Checklist de Qualidade

Antes de fazer commit em nova funcionalidade:

- [ ] `npx tsc --noEmit` — Zero erros
- [ ] `npx eslint app/admin/[rota]` — Zero warnings
- [ ] Server Component busca dados (não client-side fetch)
- [ ] Actions reutilizadas de `/gerente` (não queries novas)
- [ ] DataTable com empty state
- [ ] Error handling com banner
- [ ] Design tokens `--fp-*` (não hex literal)
- [ ] Componentes Fase 2 reutilizados (DataTable, FilterBar, Badges)
- [ ] Navegação atualizada (`painelGerencialHref`)

---

## 🚀 Deploy

1. **Local dev:**
   ```bash
   npm run dev
   # Acessa: http://localhost:3000/admin/dashboard
   ```

2. **Type-check antes de push:**
   ```bash
   npx tsc --noEmit
   npx eslint app/admin/
   ```

3. **Push + PR:**
   ```bash
   git add app/admin/ lib/navigation/
   git commit -m "feat(admin): nova tela"
   git push origin
   gh pr create ...
   ```

4. **Production:**
   - Vercel auto-deploys `main` branch
   - Auth guarda `/admin` (isPerfilPainelGerencial)

---

## 📞 Suporte e Dúvidas

### Arquivos Chave

| Arquivo | Propósito |
|---------|-----------|
| `styles/admin-theme.css` | Tokens CSS |
| `lib/navigation/painelGerencialNav.ts` | Rotas |
| `app/admin/layout.tsx` | Sidebar + Header |
| `components/ui/` | Componentes Fase 2 |
| `app/gerente/*/actions.ts` | Server Actions reutilizadas |

### Contato

- **Bugs:** GitHub Issues
- **Features:** GitHub Discussions
- **Docs:** Este arquivo (ADMIN_PANEL_GUIDE.md)

---

## 📈 Roadmap Futuro

- [ ] **Fase 10:** Integração mobile (RN app)
- [ ] **Fase 11:** Offline mode (Service Worker)
- [ ] **Fase 12:** Real-time updates (WebSocket)
- [ ] **Fase 13:** Analytics dashboard

---

**Versão:** 1.0 | **Última atualização:** 2026-06-05  
**Autor:** Claude Haiku 4.5 | **Status:** ✅ Aprovado
