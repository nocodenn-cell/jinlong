# STG-01 — Preparação da Homologação Isolada

**Data:** 2026-10-09  
**Prioridade:** P0  
**Status:** planejado — **parado antes de provisionar recursos pagos, carga ou migrations remotas**  
**Base:** FASE 1 + FASE 2 em `docs/capacity/`

---

## 1. Validação do plano existente

### 1.1 Documentos lidos

| Documento | Resultado da validação |
|-----------|------------------------|
| `README.md` | Índice OK; decisão NO-GO até staging |
| `FASE1_…md` | Inventário coerente com código |
| `FASE2_…md` | Cenários 1–50 + soak; gates G1–G6 corretos |
| `checklists/PRE_EXECUCAO_STAGING.md` | Completo; atualizado nesta sprint com STG-01 |
| `k6/` | Esqueleto + guard; finalize real ainda FASE 3 |

### 1.2 Dependências confirmadas

| Dependência | Estado |
|-------------|--------|
| Migrations SSOT | `backend/supabase/migrations/` — última: `20261009220000_fiscal_rpc_isola_loja.sql` (~70k linhas SQL totais) |
| Edge Functions | `sync-outbox`, `validar-gerente`, `fiscal-worker` |
| Auth | Supabase Auth + `public.usuarios` (`OPERADOR`/`GERENTE`/`DONO`) + `loja_id` |
| Tenant | **`loja_id` apenas** — sem `empresa_id` (não iniciar Multiempresa) |
| Seeds locais existentes | `seed.sql`, `seed-dev-users.mjs` (localhost only), `seed-demo-fluxo-staging.mjs` (nome legado; também localhost only) |
| Stress/gate | `dev-tools/*` — agora passam pelo guard de alvo remoto |
| Staging remoto | **ainda inexistente** |

### 1.3 Lacunas do plano (fechadas nesta sprint)

| Lacuna | Ação STG-01 |
|--------|-------------|
| Guard confiava só em `CAPACITY_ENV` / fragmentos | Guard com **denylist de prod + allowlist positiva de ref** |
| `no-prod-target-guard` com PROD_REF quebrado | Lê `prod-denylist.json` |
| Seeds multi-loja para capacidade | `scripts/staging/seed-capacity-catalog.mjs` |
| Reset seguro de sintéticos | `scripts/staging/reset-capacity-synthetic.mjs` |
| Procedimento de push migrations | `apply-migrations-staging.sh` (bloqueado sem confirm) |
| Custo / autorizações | Este documento §3 e §8 |

### 1.4 O que NÃO foi duplicado

- Reutiliza `stress:pdv`, `gate:pdv`, `seed.sql` local, checklist FASE 2.
- Não recria k6 do zero — só endurece `env-guard.js`.
- Não altera `seed-dev-users.mjs` (continua localhost-only).

---

## 2. Arquitetura proposta de staging

```
OPERADOR DE ENSAIO (laptop/CI)
  env: CAPACITY_*  (.env.capacity NÃO versionado)
  guards: capacity-target-guard + assert-staging-target
           |                              |
           v                              v
  Supabase STAGING (NOVO)          Vercel Preview / homolog
    nome: jinlong-staging            NEXT_PUBLIC_SUPABASE_* →
    Postgres + Auth + Edge             ref staging ONLY
    users @capacity.staging.invalid  NÃO alterar Production
           ^
           | denylist bloqueia
  PRODUÇÃO (intocável)
    ref/hosts: ver staging/prod-denylist.json
    nome projeto: jinlong / sa-east-1
```

### 2.1 Recursos a criar (após autorização)

| # | Recurso | Função |
|---|---------|--------|
| R1 | Projeto Supabase `jinlong-staging` (região `sa-east-1` preferível) | DB + Auth + Edge isolados |
| R2 | Secrets Edge no staging (`SYNC_KEY` **novo**, service_role do staging) | sync desktop / fiscal |
| R3 | Env Vercel Preview (ou projeto Vercel separado) com URL/keys do staging | App web de homolog |
| R4 | Arquivo local `.env.capacity` (não versionado) a partir de `.env.staging.example` | Shell de ensaio |
| R5 | (Opcional) Sentry environment `staging` | Erros separados |
| R6 | Seeds `CAP_L*` + usuários `@capacity.staging.invalid` | Dados fictícios |

### 2.2 Dados sintéticos (modelo atual = lojas)

- Lojas: `codigo = CAP_L01…CAP_L50`, nome `[CAP] Loja NN`, UUID determinístico `c0a7eeee-00NN-…`
- Usuários: `op.lNN.cMM@capacity.staging.invalid`, `gerente.lNN@…`
- Produtos: códigos `990NN…`, estoque generoso + SKU `qty=1` para C8
- **Sem** `empresa_id`, sem PII real

