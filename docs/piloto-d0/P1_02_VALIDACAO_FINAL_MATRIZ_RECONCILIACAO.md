# P1-02 — Validação final da matriz de reconciliação

**Status:** planejamento validado localmente · **nenhuma** aplicação remota.  
**Tip de referência (#488):** `da0ff15d`  
**Diagnóstico prévio:** `docs/audits/P0_RECONCILIACAO_MIGRATIONS_CI_2026_10_08.md` (#497)  
**Restrições cumpridas:** sem DDL remota, sem `migration repair`, sem merge/deploy, sem `db push --include-all`, gate de drift intacto, testes só com dados sintéticos.

---

## 1. Reconciliação: 9 (P1-02) vs 10 (gate #488)

| Conjunto | Origem | Itens |
|---|---|---|
| **P1-02 (9)** | `PLANO_RECONCILIACAO_DRIFT_9_MIGRATIONS.md` | `120000` (DESCARTAR) + 8 SSOT `07/10` |
| **Gate #488 tip (10)** | `migration-remote-drift` em `da0ff15d` | 8 SSOT `07/10` + `08140000` + `08140100` |
| **Interseção** | — | as 8 SSOT `20261007161220`…`20261007190000` |
| **Só P1-02** | — | `20261006120000` (já quarentenada; **não** é `remote_ausente` bloqueante no tip) |
| **Só #488 tip** | — | `20261008140000`, `20261008140100` |

### Por que os números diferem

1. A lista P1-02 inclui a obsoleta `120000` como item de **descarte** (não de apply).
2. O tip #488 removeu `120000` do path do CLI (`migrations-forbidden/` + `FORBIDDEN_APPLY`) e extraiu duas fatias seguras (`140000`/`140100`) para restaurar `database.types.ts` após a quarentena.
3. O gate do tip conta **10 `remote_ausente` bloqueantes**: as 8 SSOT (já em `main`) + as 2 novas do #488.  
   `120000` em quarantine **não** entra no disco do CLI → não aparece como drift bloqueante (categoria `FORBIDDEN_APPLY`).

### Mapa unificado (11 linhas lógicas)

| Version | Branch / path | Papel no inventário | Conta no gate tip? |
|---|---|---|---|
| `20261006120000` | `migrations-forbidden/` (#488) | DESCARTAR — nunca apply remoto | Não (forbidden) |
| `20261007161220`…`190000` (8) | `migrations/` em `main` e #488 | SSOT / fechamento — apply condicional | Sim (8× remote_ausente) |
| `20261008140000` | `migrations/` só #488 | Extrato seguro da 120000 (coluna) | Sim |
| `20261008140100` | `migrations/` só #488 | Extrato seguro da 120000 (wrapper) | Sim |

---

## 2. Tratamento de `20261008140000` e `20261008140100`

| | `08140000` | `08140100` |
|---|---|---|
| **O que é** | `ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS conta_financeira_id` + FK condicional | Rename condicional `financeiro_comando`→`financeiro_comando_v1` + wrapper `INATIVAR_CONTA` / `VINCULAR_FORMA_PAGAMENTO` |
| **Por que existe** | Após quarentena da 120000, `check:types-drift` exigia a coluna e os verbos tipados | Idem — `database.types.ts` declara `financeiro_comando` e `financeiro_comando_v1` |
| **O que NÃO faz** | Não recria `financeiro_capturar_venda` legado; não patcha painel | Não recria captura; não patcha painel; não toca `financeiro_comando_operacional` |
| **Modelo canônico de liquidação** | Continua `financeiro_contas_forma` (`06180000` / remoto `195837`) | Wrapper legado coexiste; operacional permanece superfície nova |
| **Risco remoto** | Baixo (aditivo idempotente) | Alto (rename de RPC em uso por `financeiroLojaActions.ts`) |
| **Pré-condição remota** | Nenhuma crítica | Snapshot de `pg_proc` de `financeiro_comando*` + prova de callers |
| **GO apply remoto** | **CONDICIONAL** (auth humana; lote C) | **CONDICIONAL** (auth humana; lote C; só após diff remoto) |
| **GO merge #488** | Conteúdo local OK para types-drift | Idem; merge ainda **NO-GO** enquanto drift gate exigir as 10 alinhadas |

Consumidores confirmados do contrato `financeiro_comando` (não operacional):

- `pdv-importados/app/admin/financeiro/financeiroLojaActions.ts` → `rpc('financeiro_comando')` e `rpc('financeiro_comando_operacional')`
- Fixtures PGlite: `backend/scripts/test-financeiro-loja.mjs` (16/16 pass neste ambiente)

Remoto (leitura): existem `financeiro_comando` e `financeiro_comando_operacional`; **não** existe `financeiro_comando_v1` ainda.  
Remoto: `formas_pagamento.conta_financeira_id` = **false**; objetos SSOT 07/10 = **ausentes**.

---

## 3. Prova: `20261006120000` foi substituída (não reaplicar)

> **Terminologia:** no plano de descarte, “180000→195837” = arquivo local `20261006180000_financeiro_contas_operacionais.sql` aplicado no remoto com version MCP `20261006195837`. **Não** confundir com `20261007180000` (lote B — `calcular_valor_sistema_por_forma_caixa`).

### 3.1 Decomposição da 120000 (comparação mecânica)

Script: `backend/scripts/p1-02-compare-120000-supersession.mjs`  
Artefato: `/opt/cursor/artifacts/p1-02-120000-supersession-compare.json`

| Peça | Conteúdo 120000 | Sucessor canônico | Equivalência medida |
|---|---|---|---|
| A — coluna | `ADD COLUMN … conta_financeira_id uuid REFERENCES …` | `08140000` (coluna + FK em `DO` condicional) | Mesmo efeito tipado; 140000 **não** traz painel |
| B — captura | `internal.financeiro_capturar_venda` lê `formas_pagamento.conta_financeira_id`; PIX só em `previsao` (**sem** `RECEBIDO`/`financeiro_movimento`) | `06180000`→`195837`: helper `financeiro_conta_forma` + liquidação PIX automática | SHA norm **diferente** (`e1e2210a…` ≠ `afdffa20…`); bigram **0.7686** |
| C — wrapper | rename → `financeiro_comando_v1` + `INATIVAR_CONTA` / `VINCULAR_FORMA_PAGAMENTO` | `08140100` | Verbos idênticos; SHA norm ≠; bigram **0.9728** (equivalente semântico) |
| D — painel | patch `entradas_periodo` / lista `formas_pagamento` na coluna legada | `06180000` injeta `contas_forma` | Patches distintos; **140000/140100 não incluem D** |

### 3.2 Pós-condições desejadas (remoto já parcialmente alinhado via `06180000`→`195837`)

| Pós-condição | Esperado após sucessores | Se aplicar 120000 |
|---|---|---|
| `financeiro_contas_forma` | Presente (`06180000`/`195837`) | Não cria; captura volta a ler coluna legada |
| Auto-liquidação PIX (`RECEBIDO` + movimento) | Presente (`06180000`) | **Regrede** (só `previsao` PIX, sem depósito) |
| `formas_pagamento.conta_financeira_id` | Opcional (140000) | Recria (aditivo) |
| `financeiro_comando_v1` + wrapper | Via 140100 | Recria (overlap com 140100) |
| Painel `contas_forma` | Via `06180000` | Pode conflitar com patch de formas legado |

**Veredito:** `120000` permanece **FORBIDDEN_APPLY / NO-GO permanente**. Substituição operacional integral = `06180000` (já no remoto como `20261006195837`) + fatias tipadas `140000`/`140100` (ainda só Git).
---

## 4. `20261007163100` — permanece bloqueada

Conforme `docs/piloto-d0/MATRIZ_NFE_ENTRADA_OBRIGACAO_FINANCEIRA.md`:

- Apply remoto = **PROIBIDO** até decisão comercial R5 (A/B/C) e validação fiscal.
- Validação local desta rodada **excluiu** o arquivo da cadeia.
- Ordem futura, se autorizada: após `163000`, antes de `163200` (ou imediatamente após `163000` como no plano P1-02).

**GO apply:** **NO-GO** (fiscal + comercial).

---

## 5. Validação local — dependências e ordem

### Ambiente

- Postgres 16 isolado: database `fp_rollout_p0`, role `fp_rollout` (sintético, sem PII).
- Script: `backend/scripts/p1-02-local-migration-order.mjs`
- Docker/Supabase stack: **indisponível** neste runner (falha overlayfs whiteout) — não bloqueia a prova de ordem em Postgres nu.

### Cadeia aplicada (sem 163100)

```text
161220 → 163000 → 163200 → 170000 → 171000 → 180000 → 190000 → 140000 → 140100
```

| Resultado | Evidência |
|---|---|
| 9/9 APPLY OK | `/opt/cursor/artifacts/p1-02-local-order-report.json` |
| 9/9 REAPPLY OK (idempotência operacional) | mesmo report |
| Pós-condições | `fiscal_marcar_cancelado`, `calcular_valor_sistema_por_forma_caixa`, `caixas_fechamento_formas`, `formas_pagamento.conta_financeira_id`, `financeiro_comando`+`_v1`; INSERT authenticated em `documentos_fiscais_pendentes` = false |
| Smoke | `VINCULAR_FORMA_PAGAMENTO` sintético OK |
| PGlite financeiro | `npm run test:financeiro-loja` → **16/16 pass** |

### Dependências críticas

| Migration | Depende de | Motivo |
|---|---|---|
| 163000 | `financeiro_painel`, `valor_sistema_dinheiro`, `sincronizar_saldo_cache` | Patch/prova E(c) |
| 163200 | RPC `fiscal_enfileirar_documento_venda` + REVOKE INSERT | Prova estrutural |
| 170000 | stubs/canônicos de mov/AR + `sincronizar_saldo_cache` | Guards E(c) |
| 171000 | corpo de cancel de 163000/170000 | Guard **antes** de `devolucoes` |
| 180000 (forma) | `valor_sistema_dinheiro` | Read-model por forma |
| 190000 | 180000 + `fechar_caixa_atomico` | Snapshot no fechar |
| 140000 | `contas_financeiras` | FK |
| 140100 | `financeiro_comando` existente + coluna (para VINCULAR) | Rename + wrapper |

---

## 6. Matriz consolidada (branch × versão × risco × auth)

| Version | Branch tip | Path | Deps | Risco | Auth humana | GO apply remoto | GO lote |
|---|---|---|---|---|---|---|---|
| `20261006120000` | #488 quarantine | `migrations-forbidden/` | — | **Crítico se reaplicar** (regrede PIX) | N/A — proibido | **NO-GO** permanente | — |
| `20261007161220` | main + #488 | `migrations/` | docs fiscais | Médio | Sim | **GO condicional** | Lote A |
| `20261007163000` | main + #488 | `migrations/` | painel, sync cache | Alto | Sim | **GO condicional** | Lote A |
| `20261007163100` | main + #488 | `migrations/` | confirmar NF-e | Alto comercial | Sim + R5 | **NO-GO** | — (fora) |
| `20261007163200` | main + #488 | `migrations/` | enqueue RPC | Baixo | Sim | **GO condicional** | Lote A |
| `20261007170000` | main + #488 | `migrations/` | 163000 | Alto | Sim | **GO condicional** | Lote A |
| `20261007171000` | main + #488 | `migrations/` | 163000+170000 | Alto | Sim | **GO condicional** | Lote A |
| `20261007180000` | main + #488 | `migrations/` | E(c) | Médio | Sim | **GO condicional** | Lote B |
| `20261007190000` | main + #488 | `migrations/` | 180000 | Alto | Sim | **GO condicional** | Lote B |
| `20261008140000` | **só #488** | `migrations/` | contas_financeiras | Baixo | Sim | **GO condicional** | Lote C |
| `20261008140100` | **só #488** | `migrations/` | 140000 + financeiro_comando remoto | Alto | Sim + diff `pg_proc` | **GO condicional** | Lote C |

---

## 7. Lotes, checkpoints, parada, backup, restore, smoke

### Pré-voo (todos os lotes)

| Critério | Ação se falhar |
|---|---|
| Backup/PITR aceitável ou aceite escrito de risco (#485/#489) | **STOP** |
| Snapshot privado de corpos/ACLs das RPCs alvo | **STOP** |
| Janela + observador | **STOP** |
| Gate drift **não** alterado; sem `db push --include-all` | **STOP** (abortar processo) |

### Lote A — SSOT caixa/fiscal (sem 163100)

```text
161220 → 163000 → 163200 → 170000 → 171000
```

| Checkpoint | Smoke | Parada | Restore |
|---|---|---|---|
| Após cada version: ler `schema_migrations` (version/name/statements hash) | cancelar venda sintética / sangria E(c) em homolog se houver | Qualquer DO prova ou hash divergente inesperado | Restaurar corpo RPC do snapshot; **não** apagar `schema_migrations` |
| Pós-lote | REVOKE INSERT docs fiscais; `fiscal_marcar_cancelado` existe | INSERT authenticated voltar a ser true | Re-REVOKE + reaplicar 163200 |

### Lote B — Fechamento por forma

```text
180000 → 190000
```

| Checkpoint | Smoke | Parada | Restore |
|---|---|---|---|
| Função `calcular_valor_sistema_por_forma_caixa` | Fechar caixa sintético; snapshot em `caixas_fechamento_formas` | `fechar_caixa_atomico` sem `persistir_fechamento_formas` | Restaurar `fechar_caixa_atomico`; dropar tabela só se vazia |

### Lote C — Aditivos tipados #488

```text
140000 → 140100
```

| Checkpoint | Smoke | Parada | Restore |
|---|---|---|---|
| Coluna presente; **antes** de 140100: dump `financeiro_comando` | `VINCULAR_FORMA_PAGAMENTO` + `INATIVAR_CONTA` sintéticos; painel/actions | Rename falhar ou callers 404 | Rename inverso `v1`→`comando` só com auth; nunca 120000 |

### Se MCP gravar timestamp ≠ arquivo

Registrar par atômico em `migration-human-gates.json` no **mesmo** PR de reconciliação (reason + decisionDoc). Não usar repair cego.

---

## 8. GO/NO-GO

### Por migration (apply remoto)

| Version | GO/NO-GO |
|---|---|
| `20261006120000` | **NO-GO** permanente |
| `20261007161220` | **GO condicional** (Lote A) |
| `20261007163000` | **GO condicional** (Lote A) |
| `20261007163100` | **NO-GO** (fiscal/comercial) |
| `20261007163200` | **GO condicional** (Lote A) |
| `20261007170000` | **GO condicional** (Lote A) |
| `20261007171000` | **GO condicional** (Lote A) |
| `20261007180000` | **GO condicional** (Lote B) |
| `20261007190000` | **GO condicional** (Lote B) |
| `20261008140000` | **GO condicional** (Lote C) |
| `20261008140100` | **GO condicional** (Lote C, após diff remoto) |

### Por lote

| Lote | GO/NO-GO remoto agora |
|---|---|
| A | **NO-GO execução** até autorização humana explícita (plano pronto) |
| B | **NO-GO execução** até A concluído + auth |
| C | **NO-GO execução** até A+B (ou decisão de isolar C) + auth + diff `financeiro_comando` |
| 163100 (avulso) | **NO-GO** até matriz NF-e preenchida |

### Merge #488

**NO-GO** enquanto `migration-remote-drift` exigir as 10 `remote_ausente` alinhadas **e** não houver auth de reconciliação (ou política explícita de merge com dívida).  
Conteúdo local (quarentena + types-drift + provas) permanece **GO** nos gates locais.

### Gate de drift

**GO manter** — não enfraquecer; não HUMAN_GATE das 10 sem apply + hash.

---

## 9. Artefatos desta validação

| Artefato | Caminho |
|---|---|
| Script ordem local | `backend/scripts/p1-02-local-migration-order.mjs` |
| Script compare 120000 | `backend/scripts/p1-02-compare-120000-supersession.mjs` |
| Report ordem JSON | `/opt/cursor/artifacts/p1-02-local-order-report.json` |
| Log apply | `/opt/cursor/artifacts/p1-02-local-order.log` |
| Compare 120000 JSON | `/opt/cursor/artifacts/p1-02-120000-supersession-compare.json` |
| PGlite financeiro | `/opt/cursor/artifacts/p1-02-financeiro-loja.log` (16/16) |
| Plano 9 original | `docs/piloto-d0/PLANO_RECONCILIACAO_DRIFT_9_MIGRATIONS.md` |
| Matriz NF-e (163100) | `docs/piloto-d0/MATRIZ_NFE_ENTRADA_OBRIGACAO_FINANCEIRA.md` |

---

*Aguardando autorização humana explícita antes de qualquer operação remota.*
