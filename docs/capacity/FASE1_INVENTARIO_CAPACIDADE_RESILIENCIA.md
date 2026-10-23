# FASE 1 — Inventário e Diagnóstico (somente leitura)

**Data:** 2026-10-09  
**Repositório:** `nocodenn-cell/fastproduct`  
**Método:** análise de código, migrations, docs e tooling existentes — **sem carga em produção**  
**Status:** diagnóstico entregue; correções estruturais **não** autorizadas nesta fase

---

## Sumário executivo

| Pergunta | Resposta com evidência |
|----------|------------------------|
| O sistema escala para N lojas SaaS? | **Não comprovado.** Existe operação de **1 loja piloto**. Não há baseline de vendas/hora, caixas simultâneos ou p95 de finalização sob carga multi-loja. |
| Offline funciona? | **Sim no desktop (`pdv-local`)** via SQLite + outbox → Edge `sync-outbox`. O caixa **web** (`pdv-importados/app/caixa`) é **online-first** e **não** opera venda sem Supabase. |
| Há staging para ensaios? | **Não.** `docs/AMBIENTES_E_RELEASE.md` (2026-08-19): staging nunca foi provisionado; um único projeto Supabase (`jinlong`) serve produção. |
| Idempotência de venda? | **Sim no caminho canônico web** (`idempotencyKey` = `venda_id` + `pg_advisory_xact_lock`). Offline: `ON CONFLICT DO NOTHING` + outbox com backoff. |
| Isolamento multi-loja? | **Por `loja_id` (RLS)**. Multiempresa (`empresa_id`) é especificação **não implementada**. |
| Capacidade de conexões DB? | Medido em auditoria prévia: **`max_connections = 60`**, `shared_buffers` ≈ 280 MB (instância pequena). Pooler local **desligado**. |
| Ferramentas de stress existentes? | `npm run stress:pdv` / `gate:pdv` — gates de **idempotência/consistência**, **não** benchmarks de capacidade (k6/RPS). |

**Decisão preliminar:** **NO-GO** comercializar 5+ lojas sem FASE 3–5 em ambiente isolado. **GO CONDICIONAL** apenas para manter o piloto atual e preparar homologação.

---

## 1. Arquitetura efetiva

### 1.1 Módulos do monorepo

| Módulo | Papel | Evidência |
|--------|-------|-----------|
| `pdv-importados` | Next.js 15 — caixa web online + Admin V2 | `package.json` workspaces; `pdv-importados/app/caixa/` |
| `pdv-local` | Tauri 2 desktop — local-first SQLite + outbox | `pdv-local/README.md:1-12`; `pdv-local/src-tauri/` |
| `backend` | SSOT Supabase: ~400 migrations + Edge Functions | `backend/supabase/migrations/`; `backend/supabase/functions/` |
| `shared-core` | Domínio TS puro (carrinho, preço, caixa) | `shared-core/src/` |
| `site` | Marketing (Vercel separado, região `gru1`) | `site/vercel.json` |
| `/workspace/supabase` | Stub vazio — **não** é SSOT | Apenas `.branches` |

### 1.2 Diagrama de escrita

```
┌─────────────────────┐         ┌──────────────────────────┐
│  pdv-importados     │         │  pdv-local (Tauri)       │
│  Caixa web ONLINE   │         │  SQLite + outbox         │
│  Auth JWT + RLS     │         │  SYNC_KEY → Edge         │
└──────────┬──────────┘         └────────────┬─────────────┘
           │ Server Action                   │ HMAC sync
           │ finalizar_venda_…_v4            │ sync-outbox
           ▼                                 ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase Postgres (RLS loja_id) + PostgREST + GoTrue    │
│  Edge: sync-outbox | validar-gerente | fiscal-worker     │
└──────────────────────────────────────────────────────────┘
           ▲
           │ Deploy web: Vercel (região gru1)
           │ Root vercel.json → turbo filter pdv-importados
```

### 1.3 Deploy

