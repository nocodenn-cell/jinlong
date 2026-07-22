# 📅 Changelog — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[01_HISTORICO_PROJETO]] e [[99_LOG_ATUALIZACOES]] (2026-07-10)
> Linha do tempo de mudanças reconstruída a partir de migrations, commits e documentação.
> [[Home]] | [[Dashboard]]

---

## 2026-07 (Atual — Fase 4: Piloto)

### 2026-07-10 — Diagnóstico pré-produção PDV + consolidação admin

**Resumo:** Ferramenta de checklist antes do 1º cliente; consolidação admin e correções de merge/typecheck.

| Commit / artefato | Impacto |
|---|---|
| `5ce33a6d` feat(pdv): diagnóstico pré-produção do caixa | Migration `256`, `/admin/diagnostico-caixa`, `check:caixa-pre-producao`, `verify_p0_producao.sql` refocado em PDV |
| `88f2e64a` consolidate admin screens | SSoT de entidades; vendas admin com `VendaDetailSheet` + cancelamento |
| `VendasTable.tsx` (merge) | Cancelamento inline na tabela + sheet; `toVendaListRow()` para contrato `VendaCancelarModal` |
| `diagnosticoCaixa.impl.ts` | Typecheck: guard `status === 'ambiguo'` em `buscarProdutoComPrecoCaixa` |

**Checklist de abertura:** UI admin · CLI `npm run check:caixa-pre-producao` · SQL `verify_p0_producao.sql`

---

### 2026-07-08 — Governança e Feature Freeze

**Resumo:** Auditoria PMO completa; feature freeze declarado para 1º cliente pagante.

| Arquivo | Impacto |
|---|---|
| `docs/GOVERNANCA_PMO_JINLONG.md` | Matriz de cobertura completa por módulo |
| `docs/FEATURE_FREEZE_PILOTO.md` | Freeze formal de features até encerrar piloto |
| `docs/PLANO_EXECUTIVO_EXECUCAO_JINLONG.md` | Plano de execução corrigido com evidências |

**Decisões:**
- Canal do piloto = web only (sem Tauri no D0)
- Fiscal = mock/stub (NFC-e Focus só se contrato exigir)
- Onboarding assistido pelo time Jinlong

---

### 2026-07 — Merge consolidação + consistência visual admin

**Resumo:** PR #144 consolidado; consistência visual do painel admin.

| Arquivo | Impacto |
|---|---|
| Merge branch `main` → `merge/consolidacao` | Sincronização com main |
| Painel admin v2 | Consistência visual corrigida |

---

## 2026-06 (Fase 3: Qualidade + Admin v2)

### 2026-06 — Bloqueio de RPCs Legadas

**Resumo:** RPCs `finalizar_venda_*` v2 e v3 bloqueadas; v4 canônica como padrão.

| Arquivo | Impacto |
|---|---|
| `migrations/20260619…block_v2.sql` | Bloquear chamada direta à v2 |
| `migrations/20260620…block_v3.sql` | Bloquear chamada direta à v3 |
| `migrations/243_finalizar_venda_canonica_v4_captura.sql` | RPC v4 com captura de eventos |

**Impacto:** Governa o fluxo de finalização; evita regressão para RPCs sem idempotência.

---

### 2026-06 — GRANT Baseline (Migration 255)

**Resumo:** Captura de GRANTs que estavam apenas no dashboard Supabase; agora versionados.

| Arquivo | Impacto |
|---|---|
| `migrations/255_grant_baseline_authenticated.sql` | Ambientes novos recebem GRANTs corretos |

**Nota:** Histórico de drift documentado em `docs/AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md`.

---

### 2026-06 — Pricing Version Governance

**Resumo:** Guard de versão de pricing; prevenção de repricing pós-commit de venda.

| Arquivo | Impacto |
|---|---|
| `migrations/249_pricing_version_governance.sql` | Versão de pricing controlada |
| `migrations/254_pricing_version_venda_scope_guard.sql` | Guard de escopo de venda |
| `migrations/250_calcular_preco_produto_v2.sql` | RPC de preço com contexto de segurança |

---

### 2026-06 — Painel Admin v2 (13 rotas)

**Resumo:** Novo painel admin redesenhado com 13 rotas migradas.

| Arquivo | Impacto |
|---|---|
| `pdv-importados/app/admin/` | Dashboard, catálogo, estoque, vendas, financeiro, relatórios |
| `components/ui/admin-v2/` | AdminV2Shell, SidebarNav, PageHeader, MetricCard |

---

## 2026-05 (Fase 3.1: Acessibilidade ARIA)

### 2026-05 — Acessibilidade Fase 3.1 Completa

**Resumo:** Implementação completa de ARIA no caixa web e painel gerente.

