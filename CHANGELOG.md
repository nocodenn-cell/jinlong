# Changelog — fastproduct / Jinlong PDV

Registro cronológico das decisões e mudanças com impacto em **produção, schema ou governança**.
Mudanças de código rotineiras ficam no histórico Git; aqui entra só o que altera o estado
operacional do produto ou a autoridade de uma decisão.

Ordem: mais recente primeiro. Datas em `AAAA-MM-DD`.

> **Escopo.** Este arquivo começa em 2026-08-09 (Go-Live). O histórico anterior está distribuído
> nos relatórios de fase em [`docs/`](docs/) e no [índice de documentação](docs/INDEX.md).
> Existe um changelog separado, de escopo restrito a contratos de RPC, em
> [`docs/contracts/v1/CHANGELOG.md`](docs/contracts/v1/CHANGELOG.md).

---

## 2026-08-27 — Consolidação do go-live do piloto (`e1327e62`)

**Decisão:** **GO**. `origin/main` = produção = `e1327e62312d53bb005e0614801b8725b485b2ee`.

Snapshot: [docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).
Próxima sprint (proposta): [docs/piloto-d0/PROXIMA_SPRINT.md](docs/piloto-d0/PROXIMA_SPRINT.md).

### Promovido nesta consolidação

- **#313** — kardex SSOT-04 em `devolver_ou_trocar_venda` (`20260821110000`)
- **#324** — recebimento aceita DRAFT; atacado ≥ varejo rejeitado no cadastro/CSV; troco só DINHEIRO (`20260824120000`)
- **#330** — opções locais no modal de produto; Playwright Chromium+WebKit; E2E 50m / heap 4GB

Já na linha (não desta fatia, mas no SHA): baseline dirty pós-save (`86743dac`), D0-01/D0-03 aplicados 24/08 (`9881c8c1`), fornecedor por loja.

### Não promovido / não é regressão

- Playwright completo vermelho (78 pass / 3 fail / 18 flaky) — flake/infra.
- #290 Dependabot — permanece aberta, pós-piloto.
- Fiscal real, WhatsApp, orçamentos — fora do D0.

## 2026-08-19 — Fase 6: gate financeiro reproduzível do zero (6/6)

