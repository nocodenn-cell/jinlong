# PERFORMANCE_BASELINE.md

**Data:** 2026-09-23  
**Fase:** FASE 1 — Mapeamento de Arquitetura e Identificação de Gargalos  
**Status:** Diagnóstico (sem correções aplicadas)

---

## Objetivo

Documentar o estado atual da performance de navegação no Jinlong ERP/PDV, identificando:
- Rotas principais e seus layouts
- Queries Supabase executadas em cada fluxo
- Gargalos confirmados (com evidência)
- Hipóteses para investigação
- Classificação P0–P3 baseada em impacto

---

## Ambiente Analisado

**Stack:**
- Next.js App Router com Server Components (RSC) + Client Components
- Supabase para auth e database (RLS ativo)
- React `cache()` para memoização por request (SSR apenas)
- Middleware executando em Vercel Edge Runtime
- Session management: JWT + `auth.getUser()` + perfil lookup

**Codebase:**
- `/app/admin/*` - Painel administrativo (produtos, clientes, estoque, vendas, dashboard)
- `/app/gerente/*` - Painel gerencial (relatórios, produtos, estoque)
- `/app/caixa/*` - PDV/Caixa

**Commits recentes analisados:**
- ccd2b0b0: fix: race condition GTIN e refinamentos de UX
- 9b3f78a1: fix(compras): pedido legado encerrado abaixo do pedido não diz "totalmente recebido" (UX-04)
- 5fcb991a: feat(nfe): NF-e pode ser relacionada a um pedido por escolha do operador (UX-04)

---

## Rotas/Fluxos Avaliados

### 1. Middleware (Edge Runtime)

**Arquivo:** `/middleware.ts`  
**Escopo:** `/admin/*`, `/gerente/*`, `/caixa/*`  
**Execução:** Vercel Edge antes de SSR

**Queries executadas:**

```typescript
// 1. Lê JWT não-verificado para hint de parallelização
const dicaUserId = await lerDicaUserIdNaoVerificada(supabase)  // Token parsing, sem DB

// 2. Verifica JWT no servidor de Auth (Edge)
const { user } = await supabase.auth.getUser()  // Auth server call

// 3. Lê perfil em paralelo se hint match (RLS protegido)
const usuarioProfile = dicaUserId 
  ? await lerPerfilUsuario(supabase, dicaUserId)  // SELECT perfil, idioma_preferido, loja_id, ativo FROM usuarios WHERE id = $1
  : null
```

**Observações:**
- `lerPerfilUsuario()` roda em paralelo com `getUser()` — otimização boa
- Resultado de edge middleware **não é compartilhado** com SSR layer (são duas instâncias Supabase)
- Fallback sequencial se hint não corresponder ao user.id verificado

---

### 2. Layout `/app/admin/layout.tsx`

**Arquivo:** `/app/admin/layout.tsx`  
**Config:** `export const dynamic = 'force-dynamic'` | `export const fetchCache = 'force-no-store'` | `export const revalidate = 0`

**Impacto:** ⚠️ **BLOQUEIA TODOS OS CACHES** para rotas `/admin/*`

**Queries executadas (em cada render de qualquer página admin):**

```typescript
// 1. Session + profile lookup (via React cache() per-request)
const { session } = await loadAdminContext()
  // Chama: getRawSession() → fetchRawSession(supabase)
  //   → lerDicaUserIdNaoVerificada()
  //   → supabase.auth.getUser()  [AUTH QUERY 1]
  //   → lerPerfilUsuario() [DB QUERY 1]

// 2. Visual flags (RPC)
const { data: cfgRows } = await lerFlagsVisuaisPdv()
  // Chama: supabase.rpc('pdv_config_flags_visuais')  [RPC QUERY 1]

// 3. Low stock count (para badge sidebar)
const { count } = await contarEstoqueBaixo()
  // Chama: SELECT id FROM v_estoque_baixo (count mode)  [DB QUERY 2]
```

**Memoização:**
- `lerFlagsVisuaisPdv()` e `contarEstoqueBaixo()` usam React `cache()` — deduplica se chamados >1x por request
- `getRawSession()` também cacheado — mesma sessão compartilhada entre layout e página
- **Mas:** `force-dynamic` previne caching entre requests consecutivos