| Arquivo | Impacto |
|---|---|
| `components/forms/FormField.tsx` | ARIA: label, required, invalid, describedby |
| `globals.css` | `sr-only`, `skip-link` |
| Todas as telas de caixa | Landmarks: main, nav, section role=search |
| `FASE_3_EXECUTIVE_SUMMARY.md` | Documento de conclusão Fase 3.1 |

---

## 2026-04 (Fase 2: Valor Percebido + Estoque Avançado)

### 2026-04 — Idempotência de Vendas

**Resumo:** Chave de idempotência adicionada à `finalizar_venda`.

| Arquivo | Impacto |
|---|---|
| `migrations/20260419013345_fix_venda_idempotency_key.sql` | Evita duplicação em retry |
| `migrations/061_venda_idempotency.sql` | Tabela de idempotência |

---

### 2026-04 — Split de Pagamento

**Resumo:** Multi-forma de pagamento (2–3 parcelas) implementado.

| Arquivo | Impacto |
|---|---|
| `migrations/051_split_pagamento.sql` | Tabela de split |
| `migrations/052_split_rpc.sql` | RPC de split |
| `migrations/053_split_relatorio.sql` | Relatório com split |
| `e2e/caixa-venda-multi-pagamento.spec.ts` | Cobertura E2E |

---

### 2026-04 — Estoque por Loja + Transferência

**Resumo:** Multi-loja na base de estoque; transferência segura e idempotente.

| Arquivo | Impacto |
|---|---|
| `migrations/032_lojas_estoque_por_loja.sql` | Estoque segregado por loja |
| `migrations/034_transferencia_base.sql` | Tabela de transferência |
| `migrations/082_transferencia_segura_idempotente.sql` | RPC idempotente de transferência |
| `migrations/094_transferencia_auditoria.sql` | Trilha de auditoria |

---

### 2026-04 — Guarda de Margem Negativa

**Resumo:** Constraint de banco que impede cadastro de produto com margem negativa.

| Arquivo | Impacto |
|---|---|
| `migrations/124_guard_margem_negativa_cadastro_precos.sql` | Guard no cadastro |
| `migrations/125_guard_margem_produtos_catalogo.sql` | Guard no catálogo |

---

## 2026-03 (Fase 2: Motor de Preço + Fiscal)

### 2026-03 — Motor de Preço Atacado (Tiers)

**Resumo:** Faixas de quantidade com desconto percentual ou valor fixo.

| Arquivo | Impacto |
|---|---|
| `migrations/033_precos_atacado_base.sql` | Tabela de faixas |
| `migrations/076_precos_atacado_v2.sql` | Versão melhorada |
| `migrations/077_precos_atacado_tiers_e_rpc.sql` | RPC de resolução de faixas |

---

### 2026-03 — Anti-fraude de Preço

**Resumo:** Preço recalculado autoritativamente no servidor; cliente não pode sobrescrever.

| Arquivo | Impacto |
|---|---|
| `migrations/123_revalidar_preco_commit_v3.sql` | Guard de preço no commit |
| `migrations/234_calcular_preco_autoritative.sql` | RPC autoridade de preço |

---

### 2026-03 — Fiscal: Fila + Worker

**Resumo:** Infraestrutura fiscal completa; worker de NFC-e.

| Arquivo | Impacto |
|---|---|
| `migrations/062_fiscal_fila.sql` | Fila `documentos_fiscais_pendentes` |
| `backend/supabase/functions/fiscal-worker/` | Worker Deno com adaptadores |
| `migrations/075_importacao_nfe_compra.sql` | Import de NF-e de compra |

---

## 2026-01/02 (Fase 1: MVP + Gerente)

### 2026-02 — Anti-replay HMAC + RPC Canônica v2

**Resumo:** Segurança do sync outbox com HMAC SHA256 e proteção contra replay.

| Arquivo | Impacto |
|---|---|
| `migrations/024_sync_outbox_hmac_nonce_replay.sql` | Tabela de nonces |
| `migrations/025_finalizar_venda_canonica_v2.sql` | RPC canônica v2 |

---

### 2026-01 — MVP PDV Web

**Resumo:** Caixa web funcional com autenticação, RLS, relatórios básicos e painel gerente.

| Arquivo | Impacto |
|---|---|
| `migrations/001_schema_inicial.sql` | Tabelas base |
| `migrations/007_estoque_rpc.sql` | RPC de estoque |
| `migrations/009_grants_caixa.sql` | Grants para operador |
| `migrations/011-013_relatorios.sql` | RPCs de relatório com timezone |
| `migrations/014_registrar_venda_com_itens.sql` | RPC de venda para desktop |
| `app/caixa/` | PDV web inicial |
| `app/gerente/` | Painel gerente inicial |

---

> Ver estado atual em [[Dashboard]] · Próximas entregas em [[Roadmap]]