| Superfície | Destino | Evidência |
|------------|---------|-----------|
| Web PDV | Vercel → app `pdv-importados` | `vercel.json`; `README.md` |
| Região | `gru1` | `pdv-importados/vercel.json` |
| Backend | Supabase `db push` + `functions deploy` | `deploy.md` |
| Desktop | Binário Tauri (não Vercel) | `pdv-local/` |

**Drift documentado:** root `vercel.json` usa `outputDirectory: ".next"`; docs às vezes citam `pdv-importados/.next` (`docs/DEPLOY_VERCEL.md`).

### 1.4 Clientes Supabase (web)

| Cliente | Chave | Arquivo |
|---------|-------|---------|
| Browser | anon | `pdv-importados/lib/supabase/client.ts` |
| Server SSR | anon + cookies | `pdv-importados/lib/supabase/server.ts` |
| Admin | `SUPABASE_SERVICE_ROLE_KEY` | `pdv-importados/lib/supabase/admin.ts` |

Edge Functions usam **service_role** (bypass RLS por design): `sync-outbox`, `validar-gerente`, `fiscal-worker`.

---

## 2. Caminho completo de uma venda (web)

Fonte canônica congelada: `docs/venda-golden-flow.md`.

### 2.1 Sequência UI → DB

1. Operador bipa / busca produto → `buscarProdutoComPrecoCaixa` (1 Server Action por scan).
2. Clica **Finalizar** → `CaixaPdvCartSaleBar` → `CaixaPageClient.handleFinalizar`.
3. Cliente gera/reusa `idempotencyKey` (`garantirVendaIdempotencyKey` em `shared-core`).
4. Timeout cliente **30 s** (`FINALIZACAO_TIMEOUT_MS` em `CaixaPageClient.tsx:105`).
5. Server Action `finalizarVendaCaixa` → `caixaVendas.impl.ts`:
   - revalida preços (`calcular_preco_produto` × N itens);
   - exige caixa `ABERTO`;
   - chama RPC `finalizar_venda_transacional_canonica_v4`.
6. Dentro da TX (unscoped): advisory lock → itens → `decrementar_estoque_seguro` (`FOR UPDATE`) → pagamentos → evento → fiscal opcional.
7. Pós-sucesso: pricing version (best-effort), alertas leves, limpa carrinho.

**Caller único autorizado da v4:** `pdv-importados/app/caixa/server/caixaVendas.impl.ts`  
**Writer offline:** apenas `backend/supabase/functions/sync-outbox/index.ts` → `registrar_venda_com_itens`.

### 2.2 Quantidade de chamadas por venda (estimativa de código)

Assumindo **N** itens precificados, caminho feliz, sem desconto gerente:

| Camada | Round-trips |
|--------|-------------|
| Browser → Next (finalize) | **1** Server Action |
| Dentro da action → Supabase | ~**8 + N** (auth, pricing version, produtos, `calcular_preco_produto` × N, config, caixa, **1 RPC v4**, alertas) |
| Dentro da RPC v4 (mesma sessão PG) | **O(N)** statements (preço, insert, estoque × N, pagamentos) |
| Scan pré-venda (por item) | **+1** action cada |

**Hotspots de capacidade (não medidos em carga):**

1. **Preço duplicado:** TS × N + SQL × N na mesma finalização.
2. **Serialização de estoque:** `FOR UPDATE` por SKU — caixas concorrentes no mesmo produto esperam.
3. **Auth em cascata:** middleware + RSC + action repetem `getUser` / perfil (`docs/audits/AUDITORIA_AUTH_PERFORMANCE.md`).
4. **Sem reserva no carrinho:** contenção só no finalize.

### 2.3 Offline (`pdv-local`) — comprovado no código

| Etapa | Evidência |
|-------|-----------|
| Persistência local | SQLite `pdv_local.db` — `pdv-local/src-tauri/src/db.rs` |
| Venda local + outbox | `registrar_venda_local` → tabela `outbox` tipo `VENDA_REGISTRADA` |
| Sync | `sync_outbox_real_cmd` → Edge `sync-outbox` |
| Retry | `falhas_consecutivas` + `next_retry_at` (backoff); DLQ |
| Estoque na nuvem | Baixa **no sync**, não no momento da venda local → risco de conflito se web já vendeu o último item |

