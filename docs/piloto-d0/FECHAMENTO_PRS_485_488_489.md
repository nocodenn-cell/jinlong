# Fechamento P0 — PRs #485, #488, #489 (atualizado M1)

**Data:** 2026-10-08 · **Revalidação CI:** tip #488 `da0ff15d`  
**Base main:** `ea917430`  
**Merge/deploy:** não realizados (proibido)

---

## 1. Estado e dependências

| PR | Branch | Tip | Mergeable | mergeStateStatus | Dependência |
|---|---|---|---|---|---|
| [#485](https://github.com/nocodenn-cell/fastproduct/pull/485) | `cursor/p0-estabilizacao-jit-1966` | `92f5f22a` | MERGEABLE | UNSTABLE | Independente (JIT + guard backup) |
| [#488](https://github.com/nocodenn-cell/fastproduct/pull/488) | `cursor/p0-seguranca-integridade-1966` | `da0ff15d` | MERGEABLE | BLOCKED | Independente; tips fecham types-drift pós-quarentena |
| [#489](https://github.com/nocodenn-cell/fastproduct/pull/489) | `cursor/p0-recuperacao-ops-1966` | `26ee17b9` | MERGEABLE | UNSTABLE | Independente (restore synth + smoke roteiro) |

Ordem sugerida de merge (após aceite humano): **#489 → #485 → #488** (docs/ops primeiro; integridade por último por drift SSOT).

---

## 2. Causa exata de cada falha de CI

| Check | PRs | Causa raiz | Regressão desta sprint? | Ação |
|---|---|---|---|---|
| `e2e-playwright` | 485, 488, 489, 492 | Locators mobile / navigation strict / i18n etiquetas — falhas de UI fora do escopo P0 backup/integridade | **Preexistente** (também em docs-only #492) | Não mascarar; PR e2e dedicado |
| `migration-remote-drift` | 485, 488 | 8 SSOT `20261007*` `remote_ausente` + pares HUMAN_GATE git/remote timestamps | **Não** (SSOT já em main/PR); #488 adiciona `20261008140000` (coluna) → +1 remote_ausente até apply humano | Apply seletivo autorizado |
| `Supabase local gates` / `check:types-drift` | 488 | Quarentena removeu (1) coluna `conta_financeira_id` e (2) RPC `financeiro_comando_v1` + wrapper | **Regressão local da quarentena** | **Corrigido** tips `f594945a` + `da0ff15d` |

### #488 — linha do tempo CI local gates

1. Quarentena `120000` → ENOENT fixtures financeiros → tip `1fac3bed` (path `migrations-forbidden/`)  
2. Tip `1fac3bed` → types-drift coluna (`conta_financeira_id`)  
3. Tip `f594945a` → `20261008140000` coluna IF NOT EXISTS  
4. Tip `f594945a` CI → types-drift RPC (`financeiro_comando_v1` ausente)  
5. Tip `da0ff15d` → `20261008140100` rename+wrapper (sem captura)  
6. CI run `37814186308`: **`check:types-drift` PASS** (`Tipos em dia com o banco: 7636 linhas.`); job `Supabase local gates` PASS; **`migration-remote-drift` FAIL** (humano)

---

## 3. Checklist de aprovação / merge individual

### #489 (restore + smoke)

- [ ] Restore sintético local PASS (já comprovado MODE=local)
- [ ] Aceitar e2e vermelho **ou** wait PR e2e
- [ ] **Não** declarar ops contínua sem restore **real** + smoke presencial
- [ ] Review docs; merge se required-checks aceitos

### #485 (JIT + backup guard)

- [ ] `guard:backup-jit` PASS no tip
- [ ] Aceitar drift/e2e ou follow-up
- [ ] Pós-merge: 1× `workflow_dispatch` `backup-scheduled` (humano)
- [ ] Validar artifact recuperável antes de GO ops

### #488 (integridade)

- [ ] `assert:forbidden-migrations` PASS
- [ ] PGlite fiscal + financeiro + pdv-caixa PASS
- [ ] `check:types-drift` PASS no tip `da0ff15d`
- [ ] `migration-remote-drift`: aceite humano explícito **ou** apply seletivo SSOT (sem `120000`, sem `163100` até GO comercial)
- [ ] Não mergear se required check drift sem aceite

---

## 4. Bloqueadores ops contínua (permanecem)

1. Backup artifact real recuperável  
2. Restore artifact real em destino isolado  
3. Smoke presencial loja  

Estes **não** são substituídos por restore sintético nem por gates locais.
