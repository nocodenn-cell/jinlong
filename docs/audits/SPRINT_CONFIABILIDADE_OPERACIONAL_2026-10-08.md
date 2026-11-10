# Sprint — Confiabilidade Operacional do Jinlong

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-08 |
| **Branch** | `cursor/confiabilidade-operacional-a7cd` |
| **Base** | `main` @ `ea917430` (PR #480) |
| **Projeto** | Supabase `jinlong` · PG 17 · `sa-east-1` |
| **Org** | NatureCode · **`plan: free`** |
| **Decisão** | **NO-GO** para piloto em loja com RPO garantido |

> Critério: código funcional ≠ sistema operacionalmente confiável.

---

## Tabela executiva

| Área | Evidência | Status | Severidade | Ação |
|---|---|---|---|---|
| Migrations | Local 401 vs remoto 392; max remoto `20261006200048`; 9 locais sem tracking/efeito em prod | **DRIFT PENDENTE** | **P0** (SSOT caixa/fiscal) / **P1** (painel formas) | Autorizar apply das 8 SSOT `20261007*` + avaliar `20261006120000` em janela controlada — **não** `db push` cego |
| Backup | Org Free; `backup-scheduled.yml` 0/10 runs recentes = failure (PAM/JIT) | **`BACKUP_PRODUCTION_PENDING`** | **P0** | Ticket Supabase JIT **ou** upgrade Pro |
| Restore | Drill sintético local `pg_dump -Fc` + `age` + `pg_restore`; manifesto bate; RTO local ~72 ms | **PASS procedimento** / **FAIL produção** | **P0** (prod) | Sem artefato prod restaurável; RPO **NÃO GARANTIDO** |
| PDV | Vitest operacional 74 PASS; entity-ssot OK; smoke loja não executado | **CI PASS** / **`STORE_SMOKE_PENDING`** | **P0** (loja) | Checklist HW na máquina da cliente |
| Financeiro | Invariantes/matrices 26 PASS; UPDATE direto estoque/caixa bloqueado; SSOT fechamento por forma **ausente** em prod | **PARCIAL** | **P1** | Apply `…80000`/`…90000` antes de operar fechamento multi-forma |
| Segurança | RLS core ON; v2/v3 stubs `LEGACY_DISABLED_USE_V4`; anon sem EXECUTE v4; **INSERT authenticated** ainda em `documentos_fiscais_pendentes` | **PARCIAL** | **P1** (SSOT-004) | Apply `20261007163200` sob autorização |

---

## Fase 1 — Migrations (somente leitura)

### Contagens

| Fonte | Contagem | Max version |
|-------|----------|-------------|
| Repo `backend/supabase/migrations/*.sql` | **401** | `20261007190000` |
| Remoto `supabase_migrations.schema_migrations` | **392** | `20261006200048` |

### Ausentes no remoto (não aplicadas / sem objetos esperados)

1. `20261006120000_financeiro_contas_formas_e_painel` — coluna `formas_pagamento.conta_financeira_id` **ausente** em prod.
2. `20261007161220_fiscal_cancelado_ssot`
3. `20261007163000_ssot_001_002_painel_ec_cache`
4. `20261007163100_ssot_003_nfe_obrigacao_duplicata`
5. `20261007163200_ssot_004_revoke_insert_documentos_fiscais`
6. `20261007170000_ssot_002_mov_ar_ec_cache`
7. `20261007171000_ssot_002_cancel_guard_antes_devolucao`
8. `20261007180000_calcular_valor_sistema_por_forma_caixa`
9. `20261007190000_caixas_fechamento_formas_snapshot`

### Provas de objeto (remoto)

| Objeto / condição | Resultado |
|-------------------|-----------|
| `calcular_valor_sistema_por_forma_caixa` | **ausente** |
| `caixas.fechamento_formas_snapshot` | **ausente** |
| `documentos_fiscais_pendentes` INSERT → `authenticated` | **ainda concedido** (SSOT-004 não aplicado) |
| `finalizar_venda_transacional_canonica_v4` | presente (1 overload canônico) |
| Overloads v2/v3 | stubs com `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'`; sem EXECUTE anon/auth |
| `descontos_venda.operador_id` / `aplicado_em` | presentes |
| Skew MCP (versão arquivo ≠ version remota) Oct/01–06 | já registrado em `migration-human-gates.json` |

### Riscos por domínio

| Domínio | Risco |
|---------|-------|
| Caixa / fechamento multi-forma | App em `main` espera RPCs/colunas SSOT que **não existem** em prod → fechamento por forma pode falhar ou degradar |
| Fiscal | Bypass INSERT direto em pendentes ainda possível para `authenticated` |
| Financeiro painel | Vínculo forma→conta não materializado |
| Vendas / estoque / permissões | Núcleo v4 + RLS por loja presentes; UPDATE direto estoque/caixa negado a `authenticated` |

**Proibido nesta sprint:** aplicar migrations remotamente / `db push` produção.

Artefato: `/opt/cursor/artifacts/migrations-local-vs-remote.json`

---

## Fase 2 — Backup e recuperação

### Estratégia atual

| Camada | Estado |
|--------|--------|
| Supabase nativo / PITR | **Indisponível** no plano Free |
| Opção B (`backup-scheduled.yml`) | Ativa; **falha contínua** (PAM no pooler apesar de JIT HTTP 2xx) |
| Freshness monitor | Deve falhar até existir sucesso &lt; 25h |
| `backup.sh` | Artefato de repo; sem prova de cron em produção |

### RPO / RTO

| Meta | Alvo | Comprovado? |
|------|------|-------------|
| RPO | 24h | **NÃO** — `NÃO GARANTIDO` |
| RTO | 4h úteis | Procedimento local ensaiado; cutover prod **não** comprovado |

### Restore de teste (isolado, sintético)

| Item | Valor |
|------|-------|
| Método | `pg_dump -Fc` → `age` encrypt/decrypt → `pg_restore` em Postgres 16 local |
| Dados | Sintéticos (2 lojas, produtos, estoque, venda split dinheiro+PIX) |
| SHA-256 dump | `1d4187f14ef677500137204b8a71cd7b2810d80bcf298fb808b3e01832765c30` |
| Manifesto pré/pós | idêntico |
| RTO local | ~72 ms |
| Resultado | **`RESTORE_DRILL_LOCAL_SYNTHETIC_PASS`** |
| Limite | **Não** substitui artefato de produção; **não** fecha `BACKUP_PRODUCTION_PENDING` |

Artefatos: `restore-drill-result.json`, `restore-drill-manifest.json`, `restore-drill-checksums.sha256`

### Bloqueador P0

**Não existe backup de produção restaurável comprovado.** Gate permanece `BACKUP_PRODUCTION_PENDING`.

Única ação humana: ticket Supabase (EXTERNAL-BLOCKER-JIT) **ou** autorizar Opção A (Pro). Ver `docs/regras-negocio/GATE_BACKUP_PRODUCAO.md`.

---

## Fase 3 — Smoke operacional PDV

### Executado neste ambiente (homologação isolada / CI)

| Suite | Resultado |
|-------|-----------|
| `check:entity-ssot` | PASS |
| `p0-roteiro-operacional` + `p0-venda-homologacao` + pilares + SSOT caixa + fechamento A/B + remediação 001–004 | **74/74 PASS** |
| Invariantes `shared-core` PDV | **12/12 PASS** |
| Descontos RLS / dinheiro / kardex / finalize v4 / devolução | **26/26 PASS** |

### Não executado (bloqueios)

| Item | Motivo |
|------|--------|
| Login UI / abertura caixa browser | Sem credenciais de homologação compartilhada; proibido seed em prod |
| PIX/cartão TEF, leitor, impressora **[HW]** | Exige máquina da loja |
| Isolamento entre lojas via JWT reais | Smoke REST RLS requer JWTs provisionados |
| `STORE_SMOKE_PASS` | Checklist `docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md` aberto |

Gate: **`STORE_SMOKE_PENDING`**.

---

## Fase 4 — Segurança e integridade

| Controle | Evidência | Status |
|----------|-----------|--------|
| RLS vendas/estoque/caixas/produtos/… | ON; policies com escopo `loja_id` | OK |
| UPDATE direto `estoque` / `caixas` por `authenticated` | `has_table_privilege` = false | OK |
| EXECUTE anon em v4 | false | OK |
| Legacy v2/v3 | stubs + sem grant | OK |
| `recalcular_saldo_caixa` | ausente (autoridade protegida) | OK |
| CHECK estoque não-negativo / anti-NaN | presente | OK |
| SSOT-004 REVOKE INSERT pendentes | INSERT ainda em `authenticated` | **FAIL até apply** |
| Advisors | 5 tabelas RLS sem policy (rate-limit/tokens/backup) — deny-by-default; WARN search_path em helpers | P2 higiene |
| `anon` SELECT grant em algumas tabelas | filtrado por RLS + `auth.uid()` | P2 higiene |

---

## Fase 5 — Correções realizadas nesta branch

| Correção | Escopo |
|----------|--------|
| Relatório de sprint + artefatos de evidência | Docs / artifacts |
| Revalidação read-only de gates backup/migrations | Docs |
| **Nenhuma** migration aplicada em produção | Restrição da sprint |
| **Nenhum** deploy / merge automático | Restrição da sprint |
| PRs #448 / #446 | **não tocadas** |

---

## Testes — resumo

| Grupo | Aprovados | Reprovados | Notas |
|-------|-----------|------------|-------|
| Entity SSOT | 1 | 0 | |
| Vitest PDV operacional | 74 | 0 | |
| Vitest invariantes shared-core | 12 | 0 | |
| Vitest financeiro/estoque matrices | 26 | 0 | |
| Restore sintético local | 1 | 0 | |
| Backup produção CI | 0 | 10+ | Histórico recente 100% failure |
| Smoke loja / UI E2E autenticado | — | — | Não executável aqui |

---

## Pendências que exigem humano

1. **Backup produção:** resolver JIT/PAM **ou** upgrade Pro; depois `workflow_dispatch` backup + restore drill CI até verde.
2. **Apply migrations SSOT `20261007*`** (e decidir sobre `20261006120000`) em janela autorizada — fora do escopo deste agente sem ordem explícita.
3. **Smoke na máquina da loja** (`CHECKLIST_SMOKE_MAQUINA_LOJA.md`) incluindo itens **[HW]**.
4. Confirmar se app de produção já aponta para build que assume fechamento por forma — se sim, **não abrir loja** até apply das migrations 80000/90000.

---

## Riscos consolidados

| ID | Sev | Descrição |
|----|-----|-----------|
| OPS-BACKUP-P0 | **P0** | Sem backup prod restaurável; RPO não garantido |
| OPS-MIG-SSOT-P0 | **P0** | Cadeia SSOT Oct/07 na main sem schema remoto equivalente |
| OPS-STORE-SMOKE-P0 | **P0** | Smoke físico da loja pendente |
| OPS-FISCAL-INSERT-P1 | **P1** | INSERT authenticated em pendentes fiscais |
| OPS-FIN-PAINEL-P1 | **P1** | `formas_pagamento.conta_financeira_id` ausente |
| OPS-ANON-GRANTS-P2 | **P2** | Grants SELECT residual a anon (mitigado por RLS) |

---

## Decisão final

### **NO-GO** para piloto em loja com garantia operacional

Motivos determinantes:

1. `BACKUP_PRODUCTION_PENDING` — perda de dados do dia seria irrecuperável além do que o Free não retém.
2. Schema remoto **atrás** da `main` na cadeia SSOT de caixa/fiscal — risco de regressão operacional no fechamento e no enqueue fiscal.
3. `STORE_SMOKE_PENDING` — fluxo completo com hardware não certificado.

### GO CONDICIONAL (somente se o dono aceitar por escrito)

Permitido **apenas** se:

- o piloto for tratado como **demo controlada** (volume baixo, sem depender de RPO 24h), **e**
- as migrations SSOT forem aplicadas **antes** de vender com fechamento multi-forma, **e**
- houver aceite explícito do risco de backup Free / JIT quebrado.

Sem esses três itens, permanece **NO-GO**.

---

## Próximos passos ordenados

1. Humano: desbloquear backup (JIT ou Pro).
2. Humano: autorizar apply das 8 migrations `20261007*` (+ decisão `20261006120000`) em horário de baixo movimento.
3. Revalidar objetos remotos (RPC por forma, snapshot, REVOKE INSERT).
4. Executar checklist smoke na máquina da loja.
5. Só então reconsiderar **GO CONDICIONAL** → **GO**.
