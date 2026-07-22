# 04 — PDV

> Fluxo de venda completo — web e desktop.
> [[03_ARQUITETURA]] · [[05_CADASTRO_PRODUTO]] · [[08_PROBLEMAS_E_SOLUCOES]]

---

## Modalidades

| Modalidade | Path | Filosofia |
|---|---|---|
| **Web** | `pdv-importados/app/caixa/` | Online-first, Supabase |
| **Desktop** | `pdv-local/` | Offline-first, SQLite + outbox |

**Piloto D0:** apenas web ([[07_DECISOES_ARQUITETURAIS#DEC-013]]).

---

## Fluxo de Venda Web (completo)

### 1. Abrir Caixa

```
Operador → /caixa
  → Verifica caixa aberto (middleware + Server Action)
  → INSERT caixas (saldo inicial)
```

| Item | Status | Evidência |
|---|---|---|
| Abertura de turno | ✅ | `migrations/045` |
| Saldo inicial | ✅ | `migrations/046` |
| Múltiplos turnos/dia | ✅ | Tabela `caixas` |

### 2. Bip / Scan Produto

```
Scan código → useCaixaScanPipeline (máquina de estados)
  → variantesChaveLeitura (shared-core)
  → lookup produtos
  → PricingService.resolve()
  → CartEngine.addItem()
  → [se cruzou faixa atacado] recalculateAll()
```

**Pipeline de estados:**
```
IDLE → SCANNING → RESOLVING → ADDING_TO_CART → IDLE
                              └→ PRODUCT_NOT_FOUND → IDLE
```

| Item | Status | Evidência |
|---|---|---|
| Scan código de barras | ✅ | `useCaixaScanPipeline` |
| Busca por nome | ✅ | `CaixaSearchBar.tsx` |
| Preço varejo/atacado | ✅ | `PricingService` |
| Badge "ATAC" | ✅ | Badge verde no item |
| Anti-fraude preço | ✅ | RPC recalcula no servidor |
| Telemetria scan | ✅ | `/api/caixa/scan-telemetry/` |

### 3. Carrinho

| Item | Status | Evidência |
|---|---|---|
| Estado Zustand | ✅ | `stores/carrinhoStore.ts` |
| Semáforo estoque | ✅ | Verde/Amarelo/Vermelho |
| Desconto por item | ✅ | Validação no carrinho |
| Desconto gerente (token) | ✅ | Edge `validar-gerente` |
| Cancelar item | ✅ | `CartEngine.removeItem()` |

### 4. Pagamento

| Item | Status | Evidência |
|---|---|---|
| Dinheiro, PIX, débito, crédito | ✅ | `caixaMetodoPagamento.ts` |
| Split 2–3 formas | ✅ | `migrations/051-053` + E2E |
| Conta a receber (PRAZO) | ✅ | INSERT na finalização |

### 5. Finalizar Venda

```
Server Action (caixa/actions.ts)
  → supabase.rpc('finalizar_venda_transacional_canonica_v4')
  → INSERT vendas + itens_venda
  → decrementar_estoque_seguro
  → (opcional) fiscal_enfileirar_documento_venda
  → limpa carrinho → comprovante
```

| Item | Status | Evidência |
|---|---|---|
| RPC canônica v4 | ✅ | `migrations/243` |
| Idempotência | ✅ | `migrations/061` |
| Baixa estoque atômica | ✅ | `decrementar_estoque_seguro` |
| Enfileiramento fiscal | ✅ | Configurável via env |
| Ledger de eventos | ✅ | `vendas_eventos_ledger` |

### 6. Recibo / Comprovante

| Item | Status |
|---|---|
| Comprovante não fiscal (tela) | ✅ |
| Impressão física de cupom | 🟡 Não confirmado |

### 7. Cancelamento

| Item | Status | Evidência |
|---|---|---|
| Cancelar venda finalizada | ✅ | `cancelar_venda_transacional` |
| Estorno estoque | ✅ | RPC reverte saldo |
| Via painel admin/gerente | ✅ | `/admin/vendas`, `VendaDetailSheet` |

### 8. Movimentações de Caixa

| Item | Status | RPC |
|---|---|---|
| Sangria | ✅ | `registrar_movimentacao('SANGRIA')` |
| Suprimento | ✅ | `registrar_movimentacao('SUPRIMENTO')` |
| Aprovação acima limite | ✅ | `aprovar_movimentacao` |
| Fechamento cego | ✅ | `fechar_caixa_atomico` |

---

## Diagnóstico Pré-Produção

Gate operacional antes do 1º cliente. **Não altera fluxo de venda.**

| Artefato | Função |
|---|---|
| `/admin/diagnostico-caixa` | UI admin — checklist OK/FALHA/AVISO |
| `pdv_diagnostico_pre_producao()` | RPC migration `256` |
| `verify_p0_producao.sql` | Script SQL manual |
| `npm run check:caixa-pre-producao` | CLI flags de ambiente |

**Commit:** `5ce33a6d`

**Pendente:** aplicar migration `256` + smoke no ambiente alvo.

---

## Venda em Espera (Parcial)

> Congelado para expansão no Feature Freeze. Código existe.

| Componente | Status |
|---|---|
| Migration `255_vendas_em_espera_e_consulta_rapida.sql` | ✅ |
| `caixaVendaEspera.impl.ts` | ✅ |
| E2E `caixa-venda-em-espera.spec.ts` | ✅ |
| Hardening RLS/auditoria | 🔴 Pendente (`TODO_auditoria_255.md`) |

**TODOs abertos (não bloqueiam D0):**
- Apertar RLS SELECT
- UNIQUE (operador_id, numero_local)
- Marcar CONVERTIDA após finalizar
- Ledger de park/resume/discard

---

## PDV Desktop (Tauri)

| Item | Status | Arquivo |
|---|---|---|
| Catálogo SQLite | ✅ | `usePdvLocalCatalogo.ts` |
| Venda offline | ✅ | `usePdvLocalVendaCaixaFlow.ts` |
| Outbox sync HMAC | ✅ | `usePdvLocalOutboxSync.ts` |
| Retry + DLQ | ✅ | Backoff exponencial |
| Paridade barcode | ✅ | `shared-core/variantesChaveLeitura` |
| Auto-update | 🔴 Pendente | P3 |

**Sync flow:**
```
Venda offline → vendas_outbox (pending)
  → POST /functions/v1/sync-outbox (HMAC + nonce)
  → finalizar_venda_canonica_v4
  → status = synced
```

---

## Integrações

### Estoque
- Baixa automática na finalização
- Estorno no cancelamento
- Anti-oversell (FOR UPDATE + version)

### Financeiro
- Contas a receber para PRAZO
- Saldo por turno em `caixas`

### Fiscal
- Enfileiramento automático (configurável)
- Worker `fiscal-worker`
- NFC-e Focus real: 🔴 pendente
- Bling adapter: 🔴 pendente

### Auditoria
- `vendas_eventos_ledger`
- `v_kardex_unificado`
- Telemetria scan (migrations `095-097`)
- Consistência vendas (migration `244`)

---

## Riscos Conhecidos

| Risco | Severidade | Detalhe |
|---|---|---|
| Idempotência web vs desktop | P0 parcial | Desktop tem nonce; web depende de `idempotency_key` na RPC |
| RPC legada desktop | P1 | `registrar_venda_com_itens` sem guard v4 |
| Venda em espera RLS fraca | P3 | Qualquer usuário da loja lê parked sales |
| E2E não bloqueante | P1 | Deploy pode ocorrer com E2E falhando |
| Impressão física | P2 | Não confirmada |

---

## Arquivos Principais

| Arquivo | Propósito |
|---|---|
| `app/caixa/page.tsx` | Rota principal |
| `app/caixa/CaixaPageClient.tsx` | Componente cliente + pipeline |
| `app/caixa/scan-pipeline/` | Máquina de estados |
| `app/caixa/actions.ts` | Server Actions |
| `stores/carrinhoStore.ts` | Estado carrinho |
| `core/pricing/PricingService.ts` | Motor de preço |
| `shared-core/src/cart/CartEngine.ts` | Engine carrinho |
| `shared-core/src/caixa/variantesChaveLeitura.ts` | Variantes barcode |

---

> Legado detalhado: [[PDV]] · Arquitetura: [[03_ARQUITETURA]]