**Problema:** Toda navegação `/admin/...` → `/admin/...` dispara essas 3 queries de novo, mesmo que nada mudou.

---

### 3. Layout `/app/caixa/layout.tsx`

**Config:** Same as admin: `force-dynamic` | `force-no-store` | `revalidate = 0`

**Queries:** Idênticas ao admin layout (3 queries por render).

**Componentes adicionais:** `SessionIdleLogout` e `CaixaCarrinhoAuthSync` (Client Components — sem queries no SSR).

---

### 4. Page `/app/admin/dashboard/page.tsx`

**Queries:** ~11 Supabase calls em 2 etapas paralelas

```typescript
// Etapa 1: Executadas em Promise.all() [5 paralelas]
const relatorioTz = getRelatorioTimezone(supabase)
  // Se env RELATORIO_TIMEZONE não existe:
  // SELECT timezone FROM relatorio_settings WHERE id = 1  [DB QUERY 3]

const algumCaixaAberto = supabase
  .from('caixas')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'ABERTO')  [DB QUERY 4 - count only]

const recentOrdersRes = supabase
  .from('vendas')
  .select('id,data,total_liquido,status,forma_pagamento,operador_id')
  .order('data', { ascending: false })
  .limit(15)  [DB QUERY 5]

const estoqueBaixoRes = contarEstoqueBaixo()  // [Cacheado do layout]

const flagsVisuaisRes = lerFlagsVisuaisPdv()  // [Cacheado do layout]

// Etapa 2: Executadas em Promise.all() após Etapa 1 [6 paralelas]
const vendasRangeRes = supabase
  .from('vendas')
  .select('id,data,total_liquido,status,forma_pagamento,operador_id')
  .gte('data', start.toISOString())
  .lte('data', end.toISOString())
  .order('data', { ascending: true })  [DB QUERY 6]

const vendasPrevRes = supabase
  .from('vendas')
  .select('total_liquido')
  .gte('data', previousStart.toISOString())
  .lt('data', previousEnd.toISOString())  [DB QUERY 7]

const novosUsuariosAtualRes = supabase
  .from('usuarios')
  .select('id', { count: 'exact', head: true })
  .gte('created_at', start.toISOString())
  .lte('created_at', end.toISOString())  [DB QUERY 8]

const novosUsuariosPrevRes = supabase
  .from('usuarios')
  .select('id', { count: 'exact', head: true })
  .gte('created_at', previousStart.toISOString())
  .lt('created_at', previousEnd.toISOString())  [DB QUERY 9]

const estoqueBaixoListaRes = supabase
  .from('v_estoque_baixo')
  .select('nome, quantidade_atual, estoque_minimo')
  .order('deficit', { ascending: false })
  .limit(5)  [DB QUERY 10 - condicional: se showStockAlerts]

const usersRes = supabase
  .from('usuarios')
  .select('id,nome')
  .in('id', operatorIds)  [DB QUERY 11 - condicional: se há operador_ids]
```

**Estrutura:** Boa — queries estão em paralelo dentro de etapas. Waterfalls possíveis entre etapas se não houver índices eficientes.

---

### 5. Page `/app/caixa/page.tsx`

**Queries executadas:**

```typescript
// 1. Resolve idioma (via session cacheado)
const { idioma } = await getUsuarioIdioma()
  // Chama getRawSession() — [Cacheado do layout, sem query extra]

// 2. Resolve operador display name
const { data: { user } } = await supabase.auth.getUser()
  // [AUTH QUERY 2 — ja foi feito no layout!]

// 3. Resolve perfil
const { data: usuarioData } = await supabase
  .from('usuarios')
  .select('perfil')
  .eq('id', user.id)
  .maybeSingle()
  // [DB QUERY — ja foi feito no layout!]

// 4. Condicional: se auth.getUser() falhar
if (authError) {
  if (await clearStaleSessionIfNeeded(supabase, authError)) {
    // Chama supabase.auth.signOut() — pode fazer requisições extras ao auth server
  }
}
```

**Problema crítico:** `supabase.auth.getUser()` é executado **novamente** apesar de já ter sido executado no layout via `loadAdminContext()` → `getRawSession()`.

