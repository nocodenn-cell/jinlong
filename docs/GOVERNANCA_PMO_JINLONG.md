# Governança Jinlong ERP — Plano Único de Execução (PMO Técnico)

> **Data:** 2026-07-08 · **Escopo:** monorepo `nocodenn-cell/fastproduct` (branch `main` @ `2a63d9d`)
> **Natureza:** documento de governança — **nenhum código foi alterado** nesta entrega.
> **Fontes de especificação:** a especificação funcional não existe como documento único; ela está distribuída em `docs/ROADMAP.md`, `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md`, `docs/ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md`, `docs/AUTHORIZATION_MATRIX.md`, `docs/PRODUCAO_GO_NO_GO.md`, `docs/DONE_DEFINITION_PILOTO.md`, `docs/BACKLOG_TECNICO.md` e nas auditorias da raiz (`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`, `AUDITORIA_PAINEL_ADMIN.md`). Este documento consolida essas fontes numa visão única. A criação de uma especificação funcional canônica é, em si, uma recomendação (ver §7).

---

## 1. Matriz de Cobertura

Legenda: ✅ Implementado · 🟡 Parcial · 🔴 Não iniciado.

### 1.1 PDV (Caixa web `pdv-importados` + desktop `pdv-local`)

> **Adendo de evidências (2026-07-08, verificação em código):** duas linhas abaixo foram corrigidas após inspeção direta do código-fonte, pois os documentos de roadmap/risco estavam desatualizados: (a) o **pipeline serial do bip já está integrado** ao caixa web — `useCaixaScanPipeline` consumido em `app/caixa/CaixaPageClient.tsx:345`, com máquina de estados, abort cooperativo e specs em `shared-core/src/pdv/` (`scan-pipeline-golden.spec.ts`, `scan-pipeline-invariants.spec.ts`, `scan-pipeline-transitions.spec.ts`) e `app/caixa/scan-pipeline/`; (b) a **paridade de `variantesChaveLeitura` já foi resolvida** — fonte única em `shared-core/src/caixa/variantesChaveLeitura.ts`, importada por `pdv-local/src/catalogoLookup.ts` (via `@core`) e reexportada em `pdv-importados/core/caixa/`. Permanecem pendentes: sign-off do ADR-PDV-001 (status “Proposto”), matriz offline F1 e validação de burst/telemetria. O plano executivo (`PLANO_EXECUTIVO_EXECUCAO_JINLONG.md`) já reflete o escopo corrigido.

| Requisito | Status | Evidência |
|---|---|---|
| Venda com carrinho, varejo/atacado, finalização transacional idempotente | ✅ | RPC canônica v4 (`243_finalizar_venda_canonica_v4_captura.sql`), idempotência (`061`, `20260419013345_fix_venda_idempotency_key.sql`), overloads legados v2/v3 bloqueados (`20260619…`/`20260620…block_v2…`); `app/caixa/` |
| Split de pagamento (multi-forma, 2–3 parcelas) | ✅ | Migrations `051`–`053`; E2E `e2e/caixa-venda-multi-pagamento.spec.ts` |
| Desconto de gerente com token e rate-limit | ✅ | `018`, `021`–`023`, `122_limite_desconto_manual_itens.sql`; Edge `validar-gerente` |
| Cancelamento de venda com estorno de estoque e auditoria | ✅ | `050_cancelar_venda_transacional.sql`, `059_cancelar_venda_split_e_auditoria_nao_dinheiro.sql` |
| Caixa: abertura, sangria/suprimento com aprovação, fechamento cego e atômico | ✅ | `045`–`047`, `049`, `054_pdv_config_blind_closure.sql`, `207`/`227_fechar_caixa_*_atomico*.sql`, `230_caixa_status_fechamento.sql`; E2E `caixa-fluxos-criticos.spec.ts` |
| Anti-fraude de preço (recálculo autoritativo no servidor) | ✅ | `123_revalidar_preco_commit_v3_e_revoke_v2.sql`, `234`/`250_calcular_preco_produto_*.sql`, `254_pricing_version_venda_scope_guard.sql`, `249_pricing_version_governance.sql` |
| Telemetria de scan no caixa | ✅ | `095`–`097_caixa_scan_telemetry_*.sql`; `app/api/caixa/scan-telemetry/` |
| Pipeline do bip com fila/mutex, política de burst e ACK perceptivo | 🟡 | **Implementação integrada** (`useCaixaScanPipeline` em `CaixaPageClient.tsx`; `shared-core/src/pdv/scan-pipeline*`; `docs/CONTRATO_PIPELINE_BIP.md`, `docs/SCAN_PIPELINE_STATE_MACHINE.md`); pendentes: sign-off do ADR (`docs/adr/ADR-PDV-centro-de-gravidade.md` em **Proposto**), matriz offline F1 e validação de burst em operação |
| Venda em Espera (parked sale persistida no banco) | 🔴 | Especificada em `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` §1; nenhuma ocorrência de `em_espera` em app ou migrations |
| PDV desktop local-first (SQLite + outbox + sync HMAC) | ✅ | `pdv-local/` (Tauri 2 + Vite + SQLite), Edge `sync-outbox`, anti-replay HMAC/nonce (`024`), retry/backoff/DLQ com UI de reprocesso (ROADMAP médio prazo `[x]`) |
| Paridade de leitura de código de barras web × desktop | ✅ | Fonte única `shared-core/src/caixa/variantesChaveLeitura.ts` importada por `pdv-local/src/catalogoLookup.ts` e reexportada por `pdv-importados/core/caixa/` (divergência apontada em `relatorio-risco-20260416` **resolvida**) |
| Matriz offline/degradação web × desktop | 🔴 | Fase F1 do roadmap de invariantes — arquivo `docs/MATRIZ_OFFLINE_PDV.md` não existe |
| Auto-update do app Tauri | 🔴 | `docs/ROADMAP.md` longo prazo `[ ]` |