### 2.3 Diferenças vs produção

| Aspecto | Produção (`jinlong`) | Staging proposto |
|---------|----------------------|------------------|
| Project ref | ver `staging/prod-denylist.json` | **outro** (a criar) |
| Dados | Loja cliente real | Só `CAP_*` / e2e |
| Domínio web | `jinlong.app` / `pdv-importados.vercel.app` | Preview URL ou subdomínio homolog |
| `SYNC_KEY` | prod | **novo** (nunca copiar prod) |
| Fiscal Focus | pode estar ligado | preferir `mock` / desligado |
| Capacidade medida | 1 loja | ensaios 1→50 |

---

## 3. Custo mensal estimado

Valores aproximados USD (Supabase/Vercel públicos, 2026) — **confirmar no dashboard antes de pagar**.

| Opção | Supabase | Vercel | Total/mês | Adequação |
|-------|----------|--------|-----------|-----------|
| **A — Free** | $0 (limites; pause por inatividade) | $0 (Preview) | **~$0** | Smoke/Piloto curtos; **ruim** para soak 8–12 h |
| **B — Pro Micro (recomendado)** | ~$25/projeto | $0 Preview ou incluso Pro | **~$25** | Paridade com teto ~60 conn; soak viável |
| **C — Pro + compute maior** | $25 + add-on compute | Preview/Pro | **$25–100+** | Se Micro saturar nos ensaios |

**Recomendação STG-01:** autorizar **Opção B** se soak/estresse forem necessários; Opção A só para validar scripts.

Branching Supabase exige Pro — projeto separado é o caminho (já documentado em `AMBIENTES_E_RELEASE.md`).

**Nenhum recurso pago foi provisionado nesta sprint.**

---

## 4. Procedimento de provisionamento (após GO humano)

1. Criar projeto Supabase `jinlong-staging` em `sa-east-1`.
2. Anotar `project ref` → preencher `CAPACITY_ALLOWED_PROJECT_REF`.
3. Copiar `pdv-importados/.env.staging.example` → `.env.capacity` (local, gitignored).
4. Preencher URL, anon, service_role, senha sintética, `CAPACITY_ALLOWED_PROJECT_REF` e `CAPACITY_BLOCKED_PROJECT_REFS` (produção).
5. Rodar `npm run capacity:assert-target` (deve passar).
6. Autorizar push: `CAPACITY_CONFIRM_DB_PUSH=yes bash pdv-importados/scripts/staging/apply-migrations-staging.sh`
7. Configurar secrets das 3 Edge Functions no staging.
8. Configurar Vercel Preview env → ref staging; **não** alterar Production.
9. `CAPACITY_CONFIRM_SEED=yes CAPACITY_LOJAS=5 npm run capacity:seed`
10. Smoke manual login operador sintético + 1 venda.
11. Só então FASE 3 (k6 Piloto).

Comandos de seed/reset/assert estão em `package.json` (`capacity:*`).

---

## 5. Segurança operacional

### 5.1 Controles implementados

| Controle | Onde |
|----------|------|
| Denylist hosts prod | `docs/capacity/staging/prod-denylist.json` |
| Denylist ref prod (não versionado) | env `CAPACITY_BLOCKED_PROJECT_REFS` (obrigatório remoto) |
| Allowlist positiva de ref | `scripts/capacity-target-guard.cjs` + `CAPACITY_ALLOWED_PROJECT_REF` |
| JWT service_role ≠ prod | mesmo guard (claim `ref`) |
| k6 espelha denylist | `docs/capacity/k6/lib/env-guard.js` |
| Stress/gate remotos | `dev-tools/load-env.ts` + `gate-staging-guard.ts` |
| Seeds capacidade | exigem `CAPACITY_CONFIRM_*=yes` + guard |
| Seeds E2E antigos | continuam **localhost-only** |
| `.env.local` | **não** lido/alterado pelos scripts staging |

### 5.2 Evidências de bloqueio (executadas nesta sprint)

Ver §9 (saída dos testes). Casos cobertos:

- ref bloqueado + `CAPACITY_ENV=staging` → **recusa**
- allowlist = ref bloqueado → **recusa**
- staging sem allowlist → **recusa**
- staging remoto sem `CAPACITY_BLOCKED_PROJECT_REFS` → **recusa**
- staging com allowlist matching + blocked refs → **aceita**
- host `jinlong.app` → **recusa**
- JWT com claim `ref` bloqueado → **recusa**

