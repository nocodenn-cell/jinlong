# STG-01 — Comparação Estratégia A vs B (capacidade)

**Data:** 2026-10-10  
**Missão:** escolher caminho para concluir homologação de capacidade (C2: seed + k6 1/5/10)  
**Restrições cumpridas:** sem migrations remotas; sem alteração de histórico; staging/prod/AgeGuard preservados; `.env*` existentes intocados  
**Experimentos locais:** offline (sem Docker neste VM) + probe read-only do staging + evidência de CI

Artefato offline: `docs/capacity/staging/repair-prep/strategy-ab-offline-experiment.json`

---

## 1. Definições

| | Estratégia A | Estratégia B |
|--|--------------|--------------|
| Ideia | Recuperar `jinlong-staging` atual (339 históricos + 105 bloqueadas) | Baseline canônica descartável: `db reset` do Git em stack local isolado (`fastproduct-capacity`) |
| Fonte da verdade | Histórico MCP + schema parcial | **Cadeia Git (406 migrations)** = o que o código espera |
| Destino dos ensaios | Free remoto existente | Local disposable (Trilha L já desenhada no STG-01) |
| Staging remoto | Continua a ser “consertado” | **Congelado / preservado** (não apagar; não usar como alvo C2) |

---

## 2. Evidências coletadas

### 2.1 Estado A (staging Free) — leitura

| Probe | Resultado |
|-------|-----------|
| `schema_migrations` | 339 (versões sintéticas MCP) |
| `finalizar_venda_transacional_canonica_v4` | presente |
| `fechar_caixa_*` / `retomar_caixa_atomico` | presentes |
| `ajustar_estoque*` | presente |
| RLS `vendas` / `estoque` / `lojas` | ligado |
| `financeiro_comando` / painel / candidatos | **ausente** (ledger parcial) |
| `_stg_mig_scratch` | residual MCP |
| Matriz Option B | 301 verified / **60 partial / 40 indeterminate / 5 not_applied** |

Bloqueadas por domínio (heurística): venda/caixa/financeiro/estoque/auth ≈ **37** capacity-critical com fingerprints incompletos.

### 2.2 Estado B (Git + CI) — local/CI

| Evidência | Resultado |
|-----------|-----------|
| CI `ci-backend-supabase.yml` | `supabase db reset --local --yes` + smokes RLS/SECDEF/devolução |
| CI `ci-pdv-importados.yml` | `db reset` + E2E sobre schema do repositório |
| Homologações UX documentadas | stack local `db reset` com centenas de migrations |
| Offline experiment | 406 prefixes únicos; RPCs críticas **declaradas** na cadeia Git |
| Docker neste Cloud Agent | **ausente** — reset real não rodado aqui; depende de máquina com Docker |

### 2.3 Complexidade relativa (unidades internas)

| Estratégia | Unidades (heurística) | Interpretação |
|------------|----------------------:|---------------|
| A | **~164** | Investigar/completar 105 + reparo histórico + revalidar |
| B | **~12** | config isolada + start + reset (CI) + seed + smoke comportamental + k6 |

---

## 3. Avaliação dimensional

### Tempo estimado e complexidade

| | A | B |
|--|---|---|
| Tempo técnico | Alto: 105 casos (muitos parciais mid-file, ex. financeiro) + normalização de 339 versões sintéticas | Baixo–médio: um `db reset` CI-proven; setup ports/volume uma vez |
| Complexidade | Diagnóstico por migration + DDL idempotente + risco de re-partial | Operacional (Docker/config); schema vem inteiro do Git |
| Bloqueio atual | Auth remota + aprovação INSERT/DDL | Docker + autorização **A-L1** (config `fastproduct-capacity`) |

### Integridade (tabelas, RPC, triggers, constraints, índices, grants, RLS)

| | A | B |
|--|---|---|
| Tabelas/RPC | Mista: core PDV ok; financeiro público incompleto; mid-gap report/promo/etc. | Cadeia completa do Git após reset |
| Triggers/constraints/índices | Parcialmente presentes; não há prova 1:1 com 406 arquivos | Aplicados na ordem canônica do repositório |
| Grants/RLS | RLS base ok; N1 `protege_preco_custo` está em **not_applied** no staging | CI já valida regressões de grant/RLS pós-reset |
| Prova | Fingerprints + histórico sujo | Reset verde + suite SQL/E2E do CI |

### Compatibilidade com vendas v4

| | A | B |
|--|---|---|
| RPC v4 | Já existe no staging | Existe após reset (declarada no Git; CI exerce fluxos PDV) |
| Dependências satélites | Caixa fechamento multi-forma / desconto comercial / financeiro público **furados** na cauda | Incluídos se estão nas 406 (incl. `20261007*` / `20261009*`) |
| Risco v4 | Venda pode “passar” com schema incompleto ao redor (falso positivo de capacidade) | Fluxo alinhado ao código atual |

### Divergência homologação × produção

| | A | B |
|--|---|---|
| Compute | Free ≠ prod (C2≠C3) — igual para ambos se ensaiar no Free | Local ≠ prod (C2≠C3) — já documentado |
| Schema | Staging pode **divergir do Git** mesmo “verde” em v4 | Schema = Git; prod pode ter drift próprio (problema separado de C3) |
| Conclusão | Homologação A pode mentir sobre o produto Git | Homologação B mede o produto Git; extrapolação C3 continua proibida |

### Reprodutibilidade em CI

| | A | B |
|--|---|---|
| | Fraca: depende de estado MCP único do projeto Free | **Forte:** é exatamente o que CI faz (`db reset --local`) |

### Manutenção futura