### 1.2 Cadastro de Produtos

| Requisito | Status | Evidência |
|---|---|---|
| CRUD de produto com filtros avançados e paginação server-side | ✅ | RPC `086_rpc_list_produtos_gerente_filtrados.sql`, índices `085`, `208_indices_busca_produto_trgm.sql`; `app/admin/catalogo/` + `app/gerente/produtos/` |
| Marcas, imagens (Storage), tags, categorias | ✅ | `083`, `084`, `088_produto_imagens_storage_bucket.sql`, `106_categorias_ativo.sql` |
| Preço atacado por faixas (tiers) | ✅ | `033`, `076`, `077_precos_atacado_tiers_e_rpc.sql` |
| Guarda de margem negativa no cadastro | ✅ | `124_guard_margem_negativa_cadastro_precos.sql`, `125_guard_margem_produtos_catalogo.sql` |
| Status de publicação / rascunho de produto | ✅ | `232_produtos_status_publicacao.sql`; PR #132 (“rascunho de produto publicável”) |
| Unicidade de código por loja | ✅ | `102_produtos_unique_codigo_loja.sql` |
| Campos fiscais no produto (NCM/CFOP/CSOSN/CEST/CST) | ✅ | `210_fiscal_campos_produto.sql`; confirmado em produção (`AUDITORIA_DRIFT` §6) |
| UX do cadastro (fluxo rápido, menos erro) — Fase 2 item 3 | 🟡 | Plano em `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` §3; `docs/PLANO_CADASTRO_PRODUTO.md`; execução não evidenciada como concluída |

### 1.3 Estoque

| Requisito | Status | Evidência |
|---|---|---|
| Baixa atômica/idempotente anti-oversell | ✅ | `007`, `016_estoque_atomic_lock.sql`; caminho canônico `decrementar_estoque_seguro` (`029`, `070`, `071`) |
| Estoque por loja (multi-loja base) | ✅ | `032_lojas_estoque_por_loja.sql`, `036_loja_filial_demo.sql` |
| Transferência entre lojas segura e idempotente | ✅ | `034`, `082_transferencia_segura_idempotente.sql`, `094`; E2E `gerente-transferencias.spec.ts` |
| Ajuste manual com trilha no kardex | ✅ | `063_ajuste_manual_estoque_kardex.sql` |
| Kardex unificado (leitura) e imutabilidade | ✅ | `060_v_kardex_unificado.sql`, `127_kardex_vendas_imutavel.sql`; Sheet Kardex em `/admin/estoque` (`AUDITORIA_PAINEL_ADMIN` §3) |
| Compras: ordens de compra e recebimento | ✅ | `109_ordens_compra.sql`, `110_receber_ordem_compra.sql`; rotas `gerente/compras`, `admin/estoque/recebimento` |
| Importação de NF-e de compra (com draft) | ✅ | `075_importacao_nfe_compra.sql`, `233_import_nfe_status_draft.sql`; rota `admin/estoque/importar-nfe` |
| Impressão de etiquetas | ✅ | `app/gerente/estoque/imprimir-etiquetas/` |
| Devolução/troca fora do fluxo `cancelar_venda` (rotina única) | 🟡 | `048_devolucoes.sql` existe, mas `docs/BACKLOG_TECNICO.md` item 3 registra que ajuste manual/troca/devolução pós-venda ainda não passam por RPC única — risco de buraco no kardex |
| Kardex avançado (painel/export agregado, materialized view) | 🔴 | `docs/BACKLOG_TECNICO.md` item 1 |

### 1.4 Financeiro

