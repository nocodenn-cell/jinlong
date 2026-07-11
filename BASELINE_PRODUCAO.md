# Baseline de Produção — Estado Atual do Banco

**Data:** 2026-07-11 23:40 UTC  
**Banco:** jinlong (Supabase project: kbabmewnahysfvlybiak)  
**Status:** ✅ Capturado completamente (não-destrutivo, leitura)

---

## Schema Fingerprint (Verificação Bit-a-Bit)

**SHA256 Hash:** `00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355`

Este hash representa a assinatura completa do schema de produção. Qualquer banco reconstruído a partir do repositório deve produzir o **mesmo hash** para validar equivalência bit-a-bit.

```json
{
  "snapshot_date": "2026-07-11T23:40:00Z",
  "database": "jinlong",
  "schema_object_counts": {
    "tables": 64,
    "columns": 615,
    "indexes": 220,
    "triggers": 24,
    "functions": 102,
    "rls_policies": 121,
    "extensions": 10,
    "storage_buckets": 1
  }
}
```

---

## Inventário de Objetos de Schema

### 📊 Tabelas (64 total)

**Core Tables:**
- `usuarios`, `lojas`, `perfis` — Multi-tenant base
- `produtos`, `estoque`, `marcas`, `categorias` — Product & inventory
- `fornecedores`, `ordens_compra` — Procurement
- `vendas`, `itens_venda`, `vendas_pagamentos` — Sales core
- `caixas`, `movimentacoes_caixa`, `movimentos_caixa` — Cash management
- `clientes` — Customer master (critical for RLS)
- `funcionarios`, `funcionarios_meta` — Employee data
- `comissoes_regras_funcionario`, `comissoes_regras_historico`, `comissoes_vendedores` — Commission system
- `contas_receber`, `contas_pagar` — Accounting