**NÃO comprovado:** caixa web operando offline. Tauri ≠ fallback do browser.

**Divergência doc×código:** `docs/ARCHITECTURE.md:117-118` cita Axios/React Query no desktop — **falso** (reqwest + Zustand).

---

## 3. Transações, locks, índices e gargalos PostgreSQL

### 3.1 Locks no caminho crítico

| Mecanismo | Onde | Função |
|-----------|------|--------|
| `pg_advisory_xact_lock(hashtext(p_venda_id))` | RPC finalizar v4 | Idempotência / anti double-submit |
| `SELECT … FOR SHARE` no caixa | Wrapper v4 (SEC-04) | Venda vs fechamento |
| `SELECT … FOR UPDATE` em `estoque` | `decrementar_estoque_seguro` | Última unidade / race de SKU |
| Unique `estoque_baixas(venda_id, produto_id)` | mig 016 | Idempotência de baixa |
| `FOR UPDATE` em `fechar_caixa_atomico` | migrations 207 / 20261007… | Fecha caixa com exclusão |
| `FOR UPDATE SKIP LOCKED` + lease | fiscal claim | Evita dual-worker |

### 3.2 Índices relevantes

- `vendas(data)`, `vendas(caixa_id)`, `vendas(operador_id)` — schema inicial  
- `estoque` unique `(loja_id, produto_id)` — mig 032  
- `idx_caixas_loja_id` — mig 043 (ajuda RLS)  
- `uq_caixas_operador_aberto` — um caixa aberto por operador  

### 3.3 Gargalos observados (auditorias prévias — navegação, não venda sob carga)

De `docs/audits/AUDITORIA_AUTH_PERFORMANCE.md`:

| Achado | Valor | Status |
|--------|-------|--------|
| `max_connections` | **60** | Medido |
| `shared_buffers` | ≈ 280 MB | Medido (Micro inferido) |
| Navegação fria | 2–8 s (picos) | Confirmado como auth/pool, não SQL de domínio |
| SQL `usuarios` | média **1,9 ms** | Confirmado |
| Abertura fria | ~**8 conexões** novas de uma vez | Confirmado |
| Pooler local | `enabled = false` | `backend/supabase/config.toml:43-44` |

**Lacuna:** não há medição de p95/p99 de `finalizar_venda_transacional_canonica_v4` sob N caixas × M lojas.

---

## 4. Limites de conexão, concorrência e infra

| Recurso | Limite / comportamento | Fonte |
|---------|------------------------|-------|
| Postgres connections | 60 | Auditoria auth |
| Pooler local (config) | off; default_pool_size=20, max_client_conn=100 | `config.toml` |
| App pool (Prisma/pg) | **Inexistente** | grep |
| Realtime | **1 canal WebSocket por caixa aberto** (`movimentacoes_caixa`) | `useMovimentacoesRealtime.ts` |
| `validar-gerente` rate limit | user 5 / IP 20 / device 10 / global 60 | Edge function |
| `fiscal-worker` batch | default 20, cap 100 | Edge function |
| `sync-outbox` | max 200 events/request | Edge function |
| Vercel | Serverless/Edge — cold start descartado como causa principal de auth lenta | Auditoria |

**Implicação multi-loja:** N caixas abertos ⇒ N conexões Realtime + pressão PostgREST/GoTrue. Com teto 60 conexões PG, rajadas de navegação admin + caixas + sync desktop podem saturar o pool **antes** do limite de negócios.

---

## 5. Offline, sync, retry, idempotência, timeout

### 5.1 Matriz