| Requisito | Status | Evidência |
|---|---|---|
| Movimentações de caixa transacionais + aprovação por token | ✅ | `045`, `046`, `119_realtime_movimentacoes_caixa.sql` |
| Comissões por operador (cálculo, backfill, pagamento) | ✅ | `103_comissoes.sql`, `214`/`215`; rota `/admin/comissoes` |
| Contas a pagar (NF-e, RPC de pagamento) | ✅ | `104`, `108_contas_pagar_schema_e_rpc_pagamento.sql`; `gerente/financeiro/contas-pagar` |
| Contas a receber (títulos, liquidação, KPIs) | ✅ | `contas_receber` + `registrar_liquidacao_receber` (`AUTHORIZATION_MATRIX`); `/admin/financeiro`; `lib/gerente/financeiroTitulosServer.ts` |
| Categorias financeiras | ✅ | `107_categorias_financeiras.sql`; `/admin/categorias-financeiras` |
| Remoção de FIADO como forma de pagamento (decisão de produto) | 🟡 | Migration `20260620222629_245_remover_venda_fiado.sql` no repo e aplicada em produção; código de venda sem `FIADO`, porém `contas_receber` segue referenciada em `gerente/financeiro/actions.ts`, `gerente/clientes/actions.ts` — a **verificação funcional** pedida em `AUDITORIA_DRIFT` §5.2 não está registrada como feita |
| Espelho financeiro da venda (`venda_finance_context`) | 🟡 | `252_venda_finance_context_mirror.sql` no repo; **ausente em produção** (`AUDITORIA_DRIFT` §5.4) |
| Conciliação bancária / TEF / PIX integrado | 🔴 | Sem evidência em código, migrations ou docs (citado apenas como linha da matriz offline F1) |

### 1.5 Fiscal

| Requisito | Status | Evidência |
|---|---|---|
| Fila fiscal + worker (claim, state machine, backoff, DLQ, timeline, correlation id) | ✅ | `035`, `037`, `062`, `065`, `066`, `090`–`093`, `098`, `099`; Edge `fiscal-worker`; cron `20260515000000_fiscal_worker_cron.sql` + `.github/workflows/fiscal-cron.yml` |
| Enfileiramento pós-venda (web e pós-sync desktop, por flag) | ✅ | `docs/ROADMAP.md` (“Fiscal — base técnica”); `AUTO_ENQUEUE_FISCAL_ON_SALE`, `069_fiscal_enqueue_service_role_sync_outbox.sql` |
| Cadastro fiscal de loja/PDV e campos fiscais de produto | ✅ | `209_fiscal_campos_loja_pdvconfig.sql`, `210_fiscal_campos_produto.sql`, `205_force_com_nf.sql` |
| Painel gerencial da fila fiscal | ✅ | `/gerente/financeiro` + `/gerente/financeiro/documento` (`docs/ROADMAP.md`) |
| **Emissão NFC-e/NF-e real (provedor Focus)** | 🔴 | `docs/ROADMAP.md` curto prazo `[ ]`; `docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md` com pré-requisitos (contrato, token, cadastro do emitente) **não marcados**; operação atual em modo `mock`/stub |

### 1.6 Auditoria

| Requisito | Status | Evidência |
|---|---|---|
| Ledger de eventos de venda (concluída/cancelada) | ✅ | `228_venda_eventos_ledger.sql`, `229`, `231`; `244_consistencia_vendas_auditoria.sql` |
| Auditoria de cancelamentos (motivo, operador, estorno) | ✅ | `059`; tabela `vendas_canceladas_auditoria` (confirmada em produção — `AUDITORIA_DRIFT` §6) |
| Log de movimentos de estoque (kardex auditável) | ✅ | `movimentos_estoque_log` + `063`, `127` |
| Auditoria Visual (timeline unificada `/admin/auditoria`) | ✅ | `app/admin/auditoria/`; `AUDITORIA_DRIFT` §9 (“já está em produção”); plano em `PLANO_FASE_2` §2 |
| Auditoria de descontos (operador + timestamp) | 🟡 | Repo tem `113_descontos_venda_auditoria_operador.sql`, mas **produção não tem** `operador_id`/`aplicado_em` (`AUDITORIA_DRIFT` §5.1 — colisão de numeração com a `113` de produção) |
| Alertas de sistema (margem negativa, preço fora do padrão) | 🟡 | `236_system_alerts_log_leve.sql`/`237` no repo; **tabela ausente em produção** (`AUDITORIA_DRIFT` §5.3) |
| Imutabilidade de vendas/caixa fechados | ✅ | `206_vendas_caixa_imutabilidade_trigger.sql` |

### 1.7 Permissões / Segurança