**Operational Tables:**
- `estoque_baixas`, `estoque_reposicoes_cancelamento` — Inventory tracking
- `descontos_venda`, `tokens_desconto_gerente` — Discounts
- `vendas_em_espera`, `vendas_canceladas_auditoria` — Sales states
- `devolucoes` — Returns
- `remessas`, `remessa_itens` — Transfers
- `documentos_fiscais_pendentes`, `documentos_fiscais_eventos`, `documentos_fiscais_dlq` — Fiscal documents
- `importacoes_nfe` — NF-e imports
- `precos_atacado`, `regras_preco`, `historico_precos_produto` — Pricing (critical for #148 orphan)
- `relatorio_settings`, `gerente_auth_attempts`, `gerente_auth_rate_limits` — Config & auth

**Observability Tables:**
- `caixa_scan_telemetry_events`, `venda_eventos`, `venda_engine_shadow_runs` — Event logging
- `movimentos_estoque_log`, `liquidacoes_receber` — Audit trails
- `sync_request_nonces`, `transferencias_idempotencia` — Deduplication

**Views (8 total):**
- `v_clientes_gerente` — Multi-loja client visibility
- `v_estoque_baixo` — Low stock alerts
- `v_kardex_unificado` — Unified ledger
- `v_top_produtos` — Product rankings
- `v_vendas_dia` — Daily sales
- `v_venda_consistencia_anomalias` — Anomaly detection
- `v_fiscal_doc_status_event_mismatch` — Fiscal validation

---

### 🔧 Funções PL/pgSQL (102 total)

**Core RPCs (Production-critical):**
- `finalizar_venda_transacional_canonica_v4()` — Sales finalization (v4 with cliente_id + FIADO-guard)
- `decrementar_estoque_seguro()` — Atomic inventory decrement
- `calcular_preco_produto()` — Authoritative price engine
- `fiscal_enfileirar_documento_venda()` — NF-e enqueueing
- `ensure_venda_evento_registrado()` — Event ledger

**Helper Functions:**
- `round_abnt()` — Brazilian rounding
- `pg_advisory_xact_lock()` — Transaction locking
- Multiple `comissoes_*()`, `caixa_*()`, `relatorio_*()` functions

**Total:** 102 functions defined in `public` schema

---

### 📈 Índices (220 total)

**Performance Critical:**
- `idx_vendas_cliente` — Sales by customer
- `idx_vendas_cliente_data` — Reporting query (cliente, date, status)
- `idx_estoque_produto_loja` — Stock lookups
- `idx_funcionarios_loja_ativo` — Active employees by store
- `idx_comissoes_vendedor_periodo` — Commission queries
- `clientes_loja_documento_unique` — **CRITICAL ORPHAN (#266)** — multi-loja document uniqueness

**Composite Indexes:**
- `idx_vendas_pagamentos_forma_status` — Payment queries
- `idx_movimentos_caixa_loja_data` — Cash movements
- `idx_documentos_fiscais_status_venda` — Fiscal tracking

**Full-Text Search:**
- `idx_produtos_nome_trgm` — Product search (trigram)

---

### 🔐 RLS Policies (121 total)

**By Table (examples):**
- `clientes` — **CRITICAL ORPHANS (#265):**
  - `clientes_insert_loja` — CREATE, INSERT by GERENTE/DONO/ADMIN in own store
  - `clientes_update_gerente_loja` — UPDATE by GERENTE/DONO/ADMIN in own store  
  - `clientes_delete_gerente_loja` — DELETE by GERENTE/DONO/ADMIN in own store
  
- `vendas` — SELECT by own store, UPDATE by GERENTE/DONO/ADMIN
- `estoque` — SELECT/UPDATE by own store
- `funcionarios` — SELECT by own store (DONO sees all), INSERT/UPDATE by GERENTE/DONO/ADMIN
- `produtos` — SELECT all, INSERT/UPDATE by ADMIN
- `comissoes_*` — Access controlled by loja_id

**Total:** 121 policies protecting 64 tables

---

### ⚙️ Triggers (24 total)

**Audit Triggers:**
- `venda_eventos_trigger` — Log sale events
- `estoque_baixas_trigger` — Track stock movements
- `movimentos_caixa_trigger` — Cash movement audit

**Enforcement Triggers:**
- `ensure_loja_id_match` — Multi-tenant isolation
- `update_timestamp_triggers` — `updated_at` columns

**Business Logic Triggers:**
- `contas_receber_auto_create` — Auto-create AR from sales
- `comissoes_freeze_trigger` — Lock commission rules on sale

---

### 🔌 Extensions (10 installed)

```
pgcrypto        — Encryption (md5, sha256)
uuid-ossp       — UUID generation alternatives
plpgsql         — Stored procedures
pg_trgm         — Full-text search (trigram)
pg_cron         — Scheduled jobs
pg_net          — HTTP requests
pg_stat_statements — Query analysis
index_advisor   — Index recommendations
hypopg          — Hypothetical indexes
supabase_vault  — Secrets management
```

---

### 📦 Storage Buckets (1 total)

```
Bucket: produto-imagens
├── Public: true
├── File Size Limit: 2 MB (2097152 bytes)
├── Allowed MIME Types:
│   ├── image/jpeg
│   ├── image/png
│   └── image/webp
└── RLS Policies: 3 (INSERT, UPDATE, DELETE for GERENTE/DONO/ADMIN)
```

---

## Migrations Rastreadas em `schema_migrations` (12 total)

| Version | Name | Tipo | Status |
|---------|------|------|--------|
| `20260707183145` | `258_produtos_localizacao_nome_reduzido` | Match | ✅ Em repo |
| `20260709184734` | `259_historico_precos_produto` | Órfã relativa | ⚠️ PR #148 |
| `20260710163032` | `255_vendas_em_espera_e_consulta_rapida` | Equivalente (247c) | ⚠️ Renumerada |
| `20260710212200` | `263_vendas_cliente_id` | Equivalente (259) | ✅ Renumerada |
| `20260710212305` | `264_finalizar_venda_canonica_v4_cliente_id` | Divergência (260) | ⚠️ FIADO-guard |
| `20260710212349` | `265_clientes_insert_operador_pdv` | **ÓRFÃ PROD-ONLY** | 🔴 CRÍTICA |
| `20260710212628` | `266_clientes_unique_documento_loja` | **ÓRFÃ PROD-ONLY** | 🔴 CRÍTICA |
| `20260711015958` | `259_funcionarios_separate_from_usuarios` | Equivalente (262) | ✅ Renumerada |
| `20260711020021` | `260_comissoes_regras_funcionario` | Equivalente (263) | ✅ Renumerada |
| `20260711020053` | `261_comissoes_vendedores_regra_e_congelamento` | Equivalente (264) | ✅ Renumerada |
| `20260711143312` | `267_funcionarios_meta_crud` | Match | ✅ Em repo |
| `20260711230618` | `088_produto_imagens_storage_bucket` | Match | ✅ Em repo |

---

## Constatações Críticas

### 🔴 Órfãs Prod-Only (Risco Máximo)

**Migration 265 — `clientes_insert_operador_pdv`**
- **Localização:** Banco (20260710212349) → repo (❌ ausente)
- **Conteúdo:** RLS policies para tabela `clientes`
  - `clientes_insert_loja` — CREATE by GERENTE/DONO/ADMIN
  - `clientes_update_gerente_loja` — UPDATE by GERENTE/DONO/ADMIN
  - `clientes_delete_gerente_loja` — DELETE by GERENTE/DONO/ADMIN
- **Risco:** Um `db reset` perde multi-loja isolation em clientes
  - Usuários de loja A podem ver/editar clientes de loja B
  - LGPD compliance quebrado

**Migration 266 — `clientes_unique_documento_loja`**
- **Localização:** Banco (20260710212628) → repo (❌ ausente)
- **Conteúdo:** Índice único `(loja_id, documento)`
- **Risco:** Um `db reset` permite documento duplicado por loja
  - Business rule violado (1 documento por cliente por loja)
  - Relatórios de clientes quebrados

### ⚠️ Órfã Relativa (Fora da Branch)

**Migration 259 — `259_historico_precos_produto`**
- **Localização:** Banco (20260709184734) + PR #148 (não-mergeada)
- **Status:** Aplicada em produção; ausente de main branch
- **Ação:** Deve-se integrar #148 ou capturar no baseline

### ⚠️ Divergência de Negócio

**Migration 264 `finalizar_venda_transacional_canonica_v4_cliente_id` (Banco)**  
**vs Migration 260 `finalizar_venda_v4_com_cliente.sql` (Repo)**

- **Banco (264):**
  ```sql
  IF upper(COALESCE(p_forma_pagamento, '')) = 'FIADO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO';
  END IF;
  ```
  - Formas válidas: `DINHEIRO, PIX, CARTAO_DEBITO, CARTAO_CREDITO`
  - **FIADO rejeitado no header**

- **Repo (260):**
  ```sql
  IF v_pag_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'FIADO') THEN
  ```
  - **FIADO aceito**

- **Causa:** Ordem de merge: #158 (260 sem guard) depois #152 (v4 com guard)
- **Resolução:** Migration 268 (feature/go-live-integration) unifica ambos

---

## Validação de Integridade

**Checklist:**
- ✅ 64 tabelas capturadas
- ✅ 615 colunas mapeadas
- ✅ 220 índices documentados
- ✅ 24 triggers identificados
- ✅ 102 funções listadas
- ✅ 121 RLS policies contadas
- ✅ 10 extensões verificadas
- ✅ 1 storage bucket confirmado
- ✅ 12 migrations em schema_migrations auditadas
- ✅ SHA256 fingerprint gerado: `00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355`

**Próximo Passo:** Validar que um baseline (dump) + Passo 2 (diff vazio) reproduz este fingerprint.

---

## Artefatos

- `schema_fingerprint.json` — Estrutura completa (64 tabelas, 615 colunas, etc.)
- `schema_hash.txt` — SHA256: `00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355`
- Este documento — `BASELINE_PRODUCAO.md`
