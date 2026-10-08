# Relatório consolidado — Sprint P0/P1 estabilização operacional

**Data:** 2026-10-08  
**Alvo:** Jinlong 金龙 ERP/PDV — operação contínua em **uma** loja  
**Veredito geral:** **NO-GO PARA OPERAÇÃO CONTÍNUA**

Estados usados: `RESOLVIDO E VALIDADO` · `IMPLEMENTADO, NÃO VALIDADO` · `BLOQUEADO` · `NÃO VERIFICADO`

Separação de evidência: **código** | **teste local** | **operacional real**

---

## 1. Resumo executivo

Foram implementadas proteções locais e provas comportamentais (PGlite) para migration financeira obsoleta, INSERT fiscal e cenários financeiros mínimos. Procedimentos de restore sintético e smoke presencial foram documentados. O PR #485 (backup JIT) permanece aberto; backup recuperável e restore de artifact real **não** foram comprovados nesta missão (ambiente sem Docker/autorização de produção).

**Operação contínua permanece NO-GO** até evidências de backup + restore + smoke + permissões remotas + ausência de regressões críticas.

---

## 2. Inventário P0/P1

| ID | Tema | Estado | Evidência código | Evidência teste local | Evidência operacional |
|---|---|---|---|---|---|
| P0-01 | Backup recuperável | **BLOQUEADO** / NÃO VALIDADO | PR #485 workflow sonda direta | `guard:backup-jit` (branch #485) | Sem artifact success validado |
| P0-02 | Restauração isolada | **IMPLEMENTADO, NÃO VALIDADO** (sintético) | `PROCEDIMENTO_RESTORE_*` + `restore-synthetic-local.sh` | Script SKIP (Docker ausente neste VM) | Restore prod **BLOQUEADO** |
| P0-03 | Smoke presencial | **IMPLEMENTADO, NÃO VALIDADO** | `CHECKLIST_SMOKE_PRESENCIAL_P0.md` | N/A (roteiro) | Execução loja **PENDENTE** |
| P0-04 | Migration `…120000` proibida | **RESOLVIDO E VALIDADO** (CLI apply path) | quarantine `migrations-forbidden/` + deny-list + CI | assert + unit + apply-path PASS | MCP/psql manual ainda possível |
| P0-05 | INSERT fiscal | **IMPLEMENTADO, NÃO VALIDADO** (remoto) | SQL em `migrations-pending-auth/` (fora do CLI) | PGlite carrega SQL real + defesa re-GRANT | Apply remoto **BLOQUEADO** |
| P1-01 | Testes financeiros comportamentais | **IMPLEMENTADO, NÃO VALIDADO** (cobertura parcial) | `test-financeiro-comportamental-p1.mjs` | 4/4 PASS (PIX, split, idempotência, AR) | N/A |
| P1-02 | Drift Git × produção | **IMPLEMENTADO, NÃO VALIDADO** (plano) | `PLANO_RECONCILIACAO_DRIFT_9_*` | Deny-list isenta só `120000` | Demais 8 ainda bloqueiam CI drift |
| P1-03 | NF-e sem duplicata | **IMPLEMENTADO, NÃO VALIDADO** (especificação) | `MATRIZ_NFE_ENTRADA_*` | N/A | Decisão comercial pendente |

---

## 3. Correções implementadas

1. **Deny-list + quarantine:** SQL `20261006120000_*` movido para `migrations-forbidden/` (fora do path do CLI) + registry + header `FORBIDDEN_APPLY`.  
2. **Guards:** assert falha se o SQL reaparecer em `migrations/`; `guard-apply-migrations`; CI + `guard:all`.  
3. **Drift:** versões forbidden em quarantine não entram mais no apply path (deixam de aparecer como `remote_ausente` no disco).  
4. **SSOT-004 defesa:** SQL em `migrations-pending-auth/` (não aplicado pelo CLI até auth humana).  
5. **Testes PGlite:** fiscal carrega SQL real + caso re-GRANT; financeiro com escopo honesto (taxas/split/TRANSFERIR/BAIXAR_AR).  
6. **Docs:** smoke, restore sintético, drift 9, matriz NF-e, este relatório.

