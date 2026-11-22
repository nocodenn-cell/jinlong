# STG-01 — Preparação da Homologação Isolada

**Data:** 2026-10-09 (rev. custo zero)  
**Prioridade:** P0  
**Orçamento adicional:** **R$ 0** (restrição absoluta)  
**Status:** plano revisado — **parado antes de qualquer provisionamento** (aguarda confirmação humana)  
**Base:** FASE 1 + FASE 2 + guards STG-01 já no repositório

---

## 0. Decisão financeira revisada (R$ 0)

| Decisão anterior | Decisão atual |
|------------------|---------------|
| Pro Micro ~US$ 25/mês recomendado | **Descartado** — sem upgrade, sem recurso pago |
| Vercel Preview como app de homolog | **Dispensado nesta fase** |
| Cenários até 50 lojas no 1º ciclo | **Priorizar 1 → 5 → 10 lojas** |

**Nada foi provisionado nesta revisão.** Não contratar, não fazer upgrade, não criar projeto remoto, não executar carga.

### 0.1 Verificação Supabase (somente leitura — 2026-10-09)

| Fato | Evidência |
|------|-----------|
| Organização | NatureCode (`cmgixawhsltzcudyeukz`) |
| Plano | **`free` / `tier_free`** |
| Projetos atuais | `jinlong` (ACTIVE, sa-east-1) + `ageguard` (INACTIVE, us-west-2) |
| Custo API de **criar** novo projeto nesta org | **`amount: 0` / monthly** (`get_cost` type=project) |
| Branching | Indisponível no Free (já documentado) |
| Produção | **Não será modificada** |

**Interpretação:** a API indica que um projeto adicional nesta org Free teria cobrança mensal **US$ 0**.  
**Risco residual:** o plano Free costuma limitar o número de projetos ativos; já existem **2** projetos na org. A criação de `jinlong-staging` pode ser aceita ou recusada pelo painel — só descobriremos **na tentativa autorizada**, sem alterar `jinlong`.

---

## 1. Estratégia custo zero — duas trilhas

### Trilha F — Free remoto `jinlong-staging` (tentativa preferida se A-F1 autorizar)

```
Operador (laptop)
  .env.capacity (NÃO versionado; NÃO toca .env.local)
  Next.js local (npm run dev:web)  +  k6 local
           |
           v
  Supabase Free: jinlong-staging (NOVO, $0/mês se criado)
  dados sintéticos CAP_* / @capacity.staging.invalid
           ^
           | guards bloqueiam
  Produção jinlong — INTOCÁVEL
```

**Inclui:** projeto Free isolado, migrations/Edge só nesse ref, seed 1/5/10 lojas, app Next **local**, k6 **local**.  
**Não inclui:** Vercel Preview, Pro, add-ons, soak 8–12 h como meta desta fase.

**Limites Free a declarar em todo relatório:**

- Pause por inatividade (ensaios curtos; reativar antes do teste)
- DB/compute menores que produção → resultado = **capacidade no Free**, não produção
- Conexões/CPU limitadas — abortar se saturar antes de 10 lojas

### Trilha L — Docker local isolado (alternativa se Free recusar 3º projeto)

Sem alterar ou apagar o stack local de desenvolvimento existente (`project_id = fastproduct`, portas 54321–54327).

```
Stack DEV existente (intocável nesta trilha)
  project_id=fastproduct  ports 54321+  volumes atuais

Stack CAPACIDADE (NOVO, paralelo)
  project_id=fastproduct-capacity
  portas deslocadas (ex.: API 54421, DB 54422, Studio 54423)
  volume Docker separado
  CAPACITY_ENV=local → http://127.0.0.1:54421
  Next local + k6 local + seeds CAP_*
```

**Regras Trilha L:**

- Nunca `supabase stop` / `db reset` no stack `fastproduct` como parte do ensaio
- Subir capacidade só com `config`/ports dedicados (arquivo a criar **após** autorização L1)
- Guards: `CAPACITY_ENV=local` + URL localhost (já suportado)
- Mesmos dados sintéticos e confirmações `CAPACITY_CONFIRM_*=yes`

---