**PR:** [#307](https://github.com/nocodenn-cell/fastproduct/pull/307) · **Commits:** `ef79bd33` (merge de `main`), `ee36bfd4` (correções)
**Relatório completo:** [docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md](docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md)

O gate financeiro não era reproduzível a partir do repositório: num banco reconstruído do zero
passava **1/6**. O `4/6` observado localmente vinha de dados residuais de execuções manuais antigas,
que nenhum arquivo versionado sabia recriar.

### Corrigido

- **GATES 12–23 restaurados** em `backend/scripts/financial-adversarial-gates.test.sql`. O commit
  `ddce245a` pretendia inserir 22 linhas e removeu 1412 (1900 → 509 linhas), apagando 12 gates
  — incluindo o **GATE 20** —, o `ROLLBACK;` final e o SELECT de sucesso. Sem o `ROLLBACK` a suíte
  commitava estado e envenenava `ap-payments-reconciliation` na execução seguinte.
- **`backend/supabase/seed.sql` criado.** `config.toml` apontava para ele desde sempre, mas o arquivo
  nunca existiu em branch algum. Idempotente (UUIDs fixos + `ON CONFLICT`), verificado com 3 aplicações.

### Schema

- **`20260814015032_harden_diagnostics_and_ap_idempotency` reabilitada.** Estava `_disabled_` por ter
  sido **aplicada à mão em produção** (`c3f58df3`, `35eb7e8d`) — o que tornava produção irreproduzível
  a partir do Git e deixava o banco local com a versão pré-fix de `registrar_pagamento_contas_pagar`.
- **🔒 `20260819000000_revoke_relatorio_consistencia_vendas_de_public` (nova) — furo de RLS em produção.**
  A `20260818000001` revogou a função apenas `FROM authenticated`; no PostgreSQL toda função nasce com
  `EXECUTE` para **PUBLIC**, então `authenticated` seguia executando por herança (`proacl` = `=X/postgres`).
  Função `SECURITY DEFINER` sem guarda de loja ⇒ GERENTE da loja B lia agregados da loja A.
  Detectado pelo GATE 9, que só voltou a rodar após a restauração acima.
- `verificacao-pos-apply.sql`: constante do ledger **304 → 307** (3 migrations novas, cada `+1` justificado).
- `database.types.ts` regenerado contra o schema corrigido.

### Validação — ensaio real, a partir do tree commitado

| Verificação | Antes | Depois |
|---|---|---|
| `test:financial` | 1/6 | **6/6** |
| `test:rls-scope` | 42/42 | **42/42** |
| `check:types-drift` | DRIFT | **OK** |
| `verificacao-pos-apply.sql` | 15/17 | **17/17**, 0 falhas |

### Pendente — não fechado nesta fase

- Lojas novas nascem **sem formas de pagamento** (confirmado: `Loja Teste RLS` tem `(NENHUMA)`).
- Hook `pre-commit` quebrado para **qualquer** commit do repo (eslint v10 × `.eslintrc.json`).
- **Auditoria do ledger de produção** contra `schema_migrations` — a `20260814015032` prova que já
  houve aplicação manual; não há garantia de que seja a única.

> ⚠️ **Janela crítica não recomendada** enquanto §8.3 e o staging separado não estiverem resolvidos.
> Ver [§9 do relatório](docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md).

---

## 2026-08-17 — Resolução de conflitos da PR #305 e convergência de branches

**Merge:** `82b03ace` — *"merge: resolve conflitos PR #305 — mantém versão sem link no GO_LIVE_CERTIFICATION_REPORT"*
**PR #305:** `fix(observability): redact sensitive Sentry payloads` (`5378cf27`)

### Alterado

- **Redação de payloads do Sentry** (PR #305): dados sensíveis deixam de ser enviados na telemetria
  de erros.
- **Conflitos resolvidos** em 54 arquivos. No `GO_LIVE_CERTIFICATION_REPORT.md`, manteve-se a versão
  sem link do lado da branch — o alvo não existia naquele momento.

### Convergência de schema — `venda_finance_context`

O merge fechou a dívida que o [ADR-012](docs/adr/ADR-012-aposentadoria-venda-finance-context.md)
havia registrado como remanescente:

| Migration | Antes do merge | Depois do merge |
|---|---|---|
| `20260808130200_24704_reapply_venda_finance_context_idempotent.sql` | presente em `origin/main` | **ausente em ambas as refs** |
| `20260810222702_retire_obsolete_venda_finance_context.sql` | só na branch | **tombstone oficial, única representação** |

**Nenhuma operação em produção foi executada** — a produção nunca teve os objetos.
Detalhamento em [`docs/RECONCILIACAO_venda_finance_context_2026-08-13.md`](docs/RECONCILIACAO_venda_finance_context_2026-08-13.md) §7.

### Reintroduzido pelo merge (sem efeito na decisão)

- `docs/READY_FOR_HUMAN_APPLY_venda_finance_context.md` — voltou ao repositório **já arquivado**,
  com cabeçalho `⛔ NÃO APLICAR`. Não reabre a decisão.
- `backend/supabase/migration-human-gates.json` — criado com `{"gates": []}`: **nenhum gate humano
  pendente**.

### Documentação

- `GO_LIVE_CERTIFICATION_REPORT.md`: P1-01 marcado como **encerrado**, com links para ADR-012 e para
  a reconciliação (ambos agora resolvem nesta branch).
- `docs/RECONCILIACAO_venda_finance_context_2026-08-13.md`: adicionados §7 (convergência pós-merge) e
  aviso `NÃO REAPLICAR MANUALMENTE` no topo; corrigidas afirmações superadas pelo merge; resolvida a
  numeração duplicada de seção.
- `CHANGELOG.md` (este arquivo) e seção de status do `README.md`: criados.

---

## 2026-08-13 — Aposentadoria de `venda_finance_context` formalizada

**Decisão:** a migration de reaplicação `20260808130200` é **aposentada**; a tombstone
`20260810222702_retire_obsolete_venda_finance_context.sql` é a **convergência oficial**.

**Ação exigida em produção: NENHUMA.** Classificação `NO PROD ACTION REQUIRED` — os objetos
(`venda_finance_context`, funções de sincronização e triggers `trg_finance_context_*`) já estavam
ausentes do catálogo de produção, verificado ao vivo em consulta somente leitura.

### ⛔ NÃO REAPLICAR MANUALMENTE

Qualquer procedimento de reaplicação humana para este item está **superseded**. A linha `252` do
ledger **não deve ser reparada** (`FASE_3_1` §4.1).

### Registros

- [ADR-012 — Aposentadoria do espelho `venda_finance_context`](docs/adr/ADR-012-aposentadoria-venda-finance-context.md) —
  supersede `FASE_3_1` (MANTER + idempotentizar), `FASE_3_2` e `FASE_3_RECONCILIACAO_SUPABASE_PLANO` §3.2.
- [Reconciliação 2026-08-13](docs/RECONCILIACAO_venda_finance_context_2026-08-13.md) — fonte única do item.
- [`docs/READY_FOR_HUMAN_APPLY_venda_finance_context.md`](docs/READY_FOR_HUMAN_APPLY_venda_finance_context.md) —
  rebaixado a **ARQUIVADO / NÃO APLICAR** na mesma data em que foi preparado.

**Decisor:** `nocodenn-cell` (dono do projeto) — commit original `17890230` de 2026-08-10.

### Também em 2026-08-13

- Auditoria contábil e de regras de negócio da **Issue #298**: veredito **NÃO CERTIFICADO** para a
  cadeia financeira completa (4 achados P0, 5 P1, 1 P2). Ver `GO_LIVE_CERTIFICATION_REPORT.md` §8.
- Aprovação das oito regras de negócio **DB-01…DB-08**, que passam a ser autoridade de execução da
  remediação financeira (§9.1 do mesmo relatório).

---

## 2026-08-09 — 🟢 Go-Live autorizado

Implantação do piloto **autorizada** para a loja **Matriz**
(`a0000001-0000-4000-8000-000000000001`), com `go_autorizado = true` registrado em
`/admin/implantacao` por DONO Demo.

| Evidência | Valor |
|---|---|
| SHA em produção | `2afa14ca3cc5c00ee8361d29a06934610350b7ac` |
| Deployment | `dpl_FXFHdqB6de5hZxgTSABuF2P9tUkq` |
| Host | `pdv-importados.vercel.app` |
| SSRA | ✅ Success — `deploymentId` da plataforma === `/api/health` |

### Trilha P0 de integração

| Passo | Conteúdo | Merge |
|---|---|---|
| 1 | UI/UX fechamento (#268) | #282 → `28b14b76` |
| 2 | Schema Aug/2026 + fiscal D-1–D-3 (#267) | #283 → `cfec6040` |
| 3 | Scope-guard v4 + claim espera (#281/#269) | #284 → `3369b055` |
| 3b | Hotfix 22 args + versões `schema_migrations` | #285 → `cb45e52f` |
| 4 | Redeploy + SSRA | produção + CI verde |
| 5 | UI/UX waves (#270–#280) | #286 → `2afa14ca` |

Certificação completa em [`GO_LIVE_CERTIFICATION_REPORT.md`](GO_LIVE_CERTIFICATION_REPORT.md).

> O veredito **NO-GO** de 2026-07-31 foi **superado** por este fechamento e está arquivado em
> `docs/archive/go-live-pre-2026-08-09/`. Não usá-lo como status atual.
