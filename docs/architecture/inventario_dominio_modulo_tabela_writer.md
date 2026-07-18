# Inventário de domínio — módulo → tabela → writer → orquestrador

| Campo | Valor |
|--------|--------|
| **Missão** | 5.1a — Inventário + Boundary Guards |
| **Data** | 2026-07-18 |
| **Referência main** | `2becdf39` (ciclo comercial GO) · tip docs Missão 5 |
| **ADR** | [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md) |
| **Fontes** | [mapa autoridade caixa](../../backend/artifacts/mapa_autoridade_caixa_20260718.md), ADR-CAIXA-002, callers em `pdv-importados` |
| **Escopo** | Mapa factual — **não** corrige writers, RPCs ou UI |

---

## Legenda

| Coluna | Significado |
|--------|-------------|
| **Módulo** | Dono conceitual (ADR-005) |
| **Tabela / conceito** | Entidade ou contrato derivado |
| **Writer canônico** | RPC ou path app que escreve |
| **App entry** | Adapter / Server Action (borda) |
| **Orquestrador** | Fluxo que toca ≥2 domínios na mesma TX/RPC |
| **Cross-cut** | Sim se efeitos cruzam donos |

---

## sales

| Tabela / conceito | Writer canônico | App entry | Orquestrador | Cross-cut | Notas |
|---|---|---|---|---|---|
| `vendas` | `finalizar_venda_transacional_canonica_v4` (INSERT) | `pdv-importados/app/caixa/server/caixaVendas.impl.ts` | — | Não | Status `CONCLUIDA` |
| `itens_venda` | `finalizar_venda_transacional_canonica_v4` | idem | — | Não | |
| `vendas_pagamentos` | **somente** `finalizar_venda_transacional_canonica_v4` (INSERT) | idem | — | Não | SSoT pagamento (C). Cancel **não** muta |
| `vendas.status` → `CANCELADA` | `cancelar_venda_transacional` | `caixaVendas.impl.ts` → `cancelarVendaImpl` | **sim** — estoque + `saldo_atual` | Sim | Orquestra inventory + cash (A) |
| `devolucoes` | `cancelar_venda_transacional`; `devolver_ou_trocar_venda` | cancel: `caixaVendas.impl.ts`; devolver: `app/gerente/vendas/devolverOuTrocarVenda.impl.ts` | **sim** — estoque + liquidez física | Sim | Pagamentos da venda origem preservados |
| auditoria cancel | via RPC cancel | `caixaVendas.impl.ts` | — | Parcial | Detalhe de tabelas de auditoria: legado / a expandir |

**Eventos conceituais:** `SALE_REGISTERED`, `SALE_CANCELLED`, `SALE_PARTIAL_RETURN`.

**Não writers de sales:** `movimentacoes_caixa` (venda/cancel/devolver **não** INSERT).

---

## cash

| Tabela / conceito | Writer canônico | App entry | Orquestrador | Cross-cut | Notas |
|---|---|---|---|---|---|
| `caixas` (abertura INSERT) | app INSERT (`abrirCaixaOperadorImpl`) | `caixaSessaoOperador.impl.ts` | — | Não | `saldo_atual` default `0` |
| `caixas` (fechamento) | `fechar_caixa_atomico` / `fechar_caixa_pdv_atomico` | `caixaSessaoOperador.impl.ts` | — | Não | Não recalcula `saldo_atual` |
| \(E(c)\) esperado | **leitura** `calcular_valor_sistema_dinheiro_caixa` | `caixaFechamentoServer.ts` (e afins) | — | Não | SSoT esperado (B) — **não** writer |
| `movimentacoes_caixa` | `registrar_movimentacao`, `aprovar_movimentacao`, `cancelar_movimentacao`, `estornar_movimentacao` | `caixaMovimentacoes.impl.ts` | — | Não | Sangria/suprimento/estorno (D) |
| `caixas.saldo_atual` (A) | `registrar_movimentacao`, `aprovar_movimentacao`, `cancelar_venda_transacional`, `devolver_ou_trocar_venda` | movs: `caixaMovimentacoes.impl.ts`; cancel: `caixaVendas.impl.ts`; devolver: `devolverOuTrocarVenda.impl.ts` | cancel/devolver são orquestradores **sales**-led | Sim (só nos paths pós-venda) | **Não** contábil; **não** incrementado na venda |
| `recalcular_saldo_caixa` | RPC overwrite = VI+movs (**ignora vendas**) | **app PDV não chama** (só scripts/testes) | — | Dívida D-A4 | Não usar em produção |