---

## 4. Arquivos e componentes alterados

### Frente B — segurança/integridade (`cursor/p0-seguranca-integridade-1966`)

- `backend/supabase/forbidden-migrations.json`
- `backend/supabase/migrations/20261006120000_financeiro_contas_formas_e_painel.sql` (header)
- `backend/supabase/migrations/20261008120000_ssot_004_drop_policy_insert_documentos_fiscais.sql`
- `backend/scripts/assert-forbidden-migrations.mjs` (+ `.test.mjs`)
- `backend/scripts/guard-apply-migrations.mjs`
- `backend/scripts/test-fiscal-insert-auth.mjs`
- `backend/scripts/test-financeiro-comportamental-p1.mjs`
- `backend/scripts/p0-migration-status.mjs` (+ teste)
- `backend/package.json`, `package.json` (`guard:forbidden-migrations`)
- `.github/workflows/ci-backend-supabase.yml`
- `docs/piloto-d0/PLANO_RECONCILIACAO_DRIFT_9_MIGRATIONS.md`
- `docs/piloto-d0/MATRIZ_NFE_ENTRADA_OBRIGACAO_FINANCEIRA.md`
- `docs/piloto-d0/RELATORIO_ESTABILIZACAO_P0_P1_2026-10-08.md`

### Frente A — recuperação (PR separado)

- `docs/piloto-d0/PROCEDIMENTO_RESTORE_SINTETICO_LOCAL.md`
- `docs/piloto-d0/CHECKLIST_SMOKE_PRESENCIAL_P0.md`
- `scripts/restore-synthetic-local.sh`

### Já em voo (PR #485)

- Workflow backup sonda direta JIT, docs GO/NO-GO, plano pós-OPS-02.

---

## 5. Evidências dos testes (locais, executados)

| Suite | Resultado | Log |
|---|---|---|
| `assert:forbidden-migrations` | PASS (1 proibida) | `/opt/cursor/artifacts/p0p1-integrity-tests.log` |
| `test:forbidden-migrations` | 4/4 PASS | idem |
| `guard-apply-migrations` com `120000` | exit 1 (bloqueado) | shell desta sessão |
| `test:fiscal-insert-auth` | 4/4 PASS | idem |
| `test:financeiro-comportamental` | 4/4 PASS | idem |
| `test:migration-status` | 13/13 PASS (incl. forbidden) | shell desta sessão |

---

## 6. Testes não executados e motivos

| Item | Motivo |
|---|---|
| Restore sintético completo (`restore-synthetic-local.sh`) | Docker indisponível neste ambiente → SKIP documentado |
| Backup remoto / artifact GitHub | Requer merge #485 + dispatch autorizado + secrets |
| Restore artifact produção | Autorização específica + DESTINO isolado |
| Smoke presencial loja | Autorização + presença física |
| Apply migrations SSOT no Jinlong remoto | Explicitamente proibido nesta missão |
| Cobertura financeira completa (cancelamento, devolução, sangria, concorrência, fechamento) | Suíte P1-01 mínima entregue; expansão pendente |
| e2e-playwright em #485 | FAILURE no check (fora do escopo desta branch de integridade) |

---

## 7. Estado do backup (P0-01)

| Aspecto | Estado |
|---|---|
| Estratégia direta vs pooler | Código em #485 (sonda Temporary Access) — **IMPLEMENTADO, NÃO VALIDADO** |
| Artifact íntegro recuperável | **NÃO VERIFICADO** / **BLOQUEADO** sem run success |
| Storage Supabase no backup | Depende do workflow — não revalidado aqui |
| Monitoramento falhas | Workflows existentes; SUCCESS ≠ recuperável |