| Requisito | Status | Evidência |
|---|---|---|
| Perfis OPERADOR/GERENTE/DONO/ADMIN com RLS por loja | ✅ | `docs/AUTHORIZATION_MATRIX.md`; migrations `041`–`044`, `057`, `068`, `094`, `112`, `217`, `226`, `251`, `255` |
| Middleware/policy central de rotas (sem lógica inline) | ✅ | `pdv-importados/middleware.ts` → `lib/admin/policy/adminPolicy.ts` + `sessionConsistency` |
| Hardening de RPCs (search_path, SECURITY DEFINER, revokes anon/public) | ✅ | `015`, `115`, `218`–`221`, `224` |
| Anti-replay do sync desktop (HMAC + nonce) | ✅ | `024_sync_outbox_hmac_nonce_replay.sql` |
| Auditoria RLS policy-by-policy + pentest interno curto (P2) | 🔴 | `docs/P2_GOVERNANCA_RLS_E_PENTEST.md` — checklist §3 com todos os itens `[ ]`; sem evidências anexadas |
| Hardening multi-loja de `produtos` (SELECT hoje é global) | 🟡 | `AUTHORIZATION_MATRIX` linha `produtos`: “avaliar hardening multi-loja futuro” |
| `recalcular_saldo_caixa` sem checagem de perfil na função | 🟡 | `AUTHORIZATION_MATRIX`: “hardening recomendado” |
| LGPD (clientes) | ✅ | `111_lgpd_clientes_compliance.sql`; rotas `/termos`, `/privacidade`; `docs/TERMOS_E_PRIVACIDADE.md` |

### 1.8 Relatórios / Dashboard

| Requisito | Status | Evidência |
|---|---|---|
| Relatórios por período com timezone configurável | ✅ | `011`–`013`; `/gerente/relatorios` e `/admin/relatorios` |
| Resumo executivo, margem por venda, curva ABC, previsão/cobertura de estoque | ✅ | `064`, `238`–`242` |
| Relatório “sem giro” e relatório de estoque | ✅ | `app/gerente/relatorios/sem-giro/`, `.../estoque/` |
| Dashboard gerente (KPIs, série horária, top produto, comparativo semana) | ✅ | `078`–`080`, `100`, `225`, `20260618161315_264_dashboard_venda_eventos_kpis.sql` |
| Export CSV nas telas do gerente | ✅ | `docs/ROADMAP.md` longo prazo `[x]` |
| Painéis a partir de `system_alerts` em produção | 🔴 | Bloqueado pelo drift (tabela ausente em produção) |

### 1.9 Plataforma / Qualidade (transversal)

| Requisito | Status | Evidência |
|---|---|---|
| CI: lint + typecheck + unit + build + deploy Vercel + SSRA | ✅ | `.github/workflows/ci-pdv-importados.yml`, `ci-backend-supabase.yml`, `ci-pdv-local.yml`, `secret-scan.yml`; `docs/PRODUCAO_GO_NO_GO.md` |
| Testes unitários (Vitest) | ✅ | 83 arquivos `*.test.*`/`*.spec.*` em `pdv-importados`, 9 em `pdv-local` |
| E2E crítico (venda, split, sangria, fechar, sync, gerente) | 🟡 | 12 specs Playwright em `pdv-importados/e2e/`; **faltam fluxos mutadores do gerente** — cancelar venda, ajuste de estoque (`BACKLOG_TECNICO` item 4) |
| i18n PT + 中文 (zh-HK removido) | ✅ | `072`/`074_remove_zh*`; smoke manual 360/QQ **pendente** (`docs/SMOKE_BROWSER_CHINES_360_QQ.md`) |
| Acessibilidade WCAG 2.1 (Fase 3.1) | 🟡 | PR #134 mergeado (`2a63d9d`); Fase 3.2 (axe-core, aria-live, testes com leitores de tela) pendente (`FASE_3_EXECUTIVE_SUMMARY.md`) |
| Feature flags | ✅ | `073_feature_flags.sql`, `217`; rota `gerente/features` |

---

## 2. Gap Analysis (o que falta, por módulo)

**PDV**
1. Assinar o ADR de centro de gravidade (F0) — hoje só “Proposto”.
2. Matriz offline web × desktop linha a linha (F1) — documento não existe.
3. Validar o pipeline do bip em operação (burst “sábado simulado” + baseline de telemetria p95) — a implementação serial já está integrada (ver adendo §1.1).
4. Decisão de preço no caminho perceptivo do bip (F4).
5. Venda em Espera (Fase 2 item 1) — tabela, RPCs e UI inexistentes.
6. Auto-update Tauri (backlog).

**Cadastro de Produtos**
1. Executar as melhorias de UX do cadastro (Fase 2 item 3 / `PLANO_CADASTRO_PRODUTO.md`).
2. Gestão visual de faixas de atacado (Fase 2 item 4).

**Estoque**
1. Rotina única (RPC) para devolução/troca/ajuste pós-venda fora do `cancelar_venda`, fechando o kardex (BACKLOG item 3).
2. Kardex avançado: export agregado no gerente + estratégia de refresh/materialized view (BACKLOG item 1).

**Financeiro**
1. Verificação funcional do pós-remoção do FIADO (UI/actions de `contas_receber` × backend) — pendência da `AUDITORIA_DRIFT` §5.2.
2. Aplicar `venda_finance_context` em produção **ou** descartar formalmente (hoje só tipos gerados).
3. Conciliação/TEF/PIX integrado: sem escopo definido — precisa de decisão de produto antes de virar backlog técnico.