| Cenário | Comportamento comprovado | Gap |
|---------|--------------------------|-----|
| Double-click finalize (mesmo `venda_id`) | Advisory lock + replay se totais iguais; payload divergente → erro tipado | — |
| Timeout 30 s no cliente | Mantém `vendaFinalizacaoPendente`; modal de verificação; **não** auto-rePOST | Operador precisa confirmar |
| Retry após timeout | Manual via `handleVerificarVendaPendente` | Sem retry automático no web |
| Offline desktop | Vende no SQLite; sync assíncrono | Estoque cloud pode falhar no sync |
| Falha sync | Backoff + DLQ | Reconciliação operacional precisa ser ensaiada |
| `client_request_id` | Usado em criação de produto/estoque inicial | **Não** no caminho de venda (usa `idempotencyKey`) |

### 5.2 Invariantes já defendidos em código/testes de consistência

- Nenhuma segunda baixa para o mesmo `(venda_id, produto_id)` (`BAIXA_JA_EXISTE`).
- Escassez de estoque sob concorrência → erro tipado (não saldo negativo silencioso).
- Suite `dev-tools/gate-test-suite.ts`: duplicação, split-brain, race, KPI drift.

**Estes testes não substituem carga multi-loja nem duração 8–12 h.**

---

## 6. Pontos únicos de falha (SPOF)

| SPOF | Impacto se cair | Mitigação atual |
|------|-----------------|-----------------|
| **Projeto Supabase único (`jinlong`)** | Todas as lojas web param; sync desktop falha | Desktop continua vendendo localmente até sync |
| **Postgres / PostgREST / GoTrue** | Auth + finalize web indisponíveis | Idempotência ajuda retry; não há multi-região |
| **Vercel (pdv-importados)** | Caixa web e admin indisponíveis | Desktop independente do deploy web |
| **Edge `sync-outbox`** | Desktop não sincroniza (fila cresce) | Outbox local + DLQ |
| **Edge `fiscal-worker`** | Atraso NF-e (venda já concluída se enqueue best-effort) | Fila com lease; não bloqueia venda se configurado assim |
| **Focus NFe (externo)** | Fiscal | Fora do caminho crítico de dinheiro/estoque se enqueue assíncrono |
| **Instância Micro (60 conn)** | Degradação global sob pico | **Sem autoscaling DB documentado** |
| **Ausência de staging** | Impossível ensaiar falha sem risco a cliente | **P0 operacional** |

Queda do backend **paralisa todas as lojas web simultaneamente** — não há isolamento de carga por tenant em infra (só RLS de dados).

---

## 7. Monitoramento, logs, alertas, backup e recuperação

| Camada | Estado | Evidência |
|--------|--------|-----------|
| Sentry | Web + desktop instrumentados | `pdv-importados` Sentry; `pdv-local/src/lib/sentry.ts` |
| Health | `/api/health` — checa `lojas`; HTTP 200 mesmo degradado | `app/api/health/route.ts` |
| Analytics | Vercel Analytics / Speed Insights | deps do app |
| Alertas infra | Checklists manuais (`monitoramento.md`, `POST-DEPLOY-MONITORING.md`) | Sem PagerDuty/Opsgenie no repo |
| Backup | `backup.sh` + workflow diário age-encrypted | `.github/workflows/backup-scheduled.yml` |
| Freshness | CI falha se backup > 25 h | `backup-freshness-monitor.yml` |
| Restore drill | Workflow `backup-restore-test.yml` | Precisa validação em FASE 4 |
| Storage objects | **Não** cobertos pelo dump agendado | Comentário no workflow |

**RPO sinalizado:** ~24 h (freshness). **RTO de “voltar a vender”:** não medido (alvo FASE 4/5).

---

## 8. Isolamento de carga e de dados entre lojas

### 8.1 Dados (RLS)

- Tenant operacional = **`loja_id`** via `usuarios.loja_id` / joins em `caixas`.
- Políticas em `vendas`, `estoque`, `vendas_pagamentos`, etc. (ex.: mig 042, 051).
- ADMIN / DONO: bypass ou visão macro conforme política.
- `empresa_id`: **especificação apenas** (`docs/architecture/ESPEC_MULTIEMPRESA_V1.md` — execução não autorizada).

