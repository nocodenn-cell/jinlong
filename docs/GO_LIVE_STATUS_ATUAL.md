# Go-Live — status atual (PR #267)

**Atualizado:** 2026-08-08 (UTC) · branch `cursor/reconciliacao-supabase-audit-633a`  
**Decisão:** ver seção 6.

---

## 1. Auditoria estrutural greenfield (P0.1)

### Causa raiz comum

`supabase db reset` aplica arquivos por **ordem lexicográfica do nome**.

| Prefixo | Ordena relativamente a `2026…` |
|---------|--------------------------------|
| `001`–`201` | antes |
| `2026…` (timestamps) | meio |
| `205`–`269`, `24701`–`24703` | **depois de todos os `202608*`** (`"205" > "202608"` na 2ª posição) |

Os numerics `205`–`269` foram aplicados em produção **antes** dos backports `202608*` (história cronológica). No greenfield eles rodavam **por último**, depois de migrations que já:

- `DROP POLICY` / recriaram RLS (ex.: `294` fornecedores, `265` clientes);
- reaplicaram funções/observabilidade (`311`);
- alteraram overloads/grants.

Isso gera a classe de erro: `policy/function … does not exist` a cada CI — não bugs isolados.

### Correção SSOT (menor conjunto)

1. **Reordenar** `205`–`269` + `24703` → `20260621000100`…`20260621005700`  
   (gap após `20260620222629`, antes de `20260707000000`) — espelho do SSOT `270`–`289`.
2. **`24701`/`24702`** → `20260710212310`/`20` **após** `264` (evita `cannot change return type` da v4).
3. **Idempotizar** `CREATE POLICY` bare nos near-duplicates de julho:
   - `20260707000000` (`venda_eventos_select_loja`)
   - `20260710163032` (3 policies `vendas_em_espera_*`)
4. **Drift gate**: reordenação SSOT + remote-only numeric `205`–`289` / `24701`–`03` = informativo.

**Não alterado:** `20260808130200_*` (Fase 3.2 HUMAN GATE). Sem `db push` prod. Sem bypass do greenfield gate.

### Migrations afetadas vs intocadas

| Grupo | Ação |
|-------|------|
| 57 arquivos `205`–`269` / `24701`–`03` | rename (conteúdo intacto) |
| 2 backports julho (policy) | `DROP POLICY IF EXISTS` antes do `CREATE` |
| `p0-migration-status.mjs` | classificar drift da reordenação |
| Demais `202608*` / Fase 3.2 / app | sem mudança de negócio |

Guards anteriores em `224` / `278` / `282` / `275` permanecem como defesa; com a nova ordem a maioria torna-se no-op quando o objeto existe.

---

## 2. P0 — E2E crítico

| Item | Status | Evidência |
|------|--------|-----------|
| Causa `UNAUTHORIZED` smoke sync | **DONE** | Nonce UUID + HMAC com `device` |
| `smoke:sync-edge` PASS | **DONE** (runs recentes) | `[smoke-sync] OK` / `[pipeline] OK: smoke:sync-edge` |
| Playwright sync-fluxo pós-smoke | **P0** | `EVENT_PROCESSING_FAILED` — seed produto/operador em ajuste; revalidar após greenfield PASS |

---

## 3. CI / gates

| Gate | Classificação |
|------|---------------|
| `migration-remote-drift` | independente — PASS esperado (reorder informativo) |
| `smoke:sync-edge` (pipeline E2E) | independente |
| `Supabase local gates` | **P0** — próximo CI deve passar de `001→HEAD` sem a classe ALTER/DROP invertida |
| Fase 3.2 | **P2** HUMAN GATE |

---

## 4. Fase 3.2 HUMAN GATE

`20260808130200_*` **intocada**. Piloto comercial **não** exige apply imediato se o app não consome `venda_finance_context`. Aplicar em janela controlada pós-piloto.

---

## 5. Pendências

| ID | Prioridade | Descrição |
|----|------------|-----------|
| GF-RESET | **P0** | Migrations 001→HEAD PASS no CI (`Start`+`Reset`); RLS scope seed ajustado |
| E2E-SYNC | **P0** | Playwright sync-fluxo PASS (smoke já OK) |
| INT-MANUAL | **P1** | Checklist integração pós-CI |
| F32-HUMAN | **P2** | Apply 3.2 em prod |

---

## 6. Decisão objetiva

**`BLOCKED`** até local gates + E2E crítico verdes com evidência de run.

Não declarar `READY` com P0 aberto.
