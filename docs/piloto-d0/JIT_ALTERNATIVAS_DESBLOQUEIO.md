# Temporary Access / JIT — investigação e alternativas (Free, sem upgrade)

**Data:** 2026-10-08  
**Decisão:** manter Free; destravar JIT (não contratar serviços; não alterar plano).  
**Bloqueio:** `EXTERNAL-BLOCKER-SUPABASE-JIT`  
**Evidência estável:** grant Management API HTTP 2xx + `aws-1` → `FATAL: PAM authentication failed for user "postgres"`  
**Run recente:** [37625648145](https://github.com/nocodenn-cell/fastproduct/actions/runs/37625648145) (2026-10-07)

Pré-requisitos de plataforma **satisfeitos** (não são a causa):

| Check | Resultado | Fonte |
|---|---|---|
| Org plan | `free` | MCP `get_organization` |
| Projeto | `jinlong` ACTIVE_HEALTHY, `sa-east-1` | MCP `get_project` |
| Postgres | `17.6.1.084` (≥ `17.6.1.081`) | MCP database.version |
| Temporary Access docs | exige SSL + PG 17.6.1.081+ | [Temporary access](https://supabase.com/docs/guides/platform/temporary-access) |

---

## O que já foi descartado (código/CI) — não repetir

Ver tabela completa em [`docs/audits/ENCERRAMENTO_SPRINT_BACKUP_JIT_ITENS_18_21.md`](../audits/ENCERRAMENTO_SPRINT_BACKUP_JIT_ITENS_18_21.md): escopo PAT, `user_id`, `roles` vs `user_roles`, `jit=true`, `allowed_networks`, host aws-0 vs aws-1, SSL, whitespace PAT, percent-encoding, sleep 15s.

---

## Lacuna encontrada nesta sprint (correção de código)

Até 2026-10-07 o workflow **só** sondava o pooler (`aws-N-….pooler.supabase.com` + `postgres.<ref>` + `jit=true`).

A documentação oficial também descreve **conexão direta**:

```text
psql 'postgres://postgres:<PAT>@db.<project-ref>.supabase.co/postgres'
```

- user = `postgres` (**sem** sufixo `.ref`)
- **sem** `options=-c jit=true`
- caminho que **não** passa pelo PAM do Supavisor do shared pooler

**Correção (branch desta sprint):** `backup-scheduled.yml` tenta `direct` primeiro; se falhar, grava `direct: motivo=` e só então o pooler.  
**Gate estático:** `npm run guard:backup-jit`.  
**Validação runtime em produção:** exige `workflow_dispatch` / cron **após merge** (autorização humana — toca ORIGEM em leitura). O dispatch seguinte coleta o motivo; no runner atual ele não prova o caminho direto (seção abaixo).

---

## Limitação IPv6 (confirmada pela documentação, 2026-10-08)

Hipótese verificada **só** em documentação oficial (nenhum `workflow_dispatch` novo nesta mudança):

- Free: host direto `db.<ref>.supabase.co:5432` resolve **apenas IPv6** ([matriz de endpoints](https://supabase.com/docs/guides/database/connecting-to-postgres#endpoints-and-ip-versions)).
- GitHub Actions / `ubuntu-latest` está na lista de redes **só IPv4** ([add-on IPv4](https://supabase.com/docs/guides/platform/ipv4-address); [runner-images#668](https://github.com/actions/runner-images/issues/668)).
- O `PUT` JIT deste workflow envia somente `allowed_cidrs: [{cidr: 0.0.0.0/0}]`. Faixa IPv6 é o campo separado `allowed_cidrs_v6`.

Por isso a sonda direta, neste runner, deve falhar antes do PAM e cair no pooler. O workflow registra `sem_aaaa`, `sem_rota_ipv6`, `autenticacao` ou `timeout` sem imprimir o PAT. Não há troca de runner, add-on ou CIDR neste repositório.

**Saídas possíveis (humano, depois do log):**

| Saída | O que muda |
|-------|------------|
| Runner com IPv6 + `allowed_cidrs_v6` | A sonda direta passa a ter rota e grant compatíveis |
| Add-on IPv4 (Pro+) | O host direto deixa de ser AAAA e passa a ter A |
| Ticket Supabase | Caminho do `EXTERNAL-BLOCKER` no Free: grant 2xx, PAM no `aws-1` e a linha `direct: motivo=` |

---

## Alternativas concretas (ordem recomendada, sem Pro)

| # | Alternativa | Custo | Quem | Risco | Quando usar |
|---|---|---|---|---|---|
| **A** | Após merge: disparar `Backup automatico` e arquivar `direct: motivo=` + resultado do pooler | $0 | Ops | Baixo (só dump leitura) | **Próximo passo imediato** (diagnóstico) |
| **B** | Dashboard → Temporary Access: confirmar toggle enabled + regra do `user_id` com `0.0.0.0/0` e role `postgres` (UI vs API) | $0 | Dono | Nenhum | Se A falhar no direto com PAM |
| **C** | Rotacionar PAT (`Database JIT` read-write), atualizar `SUPABASE_BACKUP_JIT_PAT`, re-dispatch | $0 | Dono | Baixo | Se A/B falharem |
| **D** | Ticket Supabase com evidência grant 2xx + PAM aws-1 + PG 17.6.1.084 + tentativa direta | $0 | Dono | Nenhum | Se A–C falharem — **caminho oficial do EXTERNAL-BLOCKER** |
| **E** | Dump manual pontual na máquina do dono (`supabase db dump` / `pg_dump`) com senha Postgres **temporária** → artifact cifrado local → restore em DESTINO novo | $0 | Dono | Médio (senha em máquina local; gate P0-3) | Contingência se JIT permanecer morto **sem** upgrade |
| **F** | Opção A plataforma (Pro daily backup) | Pago | Dono | Baixo ops | **Fora** desta decisão (sponsor manteve Free). Não substitui o ticket como ação corrente |

**Não fazer sem autorização explícita:** gravar senha Postgres permanente em GitHub Secrets como substituto do JIT; restore em cima de produção; upgrade de plano.

---

## Texto sugerido para ticket Supabase (D)

```text
Subject: Temporary Access PAT accepted by Management API but PAM fails on pooler (and need confirm direct)

Project: jinlong / sa-east-1 / Postgres 17.6.1.084 / org Free
Symptom: PUT/GET /v1/projects/{ref}/database/jit → HTTP 2xx with role postgres,
allowed_networks 0.0.0.0/0, expires_at future.
psql via aws-1-sa-east-1.pooler.supabase.com:5432 with
user=postgres.{ref}, password=PAT, options=-c jit=true →
FATAL: PAM authentication failed for user "postgres"
aws-0 → tenant/user not found (wrong pooler cluster).
Direct db.{ref}.supabase.co from GitHub-hosted ubuntu-latest is expected to fail
before auth: Free direct endpoint is IPv6-only, the runner has no IPv6 route,
and the JIT grant only lists allowed_cidrs 0.0.0.0/0 (no allowed_cidrs_v6).
The workflow logs direct: motivo= before falling back to the pooler.
Please advise if Temporary Access on Free / this region has a known PAM sync bug,
and whether direct JIT from an IPv4-only CI runner is supported without the IPv4 add-on.
```

---

## Critério de desbloqueio

1. Run `backup-scheduled` = **success** + artifact `jinlong-backup-*`  
2. `backup-restore-test` = **success**  
3. `backup-freshness-monitor` = `BACKUP_FRESH`  
4. Gate → `BACKUP_PRODUCTION_READY`

Até lá: **NO-GO** operação contínua (sem aceite de risco).