### 5.3 Checklist de segurança (gate)

- [ ] Ref staging ≠ `CAPACITY_BLOCKED_PROJECT_REFS`
- [ ] `CAPACITY_BLOCKED_PROJECT_REFS` preenchido (ref de produção do dashboard; não commitado)
- [ ] Nenhum secret de produção no shell de ensaio
- [ ] `.env.local` intacto
- [ ] Vercel Production env **não** alterado
- [ ] `SYNC_KEY` staging distinto
- [ ] `npm run capacity:assert-target` OK
- [ ] `npm run guard:capacity-target` (unit) OK
- [ ] `npm run guard:no-prod-target` OK

---

## 6. Reprodutibilidade — scripts

| Script / comando | Função | Gatilho perigoso |
|------------------|--------|------------------|
| `npm run capacity:assert-target` | Valida alvo | — |
| `npm run guard:capacity-target` | Testes unitários do guard | — |
| `bash …/apply-migrations-staging.sh` | db push + functions | `CAPACITY_CONFIRM_DB_PUSH=yes` |
| `npm run capacity:seed` | Lojas/users/produtos/estoque | `CAPACITY_CONFIRM_SEED=yes` |
| `npm run capacity:reset` | Apaga só `CAP_*` / `@capacity…` | `CAPACITY_CONFIRM_RESET=yes` |
| `collect-metrics.sql` | Queries de conexão/locks/volume | SQL Editor staging |
| `docs/capacity/k6/` | Carga (FASE 3) | guards k6 |

Reinicializar ambiente: `capacity:reset` → `capacity:seed` (ou `db reset` **local** apenas).

---

## 7. Plano de rollback

| Situação | Ação |
|----------|------|
| Seed incorreto no staging | `capacity:reset` |
| Schema staging corrompido | Recriar projeto staging OU `db reset` se local; remoto: novo projeto limpo |
| Env Vercel Preview apontou errado | Reverter env Preview; Production intocada |
| Suspeita de escrita em produção | **Parar tudo**; rodar queries de auditoria só-leitura em prod; rotacionar keys se vazamento |
| Custo inesperado | Pausar/delete projeto staging |

Rollback **não** inclui migrar dados de staging → prod.

---

## 8. Autorizações necessárias (lista objetiva)

Assinar / aprovar antes de qualquer provisionamento:

| # | Autorização | Quem |
|---|-------------|------|
| A1 | Criar projeto Supabase `jinlong-staging` (região + plano Free ou Pro) | Dono produto / billing |
| A2 | Orçamento mensal (Opção A $0 ou B ~$25) | Dono produto |
| A3 | Configurar env Vercel **Preview** (não Production) com keys staging | Eng + acesso Vercel |
| A4 | Gerar `SYNC_KEY` novo e secrets Edge só no staging | Eng |
| A5 | Executar `CAPACITY_CONFIRM_DB_PUSH=yes` (primeira aplicação de migrations remotas) | Eng responsável |
| A6 | Executar seed `CAPACITY_LOJAS=N` | Eng ensaio |
| A7 | Liberar FASE 3 (carga k6 Piloto) após smoke | Dono + Eng |

**Sem A1–A2: NO-GO de provisionamento.**

---

## 9. Evidências desta sprint (pré-provisionamento)

Comandos (rodar na raiz do monorepo):

```bash
npm run guard:capacity-target          # 9 testes unitários
npm run guard:no-prod-target
# Dry-run migrations (sem CONFIRM) — exige blocked refs
CAPACITY_ENV=staging \
  CAPACITY_ALLOWED_PROJECT_REF=abcdefghij1234567890 \
  CAPACITY_BLOCKED_PROJECT_REFS=prodref0000000000001 \
  CAPACITY_SUPABASE_URL=https://abcdefghij1234567890.supabase.co \
  bash pdv-importados/scripts/staging/apply-migrations-staging.sh
```

Resultados: `/opt/cursor/artifacts/stg01-guard-evidence.log`.

## 10. Decisão STG-01

| Item | Status |
|------|--------|
| Plano FASE 1/2 validado | OK |
| Arquitetura staging desenhada | OK |
| Guards anti-produção endurecidos | OK |
| Scripts reproduzíveis prontos | OK (bloqueados sem confirm) |
| Recursos pagos provisionados | **NÃO** — aguarda A1/A2 |
| Carga / migrations remotas | **NÃO** |
| Multiempresa | **fora de escopo** |

**Pronto para autorização de provisionamento.** Após A1–A6, retomar checklist `PRE_EXECUCAO_STAGING.md` e FASE 3.