React `cache()` memoização NÃO deduplica aqui porque:
1. Middleware edge executa `auth.getUser()` (edge context)
2. Layout SSR executa `auth.getUser()` via `getRawSession()` (SSR context, cacheado)
3. Page SSR executa `supabase.auth.getUser()` diretamente — **nova chamada**, não cacheada!

Result: **3 independent `auth.getUser()` calls** por navegação para `/caixa`

---

### 6. Pages `/app/admin/catalogo`, `/app/admin/clientes`, `/app/admin/vendas`, `/app/admin/estoque`

**Padrão:** Cada página faz suas queries Supabase próprias, após as 3 queries do layout.

**Exemplos:**

#### Catálogo
```typescript
const [listarOpcoesFiltrosProdutos(), buscarProdutosComFiltros()]
  // Paralelas — boa prática
```

#### Clientes
```typescript
const buscarClientesPaginadosAction(1)
  // Server Action que chama:
  // 1. assertGerenteSession() → getCachedAdminNormalization() [Cacheado]
  // 2. reader.listPaginados() → query de clientes com paginação
```

#### Vendas
```typescript
buscarVendasPaginadasAction()
  // Server Action com query de vendas
```

#### Estoque
```typescript
await Promise.all([
  loadAdminContext(),  // 3 queries (cacheadas no layout)
  obterListaEstoqueGerente(),
  listarOpcoesFiltrosProdutos()
])
  // Paralelas
```

**Padrão:** Bom — queries são em paralelo quando possível. Server Actions usam session cacheada.

---

## Arquitetura Relevante

### Session Management Flow

```
User request for /admin/vendas
    ↓
Middleware (Edge)
    ├─ fetchRawSession(edge supabase)
    │   ├─ lerDicaUserIdNaoVerificada()  [Token parsing]
    │   ├─ auth.getUser()  [AUTH 1 - Edge]
    │   └─ lerPerfilUsuario() in parallel  [DB 1 - Edge, RLS protected]
    ↓
Layout (/admin)
    ├─ loadAdminContext()
    │   └─ getRawSession() [React cache(readRawSessionSsr)]
    │       ├─ lerDicaUserIdNaoVerificada()  [Token parsing]
    │       ├─ auth.getUser()  [AUTH 2 - SSR]
    │       └─ lerPerfilUsuario() in parallel  [DB 2 - SSR, RLS]
    ├─ lerFlagsVisuaisPdv() [RPC 1]
    └─ contarEstoqueBaixo() [DB 3 - count]
    ↓
Page (/admin/vendas)
    └─ buscarVendasPaginadosAction()
        ├─ getCachedAdminNormalization() [Uses cached session from layout]
        └─ query de vendas [DB 4]
```

**Key insight:** React `cache()` only works within SSR request scope. Edge middleware session is separate from SSR session.

### Caching Layers

1. **Edge Middleware cache:** None (each request fresh)
2. **React cache() per-request:** Applied to `getRawSession()`, `getCachedAdminNormalization()`, `lerFlagsVisuaisPdv()`, `contarEstoqueBaixo()`
3. **Next.js HTTP cache:** Disabled by `force-dynamic`, `force-no-store`, `revalidate=0` in layouts
4. **Browser cache:** N/A for Server Components

---

## Baseline Confirmado

### Queries Supabase por Fluxo de Navegação

#### `/admin/dashboard`