| | A | B |
|--|---|---|
| | Histórico sintético vira dívida permanente | Baseline descartável; `db reset` a qualquer commit |
| | Cada nova migration exige reconciliar staging sujo | Nova migration entra na cadeia; reset regenera |

### Seeds e k6

| | A | B |
|--|---|---|
| Seeds | Scripts prontos (`capacity:seed`) mas alvo staging exige schema completo (financeiro/N1) | Mesmos scripts com `CAPACITY_ENV=local` + URL `127.0.0.1:54421` |
| k6 | Smoke já aponta URL; venda real ainda FASE 3 | Idem; baseline B desbloqueia auth/seed locais sem lutar com histórico |
| Guards | Já suportam staging e local | Trilha L já especificada no STG-01 |

### Baseline ≠ dump de tabelas

Estratégia B **só é válida** se, após reset, passar critérios comportamentais (§5): auth, isolamento `loja_id`, estoque, caixa, financeiro — não basta `information_schema`.

---

## 4. Riscos principais

**A**

1. Completar parciais mid-file (financeiro) sem reexecutar DDL já existente.  
2. Registrar histórico cedo demais (já rejeitado).  
3. Capacidade medida em schema incompleto.  
4. Tempo dominado por intervenção manual nas 105.

**B**

1. Requer Docker + autorização para `config.capacity.toml` (ports 54421+, volume novo) sem tocar `fastproduct`.  
2. Este Cloud Agent **não tem Docker** agora — execução B em laptop/CI self-hosted.  
3. C2 local não autoriza C3 comercial (já regra STG-01).  
4. Seed/k6 ainda precisam de payloads v4 (trabalho de FASE 3, comum a A e B).

---

## 5. Critérios de aceitação

### Comuns (C2)

1. Guards: alvo ≠ produção; `.env.local` não sobrescrito.  
2. Seed 1 → 5 → 10 lojas `CAP_L*` com auth.  
3. k6 smoke + cenário pico sem erro sistemático de schema/RPC.  
4. Relatório C1/C2/C3 sem extrapolar C2→C3.

### Específicos B (baseline canônica)

1. `npx supabase db reset --local` no project `fastproduct-capacity` exit 0.  
2. Contagem `schema_migrations` = 406 (nomes canônicos).  
3. Probes: v4, `fechar/retomar_caixa`, estoque adjust, `financeiro_comando`, RLS vendas/estoque.  
4. Smoke comportamental mínimo (transação + ROLLBACK ou seed+RPC):  
   - auth operador/gerente por loja  
   - isolamento cross-loja (leitura/escrita negada)  
   - baixa de estoque na venda  
   - movimento/fechamento de caixa  
   - pelo menos um comando financeiro happy-path **ou** skip documentado se fora do escopo k6 imediato  
5. Suite CI local aplicável (subset RLS/SECDEF) verde no stack capacidade.

### Específicos A (só se A for escolhida depois)

1. 105 bloqueadas → 0 `not_applied` capacity-critical; partials documentados ou fechados.  
2. Histórico canônico sem register sem prova.  
3. Mesmos probes comportamentais do §B.4 no staging.

---

## 6. Estimativa de esforço (técnico)

| Fase | A | B |
|------|---|---|
| Desbloqueio infra | Auth staging + aprovação DDL/histórico | Docker + A-L1 config capacidade |
| Schema íntegro | Dezenas–centenas de unidades de intervenção (105) | Um reset CI-equivalente |
| Validação comportamental | Reescrever probes sobre schema incerto | Reusar scripts CI + seed capacidade |
| Até k6 1/5/10 | Atrasado pelo reparo | Caminho crítico = seed + payloads v4 |

---

## 7. Recomendação

# **B — baseline canônica local isolada e descartável**

**Por quê (objetivo):** o objetivo é capacidade do **produto Git**, não arqueologia do staging MCP. A cadeia de 406 migrations já é exercitada no CI via `db reset`; o staging atual tem histórico sintético, ledger financeiro parcial e 105 bloqueadas — custo de A >> benefício para C2.

**O que fazer com o staging remoto:** **preservar congelado** (sem delete, sem repair, sem 20 INSERTs) como artefato forense; não é o alvo dos ensaios k6.

**Próximo gate humano sugerido:** autorizar **A-L1** (criar `backend/supabase/config.capacity.toml` + stack `fastproduct-capacity` ports 54421+) e correr reset+seed+smokes **só local**. Não autorizar ainda INSERTs/DDL no Free staging.

**Quando revisitar A:** se no futuro precisar de Free remoto para topologia de rede; aí usar B como **oráculo** (diff schema local vs staging) em vez de reparo cego.

---

## 8. Comandos propostos (após A-L1 — não executar agora)

```bash
# Criar config isolada (ainda NÃO autorizado)
# backend/supabase/config.capacity.toml  project_id=fastproduct-capacity  ports 54421+

# Em máquina com Docker — sem tocar project fastproduct:
# npx supabase start --workdir backend --config config.capacity.toml   # ou fluxo documentado na execução
# npx supabase db reset --local --yes   # no workdir/config capacidade

# Seeds / k6 (env capacity, nunca .env.local):
# CAPACITY_ENV=local CAPACITY_SUPABASE_URL=http://127.0.0.1:54421 ...
# npm run capacity:seed
# k6 run docs/capacity/k6/scenarios/smoke.js
```

**Rollback B:** `supabase stop` no project-id capacidade + remover volume do stack capacidade — DEV `fastproduct` intacto.

---

## 9. Veredito curto

| Pergunta | Resposta |
|----------|----------|
| A ou B? | **B** |
| Executar 20 INSERTs no staging? | **Não** (continua sem autorização) |
| Staging Free? | Preservar; não usar para C2 |
| Bloqueio imediato para B neste agent? | Docker ausente — execução em ambiente com Docker pós A-L1 |
