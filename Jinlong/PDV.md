# 🛒 PDV — Jīn Lóng

> [[Home]] | [[Arquitetura]] | [[Cadastro Produto]]

---

## Visão Geral

O PDV é o coração do produto. Existe em duas modalidades:
- **Web** (`pdv-importados/app/caixa/`) — online-first, Next.js
- **Desktop** (`pdv-local/`) — offline-first, Tauri 2 + SQLite

---

## Fluxo Completo do PDV Web

### 1. Abertura de Caixa

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Operador abre turno | ✔ Pronto | `migrations/045_abertura_caixa.sql` |
| Registro de saldo inicial | ✔ Pronto | `migrations/046_caixa_saldo_inicial.sql` |
| Múltiplos turnos por dia | ✔ Pronto | Tabela `caixas` com `operador_id` |
| Verificação de caixa aberto | ✔ Pronto | Guard no `middleware.ts` + Server Action |

---

### 2. Venda

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Scan de código de barras | ✔ Pronto | `useCaixaScanPipeline` + `variantesChaveLeitura` |
| Busca por nome | ✔ Pronto | `CaixaSearchBar.tsx` + trigram index |
| Carrinho com itens | ✔ Pronto | `carrinhoStore.ts` (Zustand) |
| Preço varejo automático | ✔ Pronto | `PricingService.resolve()` |
| Preço atacado automático | ✔ Pronto | `PricingService.recalculateAll()` quando cruza faixa |
| Badge "ATAC" visível | ✔ Pronto | Badge verde no item quando atacado ativo |
| Recalcular TODOS os itens ao cruzar faixa | ✔ Pronto | `CartEngine.addItem()` detecta mudança + recalculate |
| Anti-fraude de preço (servidor) | ✔ Pronto | RPC recalcula autoridade no banco |
| Split de pagamento (2–3 parcelas) | ✔ Pronto | `migrations/051-053` + E2E |
| Formas: dinheiro, PIX, débito, crédito | ✔ Pronto | `caixaMetodoPagamento.ts` |
| Finalização transacional idempotente | ✔ Pronto | RPC `finalizar_venda_canonica_v4` |
| Baixa de estoque atomica | ✔ Pronto | `decrementar_estoque_seguro` (FOR UPDATE + version) |
| Enfileiramento fiscal (opcional) | ✔ Pronto | `fiscal_enfileirar_documento_venda` (configurável) |
| Comprovante não fiscal | 🟡 Parcial | Não foi possível confirmar impressão física |
| Telemetria de scan | ✔ Pronto | `app/api/caixa/scan-telemetry/` + migrations `095-097` |
| Pipeline de scan com máquina de estados | ✔ Pronto | `useCaixaScanPipeline` em `CaixaPageClient.tsx` |

---

### 3. Desconto

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Desconto por item | ✔ Pronto | Carrinho + validação |
| Desconto de gerente (com token) | ✔ Pronto | `migrations/018, 021-023` + Edge `validar-gerente` |
| Rate limit anti-brute-force | ✔ Pronto | `migrations/022_rate_limit.sql` |
| Limite de desconto manual por item | ✔ Pronto | `migrations/122_limite_desconto_manual_itens.sql` |
| Desconto offline (cache local) | 🟡 Parcial | Implementado; modo `STRICT_MANAGER_DISCOUNT_AUTH=true` bloqueia sync sem token |
| Auditoria de desconto | ✔ Pronto | Tabela `tokens_desconto_gerente` |

---

### 4. Cancelamento

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Cancelar item no carrinho | ✔ Pronto | `CartEngine.removeItem()` |
| Cancelar venda finalizada | ✔ Pronto | `migrations/050_cancelar_venda_transacional.sql` |
| Cancelamento com estorno de estoque | ✔ Pronto | RPC `cancelar_venda_transacional` reverte estoque |
| Cancelamento com auditoria | ✔ Pronto | `migrations/059_cancelar_venda_split_e_auditoria.sql` |
| Cancelamento via painel gerente | ✔ Pronto | `app/gerente/vendas/[id]` + `app/admin/vendas/actions.ts` |

---

### 5. Caixa (Movimentações)

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Sangria | ✔ Pronto | `registrar_movimentacao('SANGRIA', ...)` |
| Suprimento | ✔ Pronto | `registrar_movimentacao('SUPRIMENTO', ...)` |
| Aprovação acima do limite | ✔ Pronto | `aprovar_movimentacao` — gerente aprova |
| Cancelamento de movimentação | ✔ Pronto | `cancelar_movimentacao` |
| Recálculo de saldo | ✔ Pronto | `recalcular_saldo_caixa(p_caixa_id)` |
| E2E de sangria | ✔ Pronto | `e2e/caixa-fluxos-criticos.spec.ts` |

---

### 6. Fechamento de Caixa

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Fechamento cego (sem conferência) | ✔ Pronto | `migrations/054_pdv_config_blind_closure.sql` |
| Fechamento atômico | ✔ Pronto | `migrations/207_fechar_caixa_atomico.sql` + `227` |
| Status de fechamento | ✔ Pronto | `migrations/230_caixa_status_fechamento.sql` |
| E2E de fechamento | ✔ Pronto | `e2e/caixa-fluxos-criticos.spec.ts` |

---

### 7. Integração Estoque

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Baixa automática na finalização | ✔ Pronto | `decrementar_estoque_seguro` na RPC canônica |
| Semáforo de estoque no carrinho | ✔ Pronto | Verde/Amarelo/Vermelho por produto |
| Estorno no cancelamento | ✔ Pronto | `cancelar_venda_transacional` reverte |
| Anti-oversell | ✔ Pronto | `FOR UPDATE + version` impede venda sem estoque |