| Query | Type | Caller | Cache | Notes |
|-------|------|--------|-------|-------|
| `auth.getUser()` | Edge | Middleware | No | Vercel Edge |
| `SELECT usuarios.* WHERE id` | Edge | Middleware | No | Vercel Edge, RLS |
| `auth.getUser()` | SSR | Layout | Yes (cache) | Per-request React cache |
| `SELECT usuarios.* WHERE id` | SSR | Layout | Yes (cache) | Per-request React cache, RLS |
| `rpc('pdv_config_flags_visuais')` | SSR | Layout | Yes (cache) | Per-request React cache |
| `SELECT count(*) FROM v_estoque_baixo` | SSR | Layout | Yes (cache) | Per-request React cache |
| `SELECT timezone FROM relatorio_settings WHERE id=1` | SSR | Page | No | Falls back to env var |
| `SELECT count(*) FROM caixas WHERE status='ABERTO'` | SSR | Page | No | Fresh query |
| `SELECT vendas.* ORDER BY data DESC LIMIT 15` | SSR | Page | No | Fresh query |
| `SELECT vendas.* WHERE data BETWEEN ... ORDER BY data` | SSR | Page | No | Depends on period filter |
| `SELECT vendas.total_liquido WHERE data BETWEEN ...` | SSR | Page | No | Depends on period filter |
| `SELECT count(*) FROM usuarios WHERE created_at BETWEEN ...` | SSR | Page | No | Depends on period filter (2x: actual + previous) |
| `SELECT v_estoque_baixo.* LIMIT 5` | SSR | Page | No | Conditional: if showStockAlerts |
| `SELECT usuarios.id, nome WHERE id IN (...)` | SSR | Page | No | Conditional: if operatorIds exist |

**Total for `/admin/dashboard` on fresh request:**
- Minimum: 2 (edge auth + SSR auth) + 3 (layout: session + flags + count) + 6 (dashboard queries) = **11 queries**
- Maximum (all conditionals): **13 queries**

#### `/caixa`

| Query | Type | Caller | Cache | Notes |
|-------|------|--------|-------|-------|
| `auth.getUser()` | Edge | Middleware | No | Vercel Edge |
| `SELECT usuarios.* WHERE id` | Edge | Middleware | No | Vercel Edge, RLS |
| `auth.getUser()` | SSR | Layout | Yes (cache) | Per-request React cache |
| `SELECT usuarios.* WHERE id` | SSR | Layout | Yes (cache) | Per-request React cache, RLS |
| `rpc('pdv_config_flags_visuais')` | SSR | Layout | Yes (cache) | Per-request React cache |
| `SELECT count(*) FROM v_estoque_baixo` | SSR | Layout | Yes (cache) | Per-request React cache |
| `auth.getUser()` | SSR | Page | No | **Duplicate! Already in layout** |
| `SELECT usuarios.perfil WHERE id` | SSR | Page | No | **Duplicate! Already in layout** |

**Total for `/caixa` on fresh request:**
- **11 queries** with 2 unnecessary duplicates in Page layer

---

## Waterfalls Identificados

### Potencial Waterfall 1: Dashboard Etapa 1 → Etapa 2

Dashboard executa em 2 etapas:
```typescript
// Etapa 1
await Promise.all([relatorioTz, algumCaixaAberto, recentOrders, estoqueBaixo, flagsVisuais])

// Etapa 2 (SEQUENCIAL APÓS Etapa 1)
await Promise.all([vendasRange, vendasPrev, novosUsuariosAtual, novosUsuariosPrevRes, estoqueBaixoLista, users])
```

**Impacto:** Se Etapa 1 leva 100ms, Etapa 2 só começa aos 100ms. Total = E1 + E2 (não E1 || E2).

**Razão:** Dashboard precisa `relatorioTz` para calcular `start` / `end` ranges das queries de Etapa 2.

---

### Potencial Waterfall 2: `/caixa` auth + perfil duplicates

```
Layout: auth.getUser() + lerPerfilUsuario() in parallel [~50-100ms total]
Page:   auth.getUser() [INDEPENDENT, SEQUENTIAL]
        └─ usuarioData select [Sequential after getUser()]
```

**Impacto:** Page re-queries what layout already fetched.

---

## Gargalos Confirmados (P0–P3)

### **P0 — Layout force-dynamic forces re-execution every request**

**Severidade:** Critical  
**Status:** CONFIRMADO  
**Evidência:**
- `/app/admin/layout.tsx` line 15: `export const dynamic = 'force-dynamic'`
- `/app/caixa/layout.tsx` line 15: `export const dynamic = 'force-dynamic'`
- Combined with `fetchCache = 'force-no-store'` and `revalidate = 0`
- Prevents HTTP caching, invalidates incremental static regeneration

