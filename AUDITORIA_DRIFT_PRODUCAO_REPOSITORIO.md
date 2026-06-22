# Auditoria de Drift — Produção × Repositório × Aplicação

> **Documento de trabalho — somente diagnóstico.** Nenhuma alteração foi feita em produção.
> Data: 2026-06-20 · Projeto Supabase: `jinlong` (`kbabmewnahysfvlybiak`, Postgres 17) · Repo: `nocodenn-cell/fastproduct`.

---

## 1. Objetivo

Mapear as divergências (drift) entre três fontes que deveriam estar em paridade:

1. **Banco de produção** (schema realmente aplicado).
2. **Migrations do repositório** (`backend/supabase/migrations/`).
3. **Schemas usados pela aplicação** (`pdv-importados/`).

Entregar, por divergência: **impacto, risco, prioridade e estratégia de correção** — sem tocar em produção.

## 2. Metodologia e escopo

- **100% read-only.** Produção consultada via `SELECT`/`EXPLAIN` (MCP Supabase) e catálogo `pg_catalog`/`information_schema`/`supabase_migrations.schema_migrations`.
- Repositório: leitura de `backend/supabase/migrations/*.sql` (170 arquivos, `001`…`242`).
- Aplicação: busca de uso real (`grep`) sobre `pdv-importados/`.
- **Nenhuma migration foi criada/aplicada; nenhum objeto foi alterado.**

## 3. Resumo executivo

| Severidade | Achado |
|---|---|
| 🔴 **P0** | **Versionamento de migrations divergente** entre produção e repositório (numeração colidente, conteúdo diferente para o mesmo número, migrations só-produção e só-repo). Raiz de todo o resto. |
| 🟡 **P1** | `descontos_venda` em produção **não tem** `operador_id`/`aplicado_em` (repo migration `113`). |
| 🟡 **P1** | **Fiado**: produção aplicou `245_remover_venda_fiado`, mas a aplicação **ainda referencia** FIADO/`contas_receber`. Necessita verificação funcional. |
| 🟢 **P2** | `system_alerts` (repo `236`) **ausente** em produção. |
| 🟢 **P3** | `venda_finance_context` (repo `235`) **ausente** em produção — mas o app **não o consulta** em runtime. |

> A Auditoria Visual (Fase 2 · item 1) já é **resiliente** a estes drifts (ignora fontes ausentes) — nenhum deles a quebra.

---

## 4. Achado-raiz (P0): versionamento de migrations divergente

### Evidência

| Métrica | Produção | Repositório |
|---|---|---|
| Migrations registradas | **172** (`supabase_migrations.schema_migrations`) | **170** arquivos `.sql` |
| Formato das versões | **144 numéricas** + **28 timestamp** (`2026…`) | numérico sequencial `001`…`242` |

**Colisão de numeração com conteúdo diferente** (mesmo número, migrations distintas):

| Número | Produção (nome aplicado) | Repositório (arquivo) |
|---|---|---|
| `113` | `113_rls_audit_fixes` | `113_descontos_venda_auditoria_operador.sql` |
| `114` | `114_pdv_config_loja_backfill` | (outro conteúdo no repo) |

**Migrations só em produção** (não existem no repo — produção "à frente"):
`245_remover_venda_fiado`, `243_finalizar_venda_v4_sync_producao`, `244_consistencia_vendas_auditoria`, `264_dashboard_venda_eventos_kpis`, vários `block_v2_legacy_overloads…`, `stub_v3_full_overload…` etc.

**Migrations no repo não aplicadas em produção** (repo "à frente"):
`235_venda_finance_context_mirror`, `236_system_alerts_log_leve`, e o **conteúdo** da `113` do repo (auditoria de operador em descontos).

### Impacto
- Impossível garantir paridade prod↔repo: o número de uma migration **não identifica** o mesmo conteúdo nos dois lados.
- Deploys futuros via `supabase db push` podem **conflitar**, ser ignorados (número "já aplicado") ou **sobrescrever** objetos.
- Onboarding de novo ambiente a partir do repo **não reproduz** produção.

### Risco: **ALTO** · Prioridade: **P0**

---

## 5. Divergências de schema confirmadas

### 5.1 `descontos_venda` sem `operador_id` / `aplicado_em` (P1)

- **Produção:** colunas = `venda_id, gerente_id, desconto_percentual, desconto_valor`.
- **Repo espera (migration 113):** + `operador_id uuid` e `aplicado_em timestamptz`.
- **App:** a Auditoria Visual tenta ler `aplicado_em` (ignora a fonte por enquanto, via resiliência).
- **Impacto:** sem `aplicado_em` não há timestamp → descontos **não entram na timeline**; auditoria de "quem finalizou" incompleta (compliance).
- **Risco:** MÉDIO · **Prioridade:** P1.

### 5.2 Fiado removido em produção, ainda referenciado no app (P1)