**Fiscal**
1. Ativação real Focus (contrato, token, cadastro do emitente, janela D-1→H+2) — `CHECKLIST_ATIVACAO_FOCUS_1_DIA.md` integral.
2. Decisão registrada `mock` vs `http` para demo/piloto (`DONE_DEFINITION_PILOTO` §4).

**Auditoria**
1. Reaplicar em produção (como novas migrations timestamp) o conteúdo da `113` do repo: `descontos_venda.operador_id/aplicado_em`.
2. Aplicar `system_alerts` em produção e expor na timeline.

**Permissões**
1. Fechar P2: auditoria RLS policy-by-policy + pentest interno curto com evidências (`P2_GOVERNANCA_RLS_E_PENTEST.md`).
2. Hardening: `recalcular_saldo_caixa` (perfil na função) e avaliação multi-loja de `produtos.SELECT`.

**Relatórios**
1. E2E dos fluxos mutadores do gerente (cancelar venda, ajuste de estoque).
2. Painéis dependentes de `system_alerts` (pós-drift).

**Transversal**
1. Reconciliação de migrations produção × repositório (baseline + numeração timestamp + gate `db diff` no CI) — Fases A–D da `AUDITORIA_DRIFT` §8. O repo já contém backports timestamp (`20260618…113_rls_audit_fixes` etc.), mas a numeração segue dual (sequencial `001`–`255` com lacunas `128`–`204`, `247`–`248` + timestamps) e o gate de CI não existe.
2. Consolidação `/admin/*` × `/gerente/*`: hoje coexistem duas superfícies (12 rotas em `/admin`, ~20 em `/gerente`); `ADMIN_PANEL_GUIDE.md` cita rotas (`/admin/compras`, `/admin/contas-pagar`) que não existem no código — documentação divergente.
3. Smoke browsers chineses (360/QQ) com evidência anexada.
4. Fase 3.2 de acessibilidade (testes automatizados axe-core + aria-live).

---

## 3. Priorização

| Prioridade | Item | Módulo |
|---|---|---|
| **P0 — bloqueia operação** | Reconciliação de migrations prod × repo + gate `supabase db diff` no CI | Transversal |
| **P0** | Trilha P0 operacional T1–T12 executada e marcada no ambiente do cliente (migrations sem lacuna, `verify_p0_producao.sql`, Edge + secrets, teste §4/§4b) | Transversal |
| **P0** | Verificação funcional pós-remoção FIADO (venda × títulos) | Financeiro |
| **P0** (condicional: cliente exige NFC-e) | Ativação fiscal real Focus | Fiscal |
| **P1 — MVP** | `descontos_venda.operador_id/aplicado_em` em produção (compliance de auditoria) | Auditoria |
| **P1** | Fechamento P2 de segurança (RLS policy-by-policy + pentest curto) | Permissões |
| **P1** | Invariantes do bip: F0 (sign-off do ADR) + validação de burst/telemetria da implementação já integrada | PDV |
| **P1** | E2E mutadores do gerente (cancelar venda, ajuste estoque) | Relatórios/QA |
| **P1** | Smoke 360/QQ com evidência | Transversal |
| **P1** | Matriz offline F1 (documentação de degradação) | PDV |
| **P2 — melhoria importante** | Venda em Espera (Fase 2 item 1) | PDV |
| **P2** | `system_alerts` em produção + timeline | Auditoria |
| **P2** | Rotina única de devolução/troca (kardex fechado) | Estoque |
| **P2** | UX cadastro de produto + faixas de atacado visuais (Fase 2 itens 3–4) | Produtos |
| **P2** | Consolidação `/admin` × `/gerente` + atualização do `ADMIN_PANEL_GUIDE.md` | Transversal |
| **P2** | Arredondamento ABNT unificado fora do motor de preço (BACKLOG item 2) | PDV/Financeiro |
| **P3+ — backlog** | Kardex avançado (export/materialized view) | Estoque |
| **P3+** | `venda_finance_context` (aplicar ou descartar) | Financeiro |
| **P3+** | Auto-update Tauri; métricas/observabilidade desktop | PDV |
| **P3+** | Multi-loja avançado (filiais além do modelo atual) | Transversal |
| **P3+** | Fase 3.2 acessibilidade; F4 preço no caminho do bip | Transversal/PDV |
| **P3+** | Conciliação bancária / TEF / PIX integrado (requer decisão de produto) | Financeiro |

---

## 4. Grafo de Dependências

