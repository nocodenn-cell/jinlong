# P1-02 — Fechamento: reconciliação Git × Produção

**Status:** preparação técnica **completa** · execução remota **NÃO autorizada**  
**Tip #488:** `da0ff15d` · branch desta entrega: `cursor/p1-02-fechamento-reconciliacao-1966`  
**Base documental:** `P1_02_VALIDACAO_FINAL_MATRIZ_RECONCILIACAO.md`  
**Restrições cumpridas:** sem DDL remota, sem `db push`, sem `migration repair`, sem merge/deploy, gate intacto, sem dados reais.

Legenda de evidência: **COMPROVADO** · **INFERÊNCIA** · **BLOQUEADO**.

---

## 0. Resposta ao critério de aceite

> O Jinlong está tecnicamente preparado para reconciliar as migrations em produção, em lotes controlados, sem comprometer caixa, financeiro, emissão fiscal e integridade?

| Dimensão | Veredito |
|---|---|
| Inventário Git × remoto | **COMPROVADO** — matriz §1 |
| Ordem/idempotência local (sem 163100) | **COMPROVADO** — 9/9 APPLY+REAPPLY |
| Contratos financeiros/caixa locais | **COMPROVADO** — baterias §7 |
| Supersessão funcional de `120000` | **COMPROVADO** (SQL + remoto RO + CLI path) |
| Plano operacional por lote | **COMPROVADO** — §4 |
| Backup/restore ensaiado | **BLOQUEADO** — org **Free**; sem daily backup/PITR comprovável |
| Apply remoto / merge #488 | **NO-GO** até auth humana + decisão backup + decisão `163100` |

**Recomendação final:** plano **executável após autorizações** · **não** executar agora · merge #488 **NO-GO** enquanto drift blocking > 0 (inclui `163100` se permanecer em `migrations/` sem apply).

---

## 1. Matriz consolidada Git × remoto

### 1.1 Inventário por origem