---

## 8. Estado da restauração (P0-02)

| Aspecto | Estado |
|---|---|
| Procedimento sintético documentado | **IMPLEMENTADO** |
| Drill sintético neste VM | **NÃO VERIFICADO** (Docker) |
| Restore backup real | **BLOQUEADO** |

---

## 9. Estado do smoke presencial (P0-03)

Roteiro completo (auth, PDV, caixa, estoque, AR, falhas, PT/ZH, ergonomia): **IMPLEMENTADO**.  
Execução: **PENDENTE** / **BLOQUEADO** sem autorização.

---

## 10. Situação do drift (P1-02)

Nove `remote_ausente` classificadas; **nenhuma** aplicada.

- `20261006120000` → deny-list (não deve bloquear gate após merge desta PR).  
- Demais 8 (+ opcional `20261008120000`) → plano com ordem e auth humana.  
- `163100` → INVESTIGAR / matriz comercial.

CI `migration-remote-drift` em #485 ainda **FAILURE** pelas 8 candidatas — esperado até reconciliação autorizada ou isenção humana explícita.

---

## 11. Regras comerciais pendentes (P1-03)

Ver `MATRIZ_NFE_ENTRADA_OBRIGACAO_FINANCEIRA.md`: R5 (NF-e com valor e zero duplicatas) sem decisão A/B/C; `163100` permanece proibida.

---

## 12. Riscos remanescentes

1. Backup/restore não comprovados → perda irrecuperável sob falha grave.  
2. Policy INSERT fiscal ainda pode existir no remoto até apply autorizado da mig DROP.  
3. Drift SSOT (cancelamento, fechamento por forma, etc.) não aplicado.  
4. Testes financeiros PGlite não exercitam RPCs completas de produção.  
5. Guard CI **não** impede `apply_migration` MCP manual fora do wrapper.  
6. CI e2e em #485 vermelho (ruído/risco de merge).

---

## 13. PRs preparados

| PR / branch | Escopo | Merge |
|---|---|---|
| [#485](https://github.com/nocodenn-cell/fastproduct/pull/485) `cursor/p0-estabilizacao-jit-1966` | Backup JIT / docs GO-NO-GO | Não automático; checks mistos |
| [#488](https://github.com/nocodenn-cell/fastproduct/pull/488) `cursor/p0-seguranca-integridade-1966` | P0-04/05, P1 docs/testes, CI guards | Draft — sem merge automático |
| [#489](https://github.com/nocodenn-cell/fastproduct/pull/489) `cursor/p0-recuperacao-ops-1966` | Restore sintético + smoke checklist | Draft — sem merge automático |

---

## 14. GO/NO-GO por bloqueador

| Bloqueador | Decisão |
|---|---|
| Backup recuperável | **NO-GO** |
| Restauração validada (real) | **NO-GO** (sintético só documentado) |
| Integridade financeira (provas remotas) | **NO-GO** (local parcial OK) |
| Segurança permissões fiscais (remoto) | **NO-GO** (local OK) |
| Smoke presencial | **NO-GO** (roteiro pronto) |
| Ausência regressões críticas | **NÃO VERIFICADO** |

---

## 15. GO/NO-GO geral

# **NO-GO PARA OPERAÇÃO CONTÍNUA**

Critério de liberação (missão §9) **não** satisfeito. Manter piloto apenas sob supervisão e gates já documentados em `GO_NO_GO_OPERACAO_CONTINUA_2026-10-08.md` (branch #485).

### Próximos passos autorizáveis (humanos)

1. Revisar/merge #485 quando checks aceitáveis; **um** dispatch `backup-scheduled`.  
2. Autorizar restore drill em DESTINO isolado.  
3. Agendar smoke presencial com checklist.  
4. Revisar apply seletivo SSOT (sem `120000`, sem `163100` até GO comercial).  
5. Expandir P1-01 (cancelamento, devolução, sangria, concorrência).