## 2. Escopo de ensaios sob R$ 0

### 2.1 Cenários autorizados nesta fase

| Ordem | Cenário | Lojas | Caixas | Vendas/h pico* | Duração sugerida |
|-------|---------|-------|--------|----------------|------------------|
| 1 | Smoke | 1 | 1 | — | 5 min |
| 2 | Piloto | 1 | 2 | 60 | 30–45 min |
| 3 | Expansão | 5 | 10 | 300 | 45–60 min |
| 4 | Comercialização light | 10 | 20 | 600 | 45–60 min |

\* Premissa de pacing (30 vendas/h/caixa), **não** capacidade comprovada.

**Adiados** (exigem infra maior / orçamento): Crescimento 25, Escala 50, soak 8–12 h contínuo em Free.

### 2.2 Três camadas de “capacidade” (obrigatório nos relatórios)

| Camada | Significado | Status atual |
|--------|-------------|--------------|
| **C1 — Funcional comprovada** | Loja piloto opera; idempotência/locks em código + gates `stress:pdv` / `gate:pdv` | **Sim** (1 loja; corretude, não throughput multi-loja) |
| **C2 — Medida no Free / local** | Números k6 em Trilha F ou L (p95, erros, lojas 1/5/10) | **Ainda não medida** — aguarda provisionamento autorizado |
| **C3 — Produção / comercial** | Capacidade no compute real de `jinlong` sob pico multi-loja | **Desconhecida** — **não** extrapolar C2→C3 sem margem e sem ensaio em infra equivalente |

**Regra:** qualquer GO comercial usa C3. C2 só autoriza expansão **controlada** com aviso explícito de limite de extrapolação.

---

## 3. O que permanece do STG-01 técnico (já no repo)

| Item | Estado |
|------|--------|
| Guards anti-produção | Mantidos (`capacity-target-guard`, denylist hosts, `CAPACITY_BLOCKED_PROJECT_REFS`) |
| `.env.local` | **Preservado** — scripts usam `.env.capacity` / env shell |
| Seeds sintéticos | `capacity:seed` / `capacity:reset` (lojas `CAP_L*`) |
| k6 esqueleto | `docs/capacity/k6/` |
| Vercel Preview | **Fora** desta fase |
| Pro Micro / pagos | **Fora** |
| Multiempresa | **Fora** |

---

## 4. Procedimentos (só após checklist §6)

### 4.1 Trilha F — Free remoto (após A-F1)

1. Confirmar no painel que a org Free aceita novo projeto (sem upgrade).
2. Criar `jinlong-staging` em `sa-east-1` (cobrança esperada: US$ 0/mês).
3. **Não** tocar projeto `jinlong` nem `ageguard` (salvo decisão explícita futura sobre `ageguard`).
4. Copiar `.env.staging.example` → `.env.capacity` (gitignored); preencher keys do **staging**.
5. `CAPACITY_BLOCKED_PROJECT_REFS=<ref produção>` (não versionar).
6. `npm run capacity:assert-target`.
7. `CAPACITY_CONFIRM_DB_PUSH=yes` + `apply-migrations-staging.sh`.
8. Secrets Edge **novos** só no staging (`SYNC_KEY` novo).
9. `CAPACITY_LOJAS=1` seed → smoke Next local → k6 Piloto.
10. Escada 5 → 10; parar no primeiro limite Free.

### 4.2 Trilha L — Docker isolado (após A-L1)

1. Autorizar criação de `backend/supabase/config.capacity.toml` (ports 54421+, `project_id=fastproduct-capacity`) — **ainda não criado**.
2. `npx supabase start` **só** com esse config (documentar comando exato na execução).
3. `.env.capacity` com `CAPACITY_ENV=local` e URL `http://127.0.0.1:54421`.
4. Seed + Next local + k6 local (mesma escada 1/5/10).
5. Não resetar o stack `fastproduct` de desenvolvimento.

### 4.3 App e carga

| Componente | Onde |
|------------|------|
| Web PDV | `npm run dev:web` apontando env de capacidade (sem deploy Vercel) |
| k6 | Local, `CAPACITY_ENV=staging` ou `local` |
| Métricas | Dashboard Free (Trilha F) ou `collect-metrics.sql` / `pg_stat_activity` (L) |