```
[A] Reconciliação migrations (P0)
 ├──> [B] descontos_venda auditoria em prod (P1)
 ├──> [C] system_alerts em prod (P2) ──> [C2] painéis/alertas na timeline
 ├──> [D] venda_finance_context (P3)
 └──> [E] Trilha P0 operacional T1–T12 (P0)
        ├──> [F] Verificação funcional FIADO (P0)
        ├──> [G] Fechamento P2 segurança (P1)  ──> [H] Go-live piloto
        └──> [I] Ativação fiscal Focus (P0*)    ──> [H]

[J] F0 ADR centro de gravidade (P1)
 └──> [K] F1 matriz offline (P1)
       └──> [L] F2 contrato do bip (P1)
             └──> [M] F3 mutex/fila no caixa web (P1)
                   └──> [N] F4 preço no caminho do bip (P3)

[O] E2E mutadores gerente (P1) ── independente; reforça [H]
[P] Venda em Espera (P2) ── depende só do núcleo já validado; após [M] de preferência
[Q] Devolução/troca RPC única (P2) ── independente de [A]–[N]
[R] Consolidação /admin × /gerente (P2) ── independente; antes de novas telas
```

Leitura: **[A] é a raiz** — enquanto produção e repositório divergirem, qualquer `db push` é não-determinístico (`AUDITORIA_DRIFT` §7.1), o que contamina [B], [C], [I] e o próprio go-live [H]. A trilha de invariantes do PDV ([J]→[M]) é paralela e não depende de banco.

---

## 5. Roadmap Executivo (Sprints)

### Sprint 1 — “Fonte única de verdade” (banco + release)
- **Objetivo:** eliminar o drift prod × repo e deixar o pipeline de schema determinístico.
- **Entregas:** baseline via `supabase db pull`; arquivamento dos `.sql` legados em `migrations/_archive/`; numeração futura 100% timestamp; backport das migrations só-produção; reautoria de `113` (descontos) como migration nova; gate de CI `supabase db diff` vazio; proibição documentada de hotfix direto em produção.
- **Critérios de aceite:** `npx supabase migration list` sem lacunas nos ambientes; `verify_p0_producao.sql` verde; CI falha se houver diff de schema; `descontos_venda` com `operador_id`/`aplicado_em` em produção e descontos aparecendo na timeline de auditoria.
- **Riscos:** janela de manutenção no banco; colisão de numeração exige cuidado manual (não reaplicar `113/235/236` cegamente — `AUDITORIA_DRIFT` §8).
- **Dependências:** acesso ao projeto Supabase de produção; decisão de janela.
- **Complexidade:** **Alta** (crítica em risco, média em volume de código).

### Sprint 2 — “Fechar segurança e operação” (P0/P1 de go-live)
- **Objetivo:** cliente real pode operar com segurança auditada.
- **Entregas:** trilha T1–T12 do `P0_CHECKLIST_OPERACIONAL.md` executada e marcada; verificação funcional FIADO (ajustar UI/actions ou restaurar backend — decisão registrada); P2 de segurança fechado (inventário RLS + 5 cenários de abuso + evidências); E2E mutadores do gerente; smoke 360/QQ com evidência.
- **Critérios de aceite:** todos os checklists com `[x]` e evidência anexada (PR/ticket); pentest curto sem achado crítico aberto; suíte E2E crítica verde incluindo cancelamento e ajuste de estoque.
- **Riscos:** achados do pentest podem gerar retrabalho de RLS; dependência de credenciais/ambiente de staging estável.
- **Dependências:** Sprint 1 (banco determinístico).
- **Complexidade:** **Média**.

### Sprint 3 — “Fiscal real” (condicional ao cliente exigir NFC-e/NF-e)
- **Objetivo:** emissão fiscal real em produção com rollback ensaiado.
- **Entregas:** `CHECKLIST_ATIVACAO_FOCUS_1_DIA.md` integral (Go/No-Go, D-1, H-0, testes A/B/C); decisão `mock` vs `http` registrada (`DONE_DEFINITION_PILOTO` §4); plano de fallback validado.
- **Critérios de aceite:** NFC-e emitida e autorizada em homologação e produção; DLQ vazia após janela; rollback ensaiado (voltar a `mock` + redeploy) documentado com evidência.
- **Riscos:** dependências externas (contrato Focus, token, cadastro do emitente, SEFAZ) — fora do controle da engenharia; é o item com maior incerteza de calendário.
- **Dependências:** Sprints 1–2; pré-requisitos comerciais (Go/No-Go inicial do checklist).
- **Complexidade:** **Média** técnica, **Alta** operacional.

### Sprint 4 — “Balcão validado” (invariantes do bip: decisão + validação)
- **Objetivo:** ratificar formalmente e validar em operação o pipeline do bip **já implementado** (ver adendo §1.1), e formalizar a degradação offline.
- **Entregas:** F0 (ADR assinado); F1 (matriz offline preenchida e revisada); teste de burst “sábado simulado” registrado; baseline de telemetria p95 (bip → linha visível); atualização do `ROADMAP_PDV_INVARIANTES` para o estado real; eventuais ajustes de UX de fila aprovados no ADR.
- **Critérios de aceite:** burst (A+B+C < 300 ms) sem corrupção de estado, com evidência; matriz offline sem “TODO vago”, revisada pelo suporte; ADR com sign-off de produto + eng lead.
- **Riscos:** decisão de UX (input bloqueante vs fila visível) pode travar em produto; ADR ratificar algo diferente do que o código já faz geraria retrabalho — mitigar levando a implementação atual como proposta default.
- **Dependências:** nenhuma de banco; paralelo possível com Sprints 2–3.
- **Complexidade:** **Baixa–Média** (majoritariamente decisão, documentação e QA; código apenas se o ADR pedir ajuste).

