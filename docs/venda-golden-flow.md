# Golden Flow de Venda — Documento Oficial

**Status: CONGELADO** — Qualquer alteração estrutural neste fluxo requer revisão explícita e atualização deste documento.

---

## Fluxo web-caixa (online)

```
Cliente → POST /caixa/action
  → caixaVendas.impl.ts (Server Action Next.js)
    → revalidação de preço autoritativa (caixaPrecoAutoritativoServer.ts)
      → rpc obter_pricing_version_ativa (NULL = legado / versionamento off)
      → rpc calcular_preco_produto (por item; qtd via quantidadeParaRpcPreco)
    → supabase.rpc('finalizar_venda_transacional_canonica_v4')  -- overload ÚNICO com p_cliente_id
      [TX: vendas + itens + estoque + pagamentos + contas_receber (se saldo) + eventos]
    → rpc registrar_pricing_version_venda (best-effort se houver versão ativa)
    ← { ok, vendaId, eventId, contas_receber_id?, documentoFiscal? }
  → registrarAlertasLevesVenda (best-effort, após conclusão)
```

**Contrato v4 (Cycle 3):** um único overload (`…, p_cliente_id uuid`). Pagamento parcial (`SUM < total`) exige cliente da loja e gera `contas_receber` idempotente.
**Caller único autorizado:** `pdv-importados/app/caixa/server/caixaVendas.impl.ts`

**Caixa / espécie (Cycle 4):** `caixas.saldo_atual` **não** é incrementado pela v4. O valor esperado em dinheiro no fechamento vem de `calcular_valor_sistema_dinheiro_caixa` (valor_inicial + vendas DINHEIRO + movimentações − devoluções). `saldo_atual` muda em sangria/suprimento/estorno (e estorno de cancelamento em DINHEIRO).

**Quantidade fracionada:** itens aceitam `numeric(10,3)`; preço de faixa usa `quantidadeParaRpcPreco` → `GREATEST(1, FLOOR(qtd))` na RPC `calcular_preco_produto(integer)`. Helpers SSoT: `@shared/format/quantidadeCaixa`.

**Pagamento parcial (Fase 5b / BA-001):** SSoT = RPC v4 + `caixaPagamentoSaldo` (`pagamentoParcialExigeCliente`,
`SALDO_PENDENTE_EPS`). UI do caixa permite underpay; sem cliente abre modal de seleção.
Com cliente, finalize envia `p_cliente_id` e a RPC cria `contas_receber` pelo saldo.

**Garantias:**
- Idempotência via `pg_advisory_xact_lock(hashtext(venda_id))` + `ON CONFLICT DO NOTHING`
- Validação de preço autoritativa no servidor antes da chamada
- Transação revertida automaticamente em qualquer falha
- `event_id` gerado atomicamente na mesma transação

**Saída esperada da RPC:**
```json
{ "venda_id": "uuid", "status": "CONCLUIDA", "event_id": "uuid", "dados_fiscais": null|object }
```

---

## Fluxo PDV local (offline)

```
PDV Local → POST /sync-outbox (edge function)
  → handlePostOutboxBatch
    → dispatchOutboxEvent (tipo: VENDA_REGISTRADA)
      → processVenda
        → ensureCaixaPdv (cria caixa se necessário)
        → supabase.rpc('registrar_venda_com_itens')
          [INSERT vendas + itens_venda, ON CONFLICT DO NOTHING]
        → aplicarBaixaEstoquePorItem
        → maybeEnqueueFiscalDocumentAfterSyncedVenda (opcional)
```

**Caller único autorizado:** `backend/supabase/functions/sync-outbox/index.ts`

**Garantias:**
- Idempotência via `ON CONFLICT (id) DO NOTHING` em `vendas` e `itens_venda`
- Estoque baixado separadamente por `aplicarBaixaEstoquePorItem`
- Falha no fiscal não propaga (best-effort)

---

## RPCs de venda — mapa completo

| RPC | Status | Caller autorizado |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4` | **ATIVA** | `caixaVendas.impl.ts` somente |
| `registrar_venda_com_itens` | **ATIVA** | `sync-outbox/index.ts` somente |
| `finalizar_venda_transacional_canonica_v3` (qualquer overload) | `LEGACY_DISABLED_USE_V4` | — |
| `finalizar_venda_transacional_canonica_v2` (qualquer overload) | `LEGACY_DISABLED_USE_V4` | — |

Chamadas às RPCs bloqueadas lançam `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'` imediatamente.

---

## Enforcement em CI

O script `scripts/rpc-gate-guard.mjs` roda como parte de `guard:all` no CI e falha se:
- qualquer arquivo de produção chamar v2 ou v3
- qualquer arquivo além do caller autorizado chamar v4 ou `registrar_venda_com_itens`

---

## Contrato de entrada — v4

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `p_venda_id` | uuid | sim | ID determinístico (idempotência) |
| `p_caixa_id` | uuid | sim | Caixa do operador |
| `p_operador_id` | uuid | sim | Operador autenticado |
| `p_loja_id` | uuid | sim | Loja da transação |
| `p_forma_pagamento` | text | sim | Ex: DINHEIRO, PIX, CARTAO_CREDITO |
| `p_total_bruto` | numeric | sim | Total sem desconto |
| `p_total_desconto` | numeric | sim | Desconto aplicado |
| `p_total_liquido` | numeric | sim | Total final cobrado |
| `p_pagamentos` | jsonb | sim | Array `[{forma_pagamento, valor}]` |
| `p_itens` | jsonb | sim | Array com item_id, produto_id, quantidade, preco_original, preco_unitario, desconto_unitario, tipo_preco, tipo_preco_fonte |

## Contrato de entrada — registrar_venda_com_itens

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `p_venda_id` | uuid | sim | ID determinístico (idempotência) |
| `p_caixa_id` | uuid | sim | Caixa do PDV |
| `p_operador_id` | uuid | sim | Operador |
| `p_forma_pagamento` | text | sim | Ex: DINHEIRO |
| `p_total_bruto` | numeric | sim | |
| `p_total_desconto` | numeric | sim | |
| `p_total_liquido` | numeric | sim | |
| `p_itens` | jsonb | sim | Array com item_id, produto_id, quantidade, preco_original, preco_unitario, tipo_preco |
| `p_desconto_gerente_percentual` | numeric | não | Requer também p_desconto_gerente_valor |
| `p_desconto_gerente_valor` | numeric | não | |
| `p_gerente_id` | text | não | |

---

## Efeitos colaterais garantidos por venda

| Efeito | v4 (web) | registrar_venda_com_itens (offline) |
|---|---|---|
| `vendas` inserida | ✅ atômico | ✅ ON CONFLICT DO NOTHING |
| `itens_venda` inseridos | ✅ atômico | ✅ ON CONFLICT DO NOTHING |
| Estoque baixado | ✅ no DB pela RPC | ✅ via `aplicarBaixaEstoquePorItem` |
| `venda_eventos` registrado | ✅ `ensure_venda_evento_registrado` | ✅ separado |
| `descontos_venda` (se desconto) | ✅ | ✅ se ambos percentual + valor |

---

## O que NÃO fazer

- Não adicionar branches condicionais no fluxo de venda com base em flags de ambiente
- Não chamar v2/v3 "temporariamente" — elas lançam exception no banco
- Não duplicar callers (um único arquivo por RPC, enforced em CI)
- Não criar um terceiro fluxo de venda sem atualizar este documento e o guard

---

*Última validação de consistência em produção: 2026-06-20 — 0 divergências em 7 checks.*