---

## 5. Segurança (inalterada em espírito)

- Allowlist positiva do alvo de ensaio  
- Denylist hosts prod + `CAPACITY_BLOCKED_PROJECT_REFS`  
- Confirmações explícitas para seed/reset/push  
- Zero escrita em produção  
- `.env.local` intacto  

Checklist detalhado: [checklists/PRE_EXECUCAO_STAGING.md](./checklists/PRE_EXECUCAO_STAGING.md).

---

## 6. Checklist de autorização (custo zero) — gate humano

Marcar **antes** de qualquer criação de recurso.

### Restrições globais

- [ ] Orçamento adicional **R$ 0** confirmado
- [ ] Sem upgrade Supabase / sem Pro / sem add-on
- [ ] Sem Vercel Preview nesta fase
- [ ] Sem carga em produção / sem alterar `jinlong`
- [ ] `.env.local` não será sobrescrito

### Escolha de trilha (uma)

**Trilha F — Free remoto**

- [ ] **A-F1** Autorizo tentar criar projeto `jinlong-staging` (Free, US$ 0/mês via `get_cost`)
- [ ] **A-F2** Se a criação falhar por limite de projetos, **não** apagar `ageguard`/`jinlong` sem nova autorização; cair para Trilha L
- [ ] **A-F3** Autorizo `db push` + deploy Edge **somente** no ref staging
- [ ] **A-F4** Autorizo seed sintético `CAPACITY_LOJAS` ∈ {1,5,10}
- [ ] **A-F5** Autorizo k6 local contra staging Free (cenários 1→5→10)

**Trilha L — Docker isolado**

- [ ] **A-L1** Autorizo criar config/ports/volume **separados** (`fastproduct-capacity`), sem tocar stack `fastproduct`
- [ ] **A-L2** Autorizo seed + k6 local na stack capacidade (1→5→10)
- [ ] **A-L3** Confirmo que dados locais de desenvolvimento existentes não devem ser apagados

### Assinaturas

| Papel | Nome | Data | Trilha (F / L / ambas em ordem) |
|-------|------|------|----------------------------------|
| Product / dono | | | |
| Engenharia | | | |

**Sem este checklist: NO-GO de provisionamento.**

---

## 7. Rollback (custo zero)

| Situação | Ação |
|----------|------|
| Staging Free inútil / erro | Pausar ou apagar **só** `jinlong-staging` (nunca `jinlong`) |
| Seed ruim | `capacity:reset` |
| Stack Docker capacidade | `supabase stop --project-id fastproduct-capacity` (quando existir) — **não** stop no `fastproduct` |
| Suspeita de alvo errado | Parar; `capacity:assert-target`; auditar URLs |

---

## 8. Inventário técnico prévio (resumo)

| Dependência | Estado |
|-------------|--------|
| Migrations | `backend/supabase/migrations/` até `20261009220000_…` |
| Edge | `sync-outbox`, `validar-gerente`, `fiscal-worker` |
| Tenant | `loja_id` (sem `empresa_id`) |
| Staging remoto | **ainda inexistente** |
| Guards / scripts | presentes; confirm gates ativos |

Evidências de guard: `npm run guard:capacity-target` (9 testes) — ver artefato `stg01-guard-evidence.log`.

---

## 9. Decisão STG-01 (rev. custo zero)

| Item | Status |
|------|--------|
| Orçamento R$ 0 | **Obrigatório** |
| Free remoto viável em custo | **Sim (US$ 0/mês via API)** — criação **não** executada |
| Risco limite de projetos Free | **Sim** (já há 2 projetos) → Trilha L pronta como fallback |
| Vercel Preview | **Não nesta fase** |
| Next + k6 locais | **Sim** |
| Ensaios 1 / 5 / 10 | **Escopo inicial** |
| Extrapolação para produção | **Proibida** sem declarar C1/C2/C3 |
| Provisionamento | **Aguardando checklist §6** |

**Próximo passo:** você confirma Trilha F, Trilha L, ou F-então-L. Só então executamos o provisionamento autorizado.