### 8.2 Carga (infra)

- **Sem** isolamento de pool, fila ou projeto por loja.
- Uma loja “barulhenta” (admin + relatórios + muitos caixas) compete pelos **mesmos 60 connections** e pelo mesmo PostgREST.
- Realtime é por `caixa_id` (bom), mas o teto de conexões é global.

### 8.3 Teste de vazamento entre lojas

**Não executado nesta fase.** Plano em FASE 2/4: operadores de lojas distintas tentando ler/escrever cruzado; assert 0 linhas cruzadas.

---

## 9. Tooling existente vs necessidade

| Tool | Serve para | Não serve para |
|------|------------|----------------|
| `npm run stress:pdv` | Idempotência, retry, race em **1 loja** (dev/local) | Throughput multi-loja, p95, 8–12 h soak |
| `npm run gate:pdv` | Chaos controlado + guard staging | Capacidade comercial |
| `guard:no-prod-target` | Bloquear alvo prod em scripts | — |
| k6 / Artillery | **Ausente** | — |
| `PERFORMANCE_BASELINE.md` | Contagem de queries de navegação | Latência de venda sob carga |

Lacuna já registrada em `docs/go-live/06-validacao-pre-go-live.md:211-212`: sem número-alvo, “passou no stress” não significa capacidade.

---

## 10. Achados classificados

### P0 — bloqueiam comercialização segura

1. **Staging inexistente** — qualquer ensaio real arrisca o banco do cliente (`AMBIENTES_E_RELEASE.md`).
2. **Capacidade multi-loja não medida** — zero evidência para 5/10/25/50 lojas.
3. **Teto de conexões baixo (60) + pool frio** — risco de paralisia global sob pico simultâneo.
4. **SPOF de projeto único** — falha Supabase afeta todas as lojas web.

### P1 — risco operacional alto

5. Preço recalculado duas vezes (TS + SQL) × N itens por venda.
6. Estoque sem reserva no carrinho → contenção no finalize em SKUs quentes.
7. Web sem auto-retry; recuperação depende do operador (modal pendente).
8. Sync offline pode falhar estoque se web consumiu a última unidade.
9. Fiscal worker sob demanda (não consumer contínuo) — backlog sob pico de emissão.
10. Health check retorna 200 mesmo degradado — monitoramento externo pode mentir.

### P2 — dívida / melhoria

11. Multiempresa não implementada (limitação de produto SaaS, não de loja única).
12. Drift `vercel.json` outputDirectory vs docs.
13. `ARCHITECTURE.md` ainda cita Axios/React Query no desktop.
14. `/workspace/supabase` stub confunde auditoria.
15. Sem alertas automatizados de SLO (só Sentry + checklists).

---

## 11. O que esta fase **não** fez (explícito)

- Não executou carga contra produção nem contra o projeto `jinlong`.
- Não alterou `.env`, infraestrutura, migrations ou Edge Functions.
- Não implementou correções estruturais.
- Não produziu números de p50/p95/p99 de finalização sob N lojas — **porque o ambiente seguro ainda não existe**.

---

## 12. Próximo passo recomendado (gate humano)

1. **Aprovar** provisionamento de **projeto Supabase de homologação** (plano que permita isolamento; branching Pro ou projeto separado).
2. **Aprovar** URL Vercel de preview/homolog dedicada (não `jinlong.app` prod).
3. Seguir [FASE2_PLANO_ENSAIOS_CARGA.md](./FASE2_PLANO_ENSAIOS_CARGA.md) e [checklists/PRE_EXECUCAO_STAGING.md](./checklists/PRE_EXECUCAO_STAGING.md).
4. Só então executar FASE 3–5 e emitir limite comercial conservador com números.

**Decisão FASE 1:** **NO-GO** para ativar novas lojas pagantes além do piloto, até FASE 5 com evidências.  
**GO CONDICIONAL** para o piloto atual, desde que limites de crescimento comercial fiquem congelados.