---

### 8. Integração Financeiro

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Registro na conta a receber (PRAZO) | ✔ Pronto | `INSERT contas_receber` na finalização |
| Caixa (saldo por turno) | ✔ Pronto | Tabela `caixas` com saldo calculado |

---

### 9. Integração Fiscal

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Enfileiramento automático pós-venda | ✔ Pronto | `fiscal_enfileirar_documento_venda` (configurável via env) |
| Worker de processamento | ✔ Pronto | `fiscal-worker` Edge Function |
| Alerta de NF em produto sem NF | ✔ Pronto | Lógica no carrinho + modal de confirmação |
| NFC-e Focus real | 🔴 Pendente | TODO explícito no `fiscal-provider-adapter.ts` |
| Bling adapter | 🔴 Pendente | TODO explícito no `fiscal-provider-adapter.ts` |

---

### 10. Integração Auditoria

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Ledger de eventos de venda | ✔ Pronto | `vendas_eventos_ledger` |
| Kardex de estoque (trilha) | ✔ Pronto | `v_kardex_unificado` |
| Telemetria de scan | ✔ Pronto | `migrations/095-097` |
| Consistência de vendas | ✔ Pronto | `migrations/244_auditoria_consistencia_vendas.sql` |

---

## Diagnóstico Pré-Produção (2026-07-10)

Gate operacional antes do 1º cliente. **Não altera o fluxo de venda.**

| Artefato | Função |
|---|---|
| `/admin/diagnostico-caixa` | UI admin — checklist OK/FALHA/AVISO |
| `pdv_diagnostico_pre_producao()` | RPC migration `256` — migrations, GRANTs, RLS, config |
| `verify_p0_producao.sql` | Script SQL manual (escopo PDV/caixa) |
| `npm run check:caixa-pre-producao` | CLI flags de ambiente |

**Commit:** `5ce33a6d`

**Pendente no ambiente alvo:** aplicar migration `256`, validar GRANTs (`255`), smoke de 1 venda real.

---

## Funcionalidades Não Implementadas

| Funcionalidade | Evidência |
|---|---|
| Venda em Espera (completa) | RPCs migration `255` + `caixaVendaEspera.impl.ts` existem; E2E/hardening (`TODO_auditoria_255.md`) pendentes |
| Impressão física de cupom não fiscal | Não confirmado |
| Desconto por cupom/voucher | Não encontrado |
| Programa de fidelidade | Não encontrado |
| Venda por cliente (CRM) | Clientes existem mas vinculação à venda não confirmada |

---

## PDV Desktop (Tauri)

| Funcionalidade | Status | Arquivo |
|---|---|---|
| Catálogo local (SQLite) | ✔ Pronto | `usePdvLocalCatalogo.ts` |
| Venda offline | ✔ Pronto | `usePdvLocalVendaCaixaFlow.ts` |
| Outbox sync (HMAC + nonce) | ✔ Pronto | `usePdvLocalOutboxSync.ts` |
| Retry com backoff exponencial | ✔ Pronto | `docs/ROADMAP.md` `[x]` |
| DLQ com UI de reprocessamento | ✔ Pronto | `docs/ROADMAP.md` `[x]` |
| Paridade leitura de código de barras | ✔ Pronto | `shared-core/src/caixa/variantesChaveLeitura.ts` |
| Auto-update Tauri | 🔴 Pendente | `docs/ROADMAP.md` longo prazo `[ ]` |
| Desconto gerente offline | ✔ Pronto | Cache local; STRICT_MODE bloqueia sync sem token |

---

## Pipeline de Scan (Máquina de Estados)

```
IDLE
  ↓ scan detectado
SCANNING
  ↓ lookup no catálogo
RESOLVING
  ↓ produto encontrado
  ├─ ADDING_TO_CART
  │    ↓ PricingService.resolve()
  │    ↓ CartEngine.addItem()
  │    ↓ [se cruzou faixa] recalculateAll()
  │    → IDLE (sucesso)
  └─ PRODUCT_NOT_FOUND
       → IDLE (bip de erro)
```

Implementado em: `app/caixa/scan-pipeline/` + `shared-core/src/pdv/`

---

## Arquivos Principais

| Arquivo | Propósito |
|---|---|
| `pdv-importados/app/caixa/page.tsx` | Rota principal do caixa |
| `pdv-importados/app/caixa/CaixaPageClient.tsx` | Componente cliente com pipeline scan |
| `pdv-importados/app/caixa/scan-pipeline/` | Máquina de estados do scan |
| `pdv-importados/app/caixa/actions.ts` | Server Actions (finalizar, cancelar) |
| `pdv-importados/app/caixa/caixaMetodoPagamento.ts` | Mapeamento de formas de pagamento |
| `pdv-importados/stores/carrinhoStore.ts` | Zustand — estado do carrinho |
| `pdv-importados/core/pricing/PricingService.ts` | Motor de preço |
| `shared-core/src/cart/CartEngine.ts` | Engine de carrinho (compartilhado) |
| `shared-core/src/caixa/variantesChaveLeitura.ts` | Variantes de chave de busca (barcode) |
| `pdv-local/src/hooks/usePdvLocalVendaCaixaFlow.ts` | Fluxo de venda desktop |
| `pdv-local/src/hooks/usePdvLocalOutboxSync.ts` | Sync desktop |

---

> Ver detalhes de [[Arquitetura]] · Cadastro em [[Cadastro Produto]] · Bugs em [[Bugs]]