| Version | main `migrations/` | #488 tip path | Remoto `schema_migrations` | Auth humana | Lote | Gate tip se ausente |
|---|---|---|---|---|---|---|
| `20261006120000` | **ainda no path CLI** | `migrations-forbidden/` + deny-list | ausente | N/A — **proibido** | — | tip: não conta (forbidden); **main: contaria** |
| `20261006180000` | sim | sim | **como `20261006195837`** | já aplicada (par MCP) | legado | HUMAN_GATE esperado se listar drift de filename |
| `20261007161220` | sim | sim | **ausente** | pendente | A | blocking |
| `20261007163000` | sim | sim | ausente | pendente | A | blocking |
| `20261007163100` | sim | sim | ausente | **NO-GO** fiscal/comercial | — | **blocking legítimo** se não aplicada |
| `20261007163200` | sim | sim | ausente | pendente | A | blocking |
| `20261007170000` | sim | sim | ausente | pendente | A | blocking |
| `20261007171000` | sim | sim | ausente | pendente | A | blocking |
| `20261007180000` | sim | sim | ausente | pendente | B | blocking |
| `20261007190000` | sim | sim | ausente | pendente | B | blocking |
| `20261008120000` | não | `migrations-pending-auth/` | ausente | pendente (fora CLI) | — | **não** entra no gate |
| `20261008140000` | não | `migrations/` (#488) | ausente | pendente | C | blocking no tip |
| `20261008140100` | não | `migrations/` (#488) | ausente | pendente | C | blocking no tip |

**COMPROVADO (remoto RO, 2026-10-08):** tip `07*`/`08*` ausentes; presente `20261006195837` (`financeiro_contas_operacionais`); `financeiro_contas_forma=true`; captura usa `financeiro_conta_forma` + PIX automática; `formas_pagamento.conta_financeira_id=false`; `financeiro_comando_v1=false`; `caixas_fechamento_formas=false`; `auth_insert_docs=true`; `fiscal_marcar_cancelado` ausente; `calcular_valor_sistema_por_forma_caixa` ausente.

Artefato: `/opt/cursor/artifacts/p1-02-fechamento-remote-ro-inventory.json`.

### 1.2 Dependências críticas

```text
Lote A: 161220 → 163000 → 163200 → 170000 → 171000
         (163100 INTENCIONALMENTE FORA — permanece em migrations/ → gate RED)

Lote B: 180000 → 190000   (exige E(c) / valor_sistema_dinheiro já no remoto)

Lote C: 140000 → 140100   (140100 exige financeiro_comando existente; VINCULAR usa coluna)

Canônico liquidação: 06180000→195837 (já remoto) — NÃO substituir por coluna legada
```

### 1.3 `163100` — exclusão ≠ drift resolvido

**COMPROVADO** via `classifyDriftEntries` (`p0-migration-status.mjs` + simulação):

| Após | blocking restantes | Gate |
|---|---|---|
| Lote A | 5 (`163100`+B+C) | RED |
| Lote B | 3 (`163100`+C) | RED |
| Lote C sem `163100` | **1 (`163100`)** | **RED — bloqueio legítimo** |
| A+B+C+`163100` | 0 | GREEN |

Não modificar o gate para mascarar. Opções humanas futuras (não executadas):

1. Aplicar `163100` após preencher `MATRIZ_NFE_ENTRADA_OBRIGACAO_FINANCEIRA.md` (R5).  
2. Mover `163100` para `migrations-pending-auth/` (política explícita de “fora do path CLI até GO”) — **só com auth**; não feito nesta sprint.

---

## 2. GO/NO-GO por migration (apply remoto)

| Version | GO/NO-GO | Base |
|---|---|---|
| `20261006120000` | **NO-GO** permanente | FORBIDDEN; regressão PIX (**COMPROVADO**) |
| `20261007161220` | **GO condicional** | Lote A + backup/auth |
| `20261007163000` | **GO condicional** | Lote A; risco patch painel |
| `20261007163100` | **NO-GO** | Matriz NF-e vazia (**BLOQUEADO** comercial) |
| `20261007163200` | **GO condicional** | Lote A |
| `20261007170000` | **GO condicional** | Lote A; superfície mov/AR |
| `20261007171000` | **GO condicional** | Lote A; ordem cancel |
| `20261007180000` | **GO condicional** | Lote B |
| `20261007190000` | **GO condicional** | Lote B; acopla `fechar_caixa_atomico` |
| `20261008120000` | **NO-GO** até auth | pending-auth (DROP POLICY) |
| `20261008140000` | **GO condicional** | Lote C |
| `20261008140100` | **GO condicional** | Lote C + dump `pg_proc` pré-rename |

---

## 3. GO/NO-GO por lote

| Lote | Conteúdo | GO execução remota agora | Gate tip após sucesso |
|---|---|---|---|
| A | 5 SSOT (sem 163100) | **NO-GO** (falta auth + backup) | RED (5) |
| B | 180000→190000 | **NO-GO** (após A + auth) | RED (3) |
| C | 140000→140100 | **NO-GO** (após A+B ou decisão isolar + auth) | RED (1 = 163100) |
| 163100 | avulso | **NO-GO** | — |

---

## 4. Planos operacionais (sem execução)

Scripts:

- Inspeção RO: `backend/scripts/p1-02-inspect-remote-readonly.sql`
- Simulação gate: `backend/scripts/p1-02-simulate-drift-after-lotes.mjs`
- Ordem local: `backend/scripts/p1-02-local-migration-order.mjs`

### 4.0 Pré-voo comum (todos os lotes)

| # | Pré-condição | STOP se falhar |
|---|---|---|
| P1 | Backup/PITR **comprovável** OU aceite escrito que **permanece FAIL** (não equivale a restore testado) | STOP financeiro |
| P2 | Snapshot privado corpos/ACLs RPCs alvo (`pg_get_functiondef` + grants) | STOP |
| P3 | Janela + observador + rollback owner | STOP |
| P4 | Gate drift **não** alterado; sem `db push --include-all` | STOP processo |
| P5 | Inspeção RO baseline salva | STOP |

**Backup (COMPROVADO 2026-10-08):** org plan **`free`** — daily backup/PITR plataforma **não incluídos**. Evidência histórica: `P0-2_BACKUP_EVIDENCIA.md`. Para lotes financeiros: **não** tratar aceite de risco como restore ensaiado.

### Lote A — objetos / smoke / STOP / recovery

| Campo | Conteúdo |
|---|---|
| Objetos | `fiscal_marcar_cancelado`, harden `fiscal_marcar_emitido`, `fiscal_cancelar_documento`, patch `financeiro_painel`, `trg_creditar_saldo_caixa_venda_dinheiro`, `cancelar_venda_transacional`, `registrar_movimentacao`, `aprovar_movimentacao`, liquidação/estorno AR, REVOKE INSERT docs fiscais |
| Ordem | `161220 → 163000 → 163200 → 170000 → 171000` |
| Smoke | cancel sintético homolog; sangria E(c); INSERT authenticated docs = false; enqueue RPC existe |
| STOP | DO prova falha; hash/corpo painel sem ponto de patch; INSERT auth volta true; cancel sem guard E(c) antes de devolução |
| Recovery | Restaurar corpos RPC do snapshot; **não** apagar `schema_migrations`; re-REVOKE se necessário. Rollback DDL completo **limitado** |
| Evidências auth | output inspeção RO pré/pós; hashes; log apply; aceite backup |

### Lote B

| Campo | Conteúdo |
|---|---|
| Objetos | `internal.valor_sistema_registrado_forma`, `calcular_valor_sistema_por_forma_caixa`, tabela `caixas_fechamento_formas`+RLS, `persistir_fechamento_formas`, `listar_*`, REPLACE `fechar_caixa_atomico` |
| Ordem | `180000 → 190000` |
| Smoke | fechar caixa sintético; linhas em `caixas_fechamento_formas`; DINHEIRO via E(c); **sem** UPDATE em `vendas_pagamentos` históricos |
| STOP | `fechar_caixa_atomico` sem persistir formas; GRANT anon EXECUTE; divergência soma formas vs total |
| Recovery | Restaurar `fechar_caixa_atomico`; dropar tabela só se vazia e autorizada |
| Nota | **INFERÊNCIA:** não altera histórico de pagamentos (SQL só cria calc/snapshot) — confirmar por inspeção RO pós-apply |

### Lote C

| Campo | Conteúdo |
|---|---|
| Objetos | coluna `formas_pagamento.conta_financeira_id`+FK; rename condicional → `financeiro_comando_v1`; wrapper `financeiro_comando` (INATIVAR/VINCULAR) |
| Ordem | `140000 → 140100` |
| Smoke | `VINCULAR_FORMA_PAGAMENTO` + `INATIVAR_CONTA` sintéticos; `CONFIGURAR_CONTA_FORMA` operacional intacto; painel admin |
| STOP | rename falha; callers 404; `financeiro_comando_operacional` quebrado; wrapper escreve em `financeiro_contas_forma` (não deve) |
| Recovery | rename inverso `v1`→`comando` **só com auth**; **nunca** reaplicar `120000` |
| Callers **COMPROVADO** | `financeiroLojaActions.ts` → `financeiro_comando` + `_operacional`; UI `FinanceiroContas` usa operacional para vínculo canônico; Edge sem callers `financeiro_comando*` |

### Se MCP gravar timestamp ≠ arquivo

Registrar par atômico em `migration-human-gates.json` no mesmo PR de reconciliação. Sem repair cego.

---

## 5. Supersessão de `20261006120000` (além de similaridade)

| Peça | Destino | Prova funcional |
|---|---|---|
| A coluna | `140000` | Tipagem/types; liquidação **não** depende dela |
| B captura | `06180000`→`195837` | Remoto: `capturar_uses_conta_forma=true`, `capturar_has_auto_pix=true`; SHA captura ≠ 120000; 120000 **sem** liquidação PIX |
| C wrapper | `140100` | Mesmos verbos; bigram 0.9728 é **sinal**, não prova — prova = verbos + testes `test:financeiro-loja` (INATIVAR/VINCULAR) |
| D painel | `06180000` | Injeta `contas_forma`; 140x não reimplementa |

**CLI path tip:** `120000` **somente** em `migrations-forbidden/` (**COMPROVADO**).  
**Risco main:** `120000` ainda em `migrations/` até merge #488 — apply acidental possível na main antiga.

---

## 6. CI / governança — estado previsto do gate

Simulação: `node backend/scripts/p1-02-simulate-drift-after-lotes.mjs`  
Artefato: `/opt/cursor/artifacts/p1-02-fechamento-gate-simulation.json`

| Pergunta | Resposta |
|---|---|
| Gate após lote A? | **RED** (5) |
| Após lote B? | **RED** (3) |
| `163100` excluída do rollout bloqueia? | **Sim** — permanece em `migrations/` → `remote_ausente` blocking |
| `140000`/`140100` separáveis? | **Sim** tecnicamente (lote C aditivo); **não** fecham o gate sozinhas |
| Merge seguro #488? | `blocking=[]` no tip: A+B+C aplicados (+ HUMAN_GATE se preciso) **e** `163100` reconciliada (apply após GO **ou** retirada explícita do path CLI por política) **e** quarantine `120000` no tip |

---

## 7. Validação local final

| Suite / prova | Resultado | Limitação |
|---|---|---|
| `assert:forbidden-migrations` | PASS | — |
| `test:forbidden-migrations` | 5/5 | — |
| `test:migration-status` | 18/18 | — |
| `test:financeiro-loja` | **16/16** | PGlite sintético |
| `test:pdv-caixa-financeiro` | **1/1** | — |
| `test:financeiro-comportamental` | **4/4** | — |
| `test:fiscal-insert-auth` | **5/5** | pending-auth SQL |
| `p1-02-local-migration-order` | 9/9 APPLY+REAPPLY + smoke VINCULAR | PG `fp_rollout_p0`; sem 163100 |
| `p1-02-compare-120000-supersession` | OK | — |
| `verify-cancelar-venda-equivalencia` | MATCH vs snapshot remoto versionado | não é pós-lote A |
| `check:types-drift` | **FAIL ambiente** | exige `supabase gen types --local`; stack Docker/Supabase local indisponível neste runner |
| `fechamento-por-forma-prova` | **SKIP ambiente** | porta 54322 (supabase local) recusada |

Simulação falha entre lotes: reapply individual OK; falha mid-lote remota → STOP + restore corpo RPC (rollback DDL limitado) — **INFERÊNCIA operacional**, não ensaiada em prod.

---

## 8. Autorizações humanas necessárias (lista objetiva)

1. **Backup:** upgrade Pro + daily backup **ou** aceite escrito FAIL explícito (não equivale a restore).  
2. **Restore drill** (recomendado antes de A/B financeiros) conforme runbook canônico.  
3. **Auth Lote A** (janela + observador + snapshot RPCs).  
4. **Auth Lote B** após A verde.  
5. **Auth Lote C** + diff `pg_proc` de `financeiro_comando*` pré-140100.  
6. **Decisão R5 / matriz NF-e** antes de qualquer apply de `163100`.  
7. **Auth `08120000`** (DROP POLICY) se desejada defesa em profundidade — independente dos lotes A–C.  
8. **Auth merge #488** somente com caminho para `blocking=[]` (inclui estratégia `163100`).  
9. **Auth pares HUMAN_GATE** se MCP timestamps ≠ filenames.

---

## 9. Recomendação para o PR #488

| Ação | Veredito |
|---|---|
| Merge agora | **NO-GO** |
| Conteúdo local (quarantine, 140x, deny-list, provas) | **GO revisão** |
| Rollout remoto | **NO-GO** até itens §8 |
| Enfraquecer drift gate / `--include-all` | **NO-GO** permanente nesta sprint |

Próximo passo humano sugerido: (1) backup/Pro ou aceite FAIL documentado; (2) autorizar Lote A em janela; (3) em paralelo, fechar matriz NF-e para destravar ou isolar `163100`.

---

## 10. Artefatos

| Artefato | Caminho |
|---|---|
| Matriz validação prévia | `docs/piloto-d0/P1_02_VALIDACAO_FINAL_MATRIZ_RECONCILIACAO.md` |
| Este fechamento | `docs/piloto-d0/P1_02_FECHAMENTO_RECONCILIACAO_GIT_PRODUCAO.md` |
| Inspeção RO | `backend/scripts/p1-02-inspect-remote-readonly.sql` |
| Sim drift | `backend/scripts/p1-02-simulate-drift-after-lotes.mjs` |
| Battery local | `/opt/cursor/artifacts/p1-02-fechamento-local-battery.log` |
| Remoto RO | `/opt/cursor/artifacts/p1-02-fechamento-remote-ro-inventory.json` |
| Gate sim | `/opt/cursor/artifacts/p1-02-fechamento-gate-simulation.json` |
| Compare 120000 | `/opt/cursor/artifacts/p1-02-120000-supersession-compare.json` |

---

*Nenhuma operação remota de escrita foi executada. Aguardando decisão humana.*