**Contrato ADR-CAIXA-002:** fechamento lê \(E(c)\); `vendas_pagamentos` permanece em **sales**.

---

## inventory

| Tabela / conceito | Writer canônico | App entry | Orquestrador | Cross-cut | Notas |
|---|---|---|---|---|---|
| `estoque` (baixa venda) | `finalizar_venda_transacional_canonica_v4` | `caixaVendas.impl.ts` | **sales**-led | Sim | Efeito inventory na TX de venda |
| `estoque` (reposição cancel) | `cancelar_venda_transacional` | `caixaVendas.impl.ts` | **sales**-led | Sim | + `estoque_reposicoes_cancelamento` |
| `estoque_reposicoes_cancelamento` | `cancelar_venda_transacional` | idem | **sales**-led | Sim | |
| `estoque` (ajuste manual) | `ajustar_estoque_manual` | `app/gerente/estoque/actions.ts` (admin SSoT `/admin/estoque`) | — | Não | UI entity-ssot |
| `estoque` (INSERT saldo inicial / linha) | `criar_produto_com_estoque_inicial` (parte estoque); inserts legados em actions | `lib/adapters/supabase/criarProdutoComEstoqueInicialRpc.ts`; legado `gerente/estoque/actions.ts` | **products**+**inventory** | Sim | Preferir RPC atômica (mig. 270) |
| `movimentos_estoque_log` (kardex) | RPCs de ajuste / venda / cancel (via DB) | indireto | varia | Parcial | Writers SQL — inventário vivo a refinar por migração |
| devolução/troca → estoque | `devolver_ou_trocar_venda` | `devolverOuTrocarVenda.impl.ts` | **sales**-led | Sim | |

---

## products

| Tabela / conceito | Writer canônico | App entry | Orquestrador | Cross-cut | Notas |
|---|---|---|---|---|---|
| `produtos` CRUD | actions gerente/admin + RPC create | `app/gerente/produtos/actions.ts`; UI SSoT `/admin/catalogo` | — | Não | entity-ssot |
| `produtos` + estoque inicial | `criar_produto_com_estoque_inicial` | `criarProdutoComEstoqueInicialRpc.ts`; PDV relâmpago `caixaCadastroRelampago.impl.ts` | **products**+**inventory** | Sim | TX atômica |
| `gtin_lookup_cache` | upsert app | `lib/adapters/gtin/gtinCacheRepository.ts` | — | Não | Cache auxiliar |
| status publicação | actions catálogo | admin catalogo / produtos actions | — | Não | Regra de decisão em core (`guard:core`) |

---

## Orquestradores cross-domínio (não são god modules)

| Orquestrador (RPC / fluxo) | Domínios tocados | Efeitos por dono |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4` | sales + inventory | sales: venda/itens/pagamentos; inventory: baixa `estoque`; **não** cash mov / **não** `saldo_atual` |
| `cancelar_venda_transacional` | sales + inventory + cash(A) | sales: status + `devolucoes`; inventory: reposição; cash: `saldo_atual` − DINHEIRO (best-effort pós ADR-002) |
| `devolver_ou_trocar_venda` | sales + inventory + cash(A) | sales: `devolucoes`; inventory: estoque; cash: `saldo_atual` (ainda pode falhar D-A3) |
| `criar_produto_com_estoque_inicial` | products + inventory | products: `produtos`; inventory: `estoque` (+ ajuste/kardex opcional) |

Apps só chamam o orquestrador; **não** reimplementam a política no TypeScript da UI.

---

## Checklist ADR-005 / CAIXA-002

- [x] `vendas_pagamentos` → **sales**
- [x] \(E(c)\) + `movimentacoes_caixa` → **cash**
- [x] Venda **não** writer de `movimentacoes_caixa`
- [x] `saldo_atual` = físico (A), não contábil
- [x] Orquestrações listadas sem “god module”
- [x] Lacunas marcadas (kardex writers detalhados; auditoria cancel; D-A4)

---

## Lacunas / legado (não corrigir no 5.1a)

| Item | Status |
|------|--------|
| Lista completa de writers SQL de `movimentos_estoque_log` | Parcial — expandir quando necessário |
| `pdv-local` sync writers vs web | Fora do escopo deste inventário (DEC-013 piloto web) |
| Inserts diretos `estoque` em `gerente/produtos/actions.ts` (cleanup) | Legado — preferir RPC atômica |
| D-A1 / D-A3 / D-A4 | Trilha Missão 5.3 |

---

## Boundary guards

Script: [`scripts/domain-boundary-guard.mjs`](../../scripts/domain-boundary-guard.mjs)  
NPM: `npm run guard:domain` (incluído em `guard:all`).