### Sprint 5 — “Valor percebido” (Fase 2 remanescente)
- **Objetivo:** funcionalidades que o lojista sente no dia a dia, sem tocar no núcleo.
- **Entregas:** Venda em Espera (tabela `vendas_em_espera` + 3 RPCs isoladas + UI); UX cadastro de produto; gestão visual de faixas de atacado; `system_alerts` em produção alimentando a timeline.
- **Critérios de aceite:** venda pausada sobrevive a troca de terminal e recalcula preço no retorno; nenhum RPC do núcleo (`finalizar_venda_*`, `cancelar_venda_*`, `decrementar_estoque_seguro`) alterado (regra inviolável da Fase 2).
- **Riscos:** baixo — desenho já pronto em `PLANO_FASE_2_VALOR_PERCEBIDO.md`.
- **Dependências:** Sprint 1 (para aplicar migrations novas com segurança); idealmente Sprint 4 (bip estável antes de nova UI de caixa).
- **Complexidade:** **Média**.

### Sprint 6+ — Backlog governado
Devolução/troca com RPC única; consolidação `/admin` × `/gerente`; arredondamento ABNT fora do motor de preço; kardex avançado; Fase 3.2 acessibilidade; auto-update Tauri; multi-loja avançado.

---

## 6. Bloqueadores para produção (cliente real)

1. **Drift de migrations produção × repositório (P0).** Numeração colidente e conteúdos distintos para o mesmo número; deploy de schema não-determinístico (`AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` §4, §7).
2. **Checklists operacionais não executados/marcados:** `P0_CHECKLIST_OPERACIONAL.md` (T1–T12), `CHECKLIST_P0_STAGING.md`, `DONE_DEFINITION_PILOTO.md` §1–§5 — todos com itens `[ ]` sem evidência.
3. **Emissão fiscal real não ativada** — sistema opera com stub/mock; pré-requisitos comerciais (contrato Focus, token, cadastro do emitente) em aberto (`CHECKLIST_ATIVACAO_FOCUS_1_DIA.md`). Bloqueia qualquer cliente que exija NFC-e.
4. **Compliance de auditoria de descontos incompleto em produção** (`descontos_venda` sem operador/timestamp — `AUDITORIA_DRIFT` §5.1).
5. **Incerteza funcional pós-remoção do FIADO** — app referencia `contas_receber` em fluxos de cliente/financeiro sem verificação funcional registrada (`AUDITORIA_DRIFT` §5.2).
6. **Governança de segurança P2 não fechada** — pentest interno e auditoria policy-by-policy sem evidências (`P2_GOVERNANCA_RLS_E_PENTEST.md`).
7. **Pipeline do bip sem validação operacional ratificada** — implementação serial integrada, mas ADR sem sign-off, matriz offline inexistente e teste de burst “sábado simulado” não registrado (`docs/adr/ADR-PDV-centro-de-gravidade.md`; `ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md` F0–F1).
8. **Smoke em navegadores chineses (360/QQ) pendente** — requisito explícito de go/no-go para o público-alvo (`PRODUCAO_GO_NO_GO.md` §manual item 6).
9. **E2E sem cobertura dos fluxos mutadores do gerente** (cancelar venda, ajuste de estoque) — mitigação de regressão insuficiente para operação assistida (`BACKLOG_TECNICO` item 4).

---

## 7. Dívida Técnica (somente com evidência)