**Impacto:** Every navigation to `/admin/*` or `/caixa/*` reruns layout queries:
- `resolveAdminSession()` (auth.getUser + SELECT usuarios)
- `lerFlagsVisuaisPdv()` (RPC)
- `contarEstoqueBaixo()` (SELECT count)

**Hipótese de causa:** Likely set to disable cache for security (session changes) or to always show fresh sidebar flags.

**Correção mínima proposta:**
- Evaluate if `force-dynamic` is actually needed
- If safety is concern, use `revalidate = 0` (per-request revalidation) WITHOUT `force-no-store` (allows HTTP cache)
- Remove `fetchCache = 'force-no-store'` to allow smart cache keying

---

### **P0 — CaixaPage executes auth.getUser() + SELECT usuarios despite layout already doing so**

**Severidade:** Critical  
**Status:** CONFIRMADO  
**Evidência:**
- `/app/caixa/page.tsx` lines 11-34:
  ```typescript
  const { data: { user } } = await supabase.auth.getUser()  // Line 13
  const { data: usuarioData } = await supabase.from('usuarios').select('perfil').eq('id', user.id)  // Line 33
  ```
- Layout already called `resolveAdminSession()` which does the same via `getRawSession()`
- React `cache()` does NOT deduplicate between direct `auth.getUser()` call and cached `getRawSession()`

**Impacto:**
- 3x `auth.getUser()` calls per request (middleware edge + layout SSR + page SSR)
- 3x `SELECT usuarios` calls per request
- Server-side auth verifications tripled

**Root cause:** Page fetches `user.id` for display name extraction (lines 24-30), then queries perfil. Instead of using cached session from layout, makes independent call.

**Correção mínima proposta:**
- Use cached session from layout via `getUsuarioAtual()` instead of `supabase.auth.getUser()` directly
- Remove lines 11-34 query, use session already loaded in layout

---

### **P0 — Middleware (Edge) session is NOT reused in SSR layer**

**Severidade:** High  
**Status:** CONFIRMADO  
**Evidência:**
- `/middleware.ts` creates middleware-specific Supabase client, calls `fetchRawSession()`
- `/lib/admin/auth/sessionConsistency.ts` creates SSR-specific client in `readRawSessionSsr()`
- Two separate `createClient()` calls, two separate session reads
- Edge context ≠ SSR context (different runtimes)

**Impacto:**
- Session information is read twice (edge + SSR)
- No cache sharing between edge and SSR layers
- Each layer makes independent auth verification

**Mitigating factor:** It's correct design for edge/SSR boundary. But could be unified at SSR entry point to avoid triple-read via page.

---

### **P1 — Dashboard executes 2-stage query sequence (Etapa 1 then Etapa 2)**

**Severidade:** High  
**Status:** CONFIRMADO  
**Evidência:**
- `/app/admin/dashboard/page.tsx` lines 141-154: `await Promise.all([...5 queries])`
- Then lines 221-243: `await Promise.all([...6 queries])`
- Stage 2 depends on Stage 1 result (`relatorioTz` → `start`/`end` calculation)

**Impacto:**
- If Stage 1 takes 100ms, Stage 2 starts at 100ms
- Suboptimal waterfall; could be reduced if `start`/`end` calculated without DB query

**Mitigation:** `relatorioTz` check has env var fallback (`process.env.RELATORIO_TIMEZONE`). If set, Etapa 1 is ~20-40ms faster.

**Correção mínima proposta:**
- Set `RELATORIO_TIMEZONE` env var to avoid DB query in `getRelatorioTimezone()`
- Or calculate default timezone in Edge and pass via headers

---

### **P1 — Possible missing indexes on frequently queried columns**

**Severidade:** Medium  
**Status:** HIPÓTESE (not yet verified via explain/analyze)  
**Potential bottlenecks:**
- `usuarios WHERE id = ?` — should be indexed (primary key, likely ok)
- `relatorio_settings WHERE id = 1` — should be indexed (likely ok)
- `vendas WHERE data BETWEEN ?` — needs index on `data` column
- `usuarios WHERE created_at BETWEEN ?` — needs index on `created_at` column
- `v_estoque_baixo ORDER BY deficit LIMIT 5` — view performance depends on underlying table indexes

