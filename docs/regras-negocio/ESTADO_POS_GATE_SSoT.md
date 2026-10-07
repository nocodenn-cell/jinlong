# Estado pós-gate SSoT — fundação fechada

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Decisão arquitetural SSOT-001…004** | **GO** (pré-merge local PASS) |
| **Tip da stack** | `1292520e` — branch `cursor/remediacao-ssot-bloqueadores-001-004-7da4` |
| **PR tip** | [#476](https://github.com/nocodenn-cell/fastproduct/pull/476) |
| **Próxima capacidade** | [PROXIMA_FASE_POS_GATE.md](./PROXIMA_FASE_POS_GATE.md) |
| **Jinlong remoto** | Migrations **não** aplicadas nesta fase |

---

## 1. Stack de PRs — estado e ordem de merge

| PR | Título (resumo) | Base | Tip (HEAD) | Mergeable | CI observado | Conteúdo |
|----|-----------------|------|------------|-----------|--------------|----------|
| **#473** | Governança + mapa de domínios | `main` | `4c9021bf` | MERGEABLE / CLEAN | Required checks + gitleaks SUCCESS | Docs + rule + checklist + PR template |
| **#474** | Auditoria SSoT → NO-GO | `#473` | `93579573` | MERGEABLE / CLEAN | Vercel SUCCESS (checks leves) | Auditoria + inventário |
| **#475** | Saneamento fiscal / GO CONDICIONAL | `#474` | `0173ff44` | (stack) | — | `fiscal_marcar_cancelado`, stub removido, `criarCliente` removido, mitigações |
| **#476** | Remediação SSOT-001…004 + pré-merge | `#475` | `1292520e` | MERGEABLE / CLEAN | Vercel SUCCESS | Contratos + migrations `163000`…`171000` + provas |

### Dependências

```
main
 └── #473 governança
      └── #474 auditoria
           └── #475 saneamento fiscal / entity-ssot
                └── #476 remediação SSOT-001…004  ← tip contém TODOS os commits da stack
```

O tip de **#476** inclui linearmente os 18 commits desde `main` (governança → auditoria → saneamento → remediação). Não há divergência de conteúdo entre “só #476” e “soma dos quatro” no tip atual.

### Estratégia correta de merge (evitar duplicata / histórico inconsistente)

1. **Preferido (revisão incremental):** mergear na ordem **#473 → #474 → #475 → #476**, atualizando a base de cada filho após o merge do pai (GitHub “Update branch” / rebase da stack).
2. **Alternativa (um merge):** mergear **apenas #476** em `main` traz o conjunto completo — **desde que** #473–#475 sejam fechados como supersedidos **sem** re-mergear os mesmos commits.
3. **Proibido:** mergear #473 e depois cherry-pickar commits já presentes em #476; ou mergear #476 e depois tentar mergear #473/#474/#475 como se fossem deltas novos (gera conflito/histórico duplicado).
4. **Não mergear cegamente:** validar CI do tip; aplicar migrations no remoto Jinlong **só** com autorização humana e janela própria (fora deste documento).
5. Working trees locais das branches da stack estavam limpas no tip `1292520e` no momento do fechamento documental.

### Migrations da remediação (ordem real)

| Version | Arquivo | Tema |
|---------|---------|------|
| `20261007161220` | `fiscal_cancelado_ssot.sql` | Estado `cancelado` / RPC (#475) |
| `20261007163000` | `ssot_001_002_painel_ec_cache.sql` | Painel \(E(c)\); sync cache; COMMENT |
| `20261007163100` | `ssot_003_nfe_obrigacao_duplicata.sql` | Guard NF-e sem duplicata |
| `20261007163200` | `ssot_004_revoke_insert_documentos_fiscais.sql` | REVOKE INSERT authenticated |
| `20261007170000` | `ssot_002_mov_ar_ec_cache.sql` | Guards mov/AR por \(E(c)\) |
| `20261007171000` | `ssot_002_cancel_guard_antes_devolucao.sql` | Guard cancel **antes** de `devolucoes` |

Espelhadas em `backend/supabase/migrations/` (cadeia canônica de apply local).

### Documentação canônica do gate

| Doc | Papel |
|-----|--------|
| [REMEDIACAO_SSOT_001_004.md](./REMEDIACAO_SSOT_001_004.md) | Matriz GO + evidência |
| [SSOT_CAIXA_SALDO_CONTRATO.md](./SSOT_CAIXA_SALDO_CONTRATO.md) | Contrato caixa |
| [SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md](./SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md) | Contrato aquisição→AP |
| [MAPA_DOMINIOS_REGRAS_NEGOCIO.md](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) | Mapa atualizado pós-remediação |
| Artefatos pré-merge | `/opt/cursor/artifacts/ssot-premerge-*.log` (ambiente de validação) |

---

## 2. Invariantes canônicos pós-gate

| ID | Invariante | Fonte de verdade | Writers autorizados | Readers |
|----|------------|------------------|---------------------|---------|
| **SSOT-001** | KPI dinheiro PDV / `saldo_pdv` = soma \(E(c)\) dos caixas abertos | `internal.valor_sistema_dinheiro` / `calcular_valor_sistema_dinheiro_caixa` | RPCs cash/sales que materializam cache; **não** a UI | `financeiro_painel`, relatórios |
| **SSOT-002** | Decisões (sangria, aprovação, liquidação AR, cancel, fechamento) usam \(E(c)\); `caixas.saldo_atual` = **cache/projeção** | Mesma RPC \(E(c)\); materialização via `sincronizar_saldo_cache` | Triggers/RPCs listados nas migs `163000`/`170000`/`171000` | UI caixa (exibição) |
| **SSOT-003** | Obrigação financeira: OC → físico → **reconhecimento** → AP → liquidação. NF-e com valor econômico > 0 **sem** duplicatas ⇒ rejeita (`IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`). OC/remessa sem obrigação **não** criam AP fictícia | `confirmar_importacao_nfe` + docs aquisição | RPCs de confirmação NF-e; AP com `nfe_importacao_id` | Financeiro, estoque |
| **SSOT-004** | Enqueue fiscal **somente** RPC canônica (`fiscal_enfileirar_*`); INSERT direto `authenticated` em `documentos_fiscais_pendentes` **proibido** | Grants + RPC; worker `service_role` | RPCs fiscais / worker | UI fila fiscal |
| **SSOT-012** (saneamento #475) | Cancelamento fiscal = comando explícito; status Focus `cancelado` classificado | `fiscal_marcar_cancelado` / `fiscal_cancelar_documento` | Worker + RPC cancel | Timeline fiscal |

### Contratos consolidados

- Caixa: [SSOT_CAIXA_SALDO_CONTRATO.md](./SSOT_CAIXA_SALDO_CONTRATO.md) + ADR-009 / ADR-CAIXA-002.
- Aquisição: [SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md](./SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md).
- Entity SSoT UI: `.cursor/rules/entity-ssot.mdc` + `npm run check:entity-ssot`.
- Governança de feature: [CHECKLIST_FEATURE_DOMINIO.md](./CHECKLIST_FEATURE_DOMINIO.md).

### Testes que protegem os contratos

| Suite | O que protege | Status no tip |
|-------|---------------|---------------|
| `pdv-importados` vitest `tests/remediacao-ssot-001-004.matrix.test.ts` | Presença estrutural SSOT-001…004 | 27 passed (com `ssot-caixa-ec-reconstrucao`) |
| `pdv-importados` vitest `tests/ssot-caixa-ec-reconstrucao.test.ts` | Fórmula \(E(c)\) | passed |
| `npm run check:entity-ssot` | Boundary UI / stub fiscal / INSERT | OK |
| Deno `fiscal-worker` adapter + orchestration | Cancelado Focus + orquestração | 67 passed |
| Provas SQL pré-merge (Postgres local) | Fluxo caixa, grants, NF-e ± duplicata | PASS (`ssot-premerge-sql-*.log`) |
| **`npm run check:edge`** | Typecheck Deno edge (incl. fiscal-worker) | **NÃO EXECUTADO** |

### Pendência explícita — `check:edge`

> **`check:edge` não foi executado com sucesso** neste ambiente de validação pré-merge: o `deno.lock` do `fiscal-worker` está em **versão 5**, incompatível com o Deno disponível no PATH (`Unsupported lockfile version '5'`).

- **Não** marcar `check:edge` como aprovado.
- Remediação de ambiente (upgrade Deno **ou** regenerar lock compatível) = dívida operacional classificada em [PROXIMA_FASE_POS_GATE.md](./PROXIMA_FASE_POS_GATE.md) — **fora** do gate SSOT-001…004.

---

## 3. Dívidas que permaneceram fora do gate

Resumo; classificação detalhada na próxima fase:

| Tema | Nota |
|------|------|
| `FornecedorCombobox` | Mitigado (writer canônico); UI ainda no produto |
| Offline sem CR parcial | Documentar/portar — SSOT-007 |
| D-P3 colunas atacado vs tiers | SSOT-008 |
| Remessa vínculo textual | UX-03 residual |
| `check:edge` / Deno lock | Ambiente |
| Auditoria parcial em domínios | Inventário |
| Backup/restore piloto | Ops D0 — não é módulo de produto |
| Fechamento por forma de pagamento | Capacidade existente **não** construída (Onda 3) |
| Migrations no remoto Jinlong | Autorização humana |

---

## 4. O que este fechamento **não** autoriza

- Merge automático sem revisão humana.
- Aplicar migrations no projeto Supabase remoto Jinlong sem janela.
- Iniciar Importações / Contabilidade / Intelligence / Mobile / Demanda sem ADR + checklist.
- Tratar `check:edge` como verde.
- Alterar `calcular_valor_sistema_dinheiro_caixa` para incluir PIX/cartão (quebraria Gate 3 — ver Onda 3).