| Severidade | Dívida | Evidência |
|---|---|---|
| **Crítica** | Esquema dual de numeração de migrations (sequencial `001`–`255` com lacunas `128`–`204`/`247`–`248` + timestamps) sem baseline nem gate de `db diff` no CI | `backend/supabase/migrations/` (185 arquivos); `AUDITORIA_DRIFT` §4 e §8 (Fases A–D não executadas) |
| **Crítica** | Migrations do repo não aplicadas em produção e vice-versa (features “inertes”: `113` repo, `235/252`, `236`) | `AUDITORIA_DRIFT` §5 |
| **Alta** | Duas superfícies gerenciais paralelas (`/admin/*` novo × `/gerente/*` legado), com ações do admin ainda apontando para `/gerente/produtos` | `app/admin/` (12 rotas) vs `app/gerente/` (~20 rotas); `AUDITORIA_PAINEL_ADMIN` (“Rotas não migradas: 8”; observação no §2) |
| **Alta** | ADR-PDV-001 sem sign-off enquanto o código já implementa o pipeline — decisão implícita no código, não ratificada por produto (inversão documentação × implementação) | `docs/adr/ADR-PDV-centro-de-gravidade.md` (status “Proposto”) vs `useCaixaScanPipeline` integrado em `CaixaPageClient.tsx` |
| **Alta** | Docs de roadmap/risco desatualizados vs código (ROADMAP_PDV_INVARIANTES descreve bip sem mutex; relatorio-risco aponta divergência de scanner já resolvida) — decisões podem ser tomadas sobre estado falso | `ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md` §Estado atual; `relatorio-risco-20260416-121531.txt` vs `shared-core/src/caixa/variantesChaveLeitura.ts` e `shared-core/src/pdv/scan-pipeline*` |
| **Alta** | Documentação de referência divergente do código (`ADMIN_PANEL_GUIDE.md` lista `/admin/compras` e `/admin/contas-pagar`, inexistentes; auditorias com contagens diferentes de rotas) | `ADMIN_PANEL_GUIDE.md` §Rotas vs `ls app/admin/` |
| **Média** | Arredondamento heterogêneo fora do motor de preço (`Math.round`/`toFixed` no carrinho/UI vs `round_abnt` no banco) | `BACKLOG_TECNICO` item 2; `core/pricing/PricingService.ts` |
| **Média** | Devolução/troca sem rotina única — estoque repõe principalmente via `cancelar_venda` | `BACKLOG_TECNICO` item 3; `048_devolucoes.sql` |
| **Média** | Cobertura E2E incompleta (mutadores do gerente) | `BACKLOG_TECNICO` item 4 |
| **Média** | Overloads legados de `finalizar_venda` v2/v3 conviventes (bloqueados por stubs, mas presentes no schema) | Migrations `20260619…`/`20260620…block/stub…`; `AUDITORIA_DRIFT` §6 |
| **Média** | Mensagens de produto antigas prometendo “offline” no web (app é online-first) | `BACKLOG_TECNICO` item 5 |
| **Baixa** | Artefatos de trabalho versionados na raiz (`_stash-clone-aninhado-21-05.patch`, `relatorio-risco-*.txt`, pasta `jinlong layout 20-05/` com espaços no nome e ui-kits de protótipo) | raiz do repo |
| **Baixa** | `semantic.css` marcado como deprecated ainda no repo | commit `b23e4b6` |
| **Baixa** | 1 vulnerabilidade `high` no `npm audit` (relatório de 2026-04-16 — reexecutar para confirmar estado atual) | `relatorio-risco-20260416-121531.txt` |

---

## 8. Recomendação Final

### Qual deve ser a próxima Sprint?
**Sprint 1 — Reconciliação de migrations + fonte única de verdade (Fases A–D da `AUDITORIA_DRIFT`), seguida imediatamente da trilha P0 operacional.** Justificativa: é a raiz do grafo de dependências. Sem banco determinístico, a ativação fiscal, o compliance de descontos, os alertas e o próprio go-live ficam construídos sobre areia — qualquer `db push` pode conflitar ou sobrescrever objetos de produção. É também a única dívida classificada como crítica com plano de correção já escrito e aprovável.

### O que NÃO deve ser feito agora?
- **Novas features de produto** (Venda em Espera, UX de cadastro, faixas de atacado visuais) antes da Sprint 1–2: aplicariam migrations novas sobre um versionamento quebrado.
- **Refatoração visual adicional ou continuação da migração `/gerente` → `/admin`**: valor percebido baixo frente aos bloqueadores; congela-se o estado atual (dual) até o go-live.
- **F4 (preço no caminho perceptivo do bip)** e qualquer mudança no núcleo transacional validado (`finalizar_venda_*`, `decrementar_estoque_seguro`, fechamento de caixa) — regra inviolável da Fase 2 continua valendo.
- **Multi-loja avançado, TEF/PIX, integrações novas, IA/CRM** — fora do roadmap; exigem decisão de produto antes de virarem backlog técnico.

### O que pode ocorrer em paralelo sem aumentar o risco?
1. **F0 (ADR) + F1 (matriz offline) + F2 (contrato do bip)** — trabalho de decisão e documentação, zero código, zero banco.
2. **E2E mutadores do gerente** — só adiciona testes; reduz risco das sprints seguintes.
3. **Pré-requisitos comerciais do fiscal** (contrato Focus, token, cadastro do emitente) — trilha de negócio, longa por natureza; iniciar já encurta a Sprint 3.
4. **Smoke 360/QQ** — execução manual independente de código.
5. **Higiene de repositório** (remover artefatos da raiz, atualizar `ADMIN_PANEL_GUIDE.md`, consolidar contagens das auditorias) — baixo risco, melhora a confiabilidade da própria governança.
6. **Fase 3.2 de acessibilidade (testes axe-core)** — aditiva e isolada, se houver capacidade ociosa; não deve competir por foco com Sprints 1–2.