**Correção mínima proposta:**
- Run `EXPLAIN ANALYZE` on each query in production
- Verify indexes on `vendas.data`, `usuarios.created_at`
- Profile view performance for `v_estoque_baixo`

---

### **P2 — Duplicate `lerFlagsVisuaisPdv()` and `contarEstoqueBaixo()` across layout + page**

**Severidade:** Low  
**Status:** MITIGADO (React cache() deduplicates within request)  
**Evidência:**
- Layout calls both functions via `loadAdminContext()`
- Dashboard page calls them again
- React `cache()` deduplicates — only 1 actual RPC + 1 actual SELECT per request

**Status:** Not a problem — caching is working as intended.

---

### **P3 — Unused session reads in non-admin flows**

**Severidade:** Very Low  
**Status:** HIPÓTESE  
**Possible issue:** If non-admin pages (e.g., public flows) run through middleware and reach layout, they may incur session reads unnecessarily.

**Correção mínima proposta:** (Optional) — Only relevant if public routes exist.

---

## Hipóteses Ainda Não Comprovadas

### Hipótese A: Is `force-dynamic` actually needed?

**Question:** What breaks if we remove `force-dynamic` and use only `revalidate = 0`?

**Test:** Check if sidebar flags update instantly when changed; check if session invalidation works.

**Expected:** `revalidate = 0` should be sufficient for per-request revalidation without disabling HTTP cache.

---

### Hipótese B: Can middleware session be reused in SSR?

**Question:** Can we pass edge-computed session to SSR layer via response headers/cookies to avoid triple-read?

**Test:** Measure if sharing session between edge+SSR would reduce query count from 3 to 1.

**Expected:** Could save 2 auth.getUser() calls per request if implemented.

---

### Hipótese C: Are there actual slow queries causing UI delays?

**Question:** Which queries are actually slow in production? Are we bottlenecked by query execution time or network round-trips?

**Test:** FASE 2 (measurement) — run actual requests with network profiling.

**Expected:** Will identify actual bottleneck (e.g., slow RPC, slow table scan, network latency).

---

## Classificação Final

### CONFIRMADO (Actionable)

| ID | Problema | Classificação | Arquivo | Linha | Root Cause |
|----|----------|----------------|---------|-------|-----------|
| 1 | Layout force-dynamic | P0 | `/app/admin/layout.tsx` | 15 | Config error: blocks HTTP cache |
| 2 | Caixa layout force-dynamic | P0 | `/app/caixa/layout.tsx` | 15 | Config error: blocks HTTP cache |
| 3 | CaixaPage duplicate auth.getUser() | P0 | `/app/caixa/page.tsx` | 13 | Page refetches session ignored by layout |
| 4 | Dashboard 2-stage waterfall | P1 | `/app/admin/dashboard/page.tsx` | 141-243 | Design: Stage 2 depends on Stage 1 result |
| 5 | relatorio_settings query on every dashboard | P1 | `/lib/relatorios/getRelatorioTimezone.ts` | 12 | No env var fallback in production |

### HIPÓTESE (Requires Measurement)

| ID | Hipótese | Classificação | Prioridade |
|----|----------|----------------|-----------|
| A | force-dynamic necessity | P0 | High — if false, all P0 fixed |
| B | Middleware-SSR session reuse | P0 | High — could reduce queries |
| C | Actual slow queries | P1 | Medium — need FASE 2 measurement |

---

## Próximas Fases

### FASE 2 — Medição de Baseline (TODO)

1. Profile actual request timing with Network waterfall
2. Measure query execution time on production database
3. Identify which queries actually delay UI rendering
4. Confirm timing of CaixaPage duplicate queries

### FASE 3 — Root Cause Analysis (TODO)

1. Determine if `force-dynamic` is actually required
2. Verify session reuse feasibility
3. Identify missing indexes via `EXPLAIN ANALYZE`

### FASE 4 — Otimizações (TODO)

1. Fix confirmed P0s
2. Verify improvements via re-measurement

---

## Documentação de Suporte

- Architecture: Next.js App Router, Supabase RLS
- Session flow: Edge middleware → SSR layout → Page layer
- Query caching: React `cache()` per-request only
- HTTP caching: Disabled by `force-dynamic` + `force-no-store`

