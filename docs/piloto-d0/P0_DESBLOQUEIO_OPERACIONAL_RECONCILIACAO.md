# P0 — Desbloqueio operacional da reconciliação Git × Produção

**Branch:** `cursor/p0-desbloqueio-reconciliacao-1966`  
**Tip #488 (intocado):** `da0ff15d` / `cursor/p0-seguranca-integridade-1966`  
**Relatório P1-02 (versionado):** `docs/piloto-d0/P1_02_FECHAMENTO_RECONCILIACAO_GIT_PRODUCAO.md`  
**Restrições:** sem DDL remota, sem dump de dados reais, sem merge/deploy, gates intactos.

---

## A. O que foi resolvido

1. **Backup/restore procedimento** — script + runbook + drill sintético `RESTORE_DRILL_PASS` (não = prod validado).  
2. **`163100`** — decisão técnica: **MANTER BLOQUEADA** (depende R5 comercial).  
3. **`163200` vs `08120000`** — classificados **COMPLEMENTARES** com prova SQL + remoto RO.  
4. **Relatório P1-02** — localizado e versionado (esta linha de branches; ausente em `main` e no tip #488).  
5. **Testes SKIP** — causa raiz documentada (Docker overlayfs whiteout); **não** marcados PASS.  
6. **Matriz de riscos/autorizações** atualizada (§G).

---

## B. Evidências e comandos

| Ação | Comando / artefato |
|---|---|
| Localizar relatório | `git ls-tree` em `main` / #488 / fechamento → só em `cursor/p1-02-fechamento-*` e esta branch |
| Drill backup | `node backend/scripts/p0-backup-restore-drill-synthetic.mjs` → `/opt/cursor/artifacts/p0-backup-drill/drill-report.json` |
| Compare SSOT-004 | `node backend/scripts/p0-compare-ssot004-fiscal.mjs` |
| Remoto fiscal RO | MCP `execute_sql` → grant INSERT auth=true + policy `doc_fiscal_pendentes_insert_loja`=true |
| Supabase local | `npx supabase start` → `LegacyImagePrepullError` / whiteout → `/opt/cursor/artifacts/p0-desbloqueio-supabase-start.log` |
| Runbook | `docs/runbooks/BACKUP_RESTORE_DRILL_SINTETICO.md` |

---

## 1. Backup e restauração

| Item | Resultado |
|---|---|
| Procedimento | `BACKUP_RESTORE_DRILL_SINTETICO.md` + `backup.sh` (repo) |
| Drill sintético | **PASS** (integridade match) |
| Produção validada? | **NÃO** — Free + Opção B JIT/PAM vermelha |
| Classificação gate | permanece `BACKUP_PRODUCTION_PENDING` |

---

## 2. Decisão `20261007163100`

| Opção | Veredito |
|---|---|
| APLICAR | Não — implementa só R5=A; matriz comercial em branco |
| CORRIGIR | Não — sem defeito SQL demonstrável no guard |
| SUBSTITUIR | Só se R5=B/C (outro SQL) |
| **MANTER BLOQUEADA** | **SIM** |

Escopo: só NF-e **entrada** / AP; não toca vendas, AR nem emissão NFC-e saída.  
Histórico já confirmado sem duplicatas **não** é reescrito.  
Gate: exclusão do rollout **não** remove `remote_ausente` enquanto o arquivo estiver em `migrations/`.

Opções humanas futuras (não implementadas): apply após R5=A · ou mover para `migrations-pending-auth/`.

---

## 3. `163200` × `08120000` — COMPLEMENTARES

| | `163200` (migrations) | `08120000` (pending-auth) |
|---|---|---|
| REVOKE INSERT | sim | sim (reafirma) |
| DROP POLICY insert | **não** | **sim** |
| Prova enqueue RPC | sim | não |
| SHA iguais | não | — |

Remoto atual: **GRANT INSERT authenticated = true** e **policy insert ainda existe**.  
Logo: Lote A (`163200`) remove privilégio; `08120000` remove policy residual (defesa se GRANT voltar).  
**Não mover** `08120000` para `migrations/` sem auth.

Artefato: `/opt/cursor/artifacts/p0-desbloqueio-ssot004-compare.json`.

---

## 4. Versionamento do relatório P1-02

| Local | `P1_02_FECHAMENTO_…` |
|---|---|
| `origin/main` | ausente |
| tip #488 (`da0ff15d`) | ausente |
| `cursor/p0-rollout-prontidao-1966` | só matriz validação |
| `cursor/p1-02-fechamento-reconciliacao-1966` | presente |
| **esta branch** | presente + atualizado (ponteiro P0) |

---

## 5. Lacunas de teste

| Suite | Status |
|---|---|
| Financeiro / PDV / comportamental / fiscal-insert / ordem 9/9 | PASS (sessão anterior; não re-regressados sem necessidade) |
| Drill backup sintético | **PASS** (novo) |
| `check:types-drift` | **BLOQUEADO** — Supabase local Docker whiteout |
| `fechamento-por-forma-prova` | **BLOQUEADO** — mesma causa (porta 54322) |

Não classificar esses gates como aprovados.

---

## C. O que permanece bloqueado

- Backup/restore de **produção** (Free + JIT PAM).  
- Apply remoto de qualquer lote.  
- Decisão comercial R5 para `163100`.  
- Auth para mover/aplicar `08120000`.  
- Supabase local completo neste runner.  
- Merge #488 com `blocking=[]`.

---

## D. Riscos residuais

1. Rollout financeiro sem restore prod ensaiado.  
2. Após A+B+C, gate tip ainda RED por `163100`.  
3. Policy INSERT fiscal residual até `08120000`.  
4. main ainda pode ter `120000` no path CLI até merge tip #488.  
5. Patch string do painel em `163000` frágil se corpo remoto divergir.

---

## E. GO/NO-GO por lote

| Lote | GO/NO-GO remoto |
|---|---|
| A | **NO-GO** (backup prod + auth) |
| B | **NO-GO** (após A) |
| C | **NO-GO** (após A+B + diff `financeiro_comando`) |
| `163100` | **NO-GO** (MANTER BLOQUEADA) |
| `08120000` | **NO-GO** até auth (recomendada pós-A) |

---

## F. GO/NO-GO merge PR #488

**NO-GO.** Conteúdo local (quarantine/deny-list/140x) segue revisável; merge seguro exige caminho para drift `blocking=[]` + estratégia `163100` + backup prod.

---

## G. Próxima ação humana (objetiva)

1. **Desbloquear backup prod:** ticket Supabase JIT **ou** upgrade Pro → artifact verde + restore drill CI.  
2. **Preencher R5** em `MATRIZ_NFE_ENTRADA_OBRIGACAO_FINANCEIRA.md` (A/B/C).  
3. Se R5 ≠ A: autorizar mover `163100` → `pending-auth` (PR dedicado).  
4. Autorizar **Lote A** só após (1).  
5. Autorizar `08120000` (complementar) após/with A.  
6. Só então avaliar merge #488.

---

*Nenhuma escrita remota. Aguardando decisão.*