- **Produção:** aplicou `245_remover_venda_fiado`.
- **App:** `FIADO`/`contas_receber` ainda referenciados em `app/gerente/clientes/actions.ts`, `app/gerente/financeiro/actions.ts`, `lib/gerente/financeiroTitulosServer.ts`.
- **Impacto:** possível incompatibilidade (UI/ação oferece fiado que o backend de venda não aceita mais). **Necessita verificação funcional** do escopo exato da remoção (forma de pagamento na venda vs. gestão de títulos existentes).
- **Risco:** MÉDIO · **Prioridade:** P1.

### 5.3 `system_alerts` ausente (P2)

- **Produção:** tabela **não existe** (repo `236` não aplicada).
- **Impacto:** observabilidade de anomalias (margem negativa, preço fora do padrão, estoque inconsistente) inexistente; Auditoria Visual não exibe alertas (degrada graciosamente).
- **Risco:** BAIXO (feature opcional, não-bloqueante) · **Prioridade:** P2.

### 5.4 `venda_finance_context` ausente (P3)

- **Produção:** tabela **não existe** (repo `235` não aplicada).
- **App:** referenciada **apenas** em `lib/supabase/database.types.ts` (tipos gerados) — **não consultada em runtime**.
- **Impacto:** baixo hoje; vira dívida se algum fluxo futuro depender do espelho financeiro.
- **Risco:** BAIXO · **Prioridade:** P3.

---

## 6. O que está alinhado (sem drift)

Verificado como **presente e compatível** entre produção, repo e app:

- Tabelas: `produtos` (todos os campos fiscais `ncm/cfop_produto/csosn/cest/cst_pis/cst_cofins` + `status_publicacao` + `preco_atacado/quantidade_gatilho_atacado/permitir_abaixo_custo`), `venda_eventos`, `vendas_canceladas_auditoria`, `movimentos_estoque_log`, `precos_atacado`, `contas_receber`, `ordens_compra`.
- `movimentos_estoque_log` usa **`usuario_id`** em **produção e repo** (índice `idx_movimentos_estoque_log_usuario_id`, migration 223) — **não é drift**. *(Correção de registro: um bug do código da Auditoria usava `gerente_id`, baseado em resumo incorreto de exploração; já corrigido para `usuario_id`.)*
- Função `finalizar_venda_transacional_canonica_v4` **presente** (alinhada à troca v3→v4 recém-mergeada no app). Convivem ainda overloads legados de `v2`/`v3` (marcados como bloqueados por migrations `block_v2_legacy_overloads…`).

---

## 7. Riscos consolidados

1. **Deploy de schema não-determinístico (P0):** sem fonte única de verdade, qualquer `db push` é arriscado.
2. **Compliance de auditoria parcial (P1):** descontos sem operador/timestamp.
3. **Inconsistência de produto (P1):** fiado no app vs. removido em produção.
4. **Dívida de features (P2/P3):** alertas e espelho financeiro existem no repo mas não em produção.

---

## 8. Estratégia de correção (proposta — **sem executar**)

Princípio: **reconciliar primeiro, depois evoluir.** Não tentar "reaplicar 235/236/113" cegamente — os números colidem com a história de produção.

**Fase A — Estabelecer fonte única de verdade (P0)**
1. Snapshot do schema real de produção: `supabase db pull` (gera migration baseline a partir do estado atual).
2. Adotar a baseline como **ponto zero** no repo (squash do histórico divergente), preservando os `.sql` antigos em `migrations/_archive/` para referência.
3. Migrar a numeração futura para **timestamp** (padrão Supabase) — elimina colisões.

**Fase B — Backport do que só existe em produção (P0)**
4. Trazer para o repo as migrations só-produção (`243/244/245/264/blocks…`) como parte da baseline, para o repo refletir a realidade.

**Fase C — Reaplicar deltas do repo que faltam em produção (P1/P2/P3)**
5. Reautorar como **novas migrations timestamp** (não reusar 113/235/236):
   - `descontos_venda`: `ADD COLUMN operador_id, aplicado_em` (P1).
   - `system_alerts` + triggers (P2).
   - `venda_finance_context` (P3) — só se algum fluxo passar a depender dele.
6. Decisão de produto sobre **fiado** (P1): alinhar app↔produção (remover do app ou restaurar em produção).

**Fase D — Prevenção (P0)**
7. **Gate de CI:** `supabase db diff` deve estar **vazio** antes de merge que toque schema.
8. Proibir hotfix direto em produção sem migration correspondente no repo.

> Todas as fases acima tocam o núcleo/banco e exigem **decisão e janela própria** — fora do escopo desta auditoria, que é só diagnóstico.

---

## 9. Próximo passo

Com este diagnóstico, decidir:
- **(a)** priorizar a **reconciliação de migrations (P0)** antes de seguir a Fase 2; ou
- **(b)** seguir com o próximo item da Fase 2 e tratar o drift em paralelo, sabendo que features que dependem de `113/235/236` ficam parcialmente inertes até a reconciliação.

A Auditoria Visual já está em produção e **não é bloqueada** por nenhum destes drifts.
