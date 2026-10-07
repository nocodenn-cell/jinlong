# Inventário de implementação real — Domínios Jinlong

| Campo | Valor |
|--------|--------|
| **Missão** | Validar governança contra o Jinlong real |
| **Data** | 2026-10-07 |
| **Branch** | `cursor/auditoria-ssot-dominios-regras-7da4` |
| **Mapa confrontado** | [MAPA_DOMINIOS_REGRAS_NEGOCIO.md](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) |
| **Relatório de violações** | [AUDITORIA_SSoT_DOMINIOS.md](./AUDITORIA_SSoT_DOMINIOS.md) |
| **Escopo** | Domínios operacionais apenas — sem módulos futuros |
| **Método** | Grep + leitura de migrations/app/shared-core; sem alterar banco remoto |

> Este inventário descreve o que **existe no código e nas migrations**, não o que o mapa declara. Divergências → relatório SSoT.

---

## 1. Produtos (`products`)

### Tabelas / views
| Artefato | Papel |
|----------|--------|
| `produtos` | SKU, preços cadastro, custo, status, campos fiscais |
| `categorias`, `marcas` | Taxonomia |
| `precos_atacado` | Tiers (SSoT efetivo de atacado D0) |
| `regras_preco` | Legado — fora da cadeia automática |
| `vinculos_fornecedor_produto` | De-Para NF-e |
| `gtin_lookup_cache` | Enrichment |
| `historico_precos_produto`, `historico_tiers_crud` | Auditoria preço/tiers |
| `produto_create_requests` | Idempotência create |

### RPCs / triggers relevantes
| Nome | Papel |
|------|--------|
| `calcular_preco_produto` | Preço efetivo venda (Postgres) |
| `criar_produto_com_estoque_inicial` | Create atômico + estoque opcional |
| `atualizar_produto_com_faixa_atacado` | Update + sync faixa |
| `atualizar_preco_varejo_produto` | RPC órfã (sem caller app) |
| `list_produtos_gerente_filtrados` | Listagem |
| `trg_produtos_margem_*` / `trg_precos_atacado_margem_*` | Guard margem |
| `trg_historico_precos_produto` | Histórico |

### App / shared-core
| Camada | Path |
|--------|------|
| UI SSoT | `/admin/catalogo` → `app/admin/produtos/*` |
| Actions legado | `app/gerente/produtos/*` |
| Writers | `productWriter.ts`, `productUpdater.ts`, `productLifecycle.ts` |
| Preço web | `caixaPrecoProduto.impl.ts` → RPC |
| Preço offline | `shared-core/pricing/calcularPrecoCanonico.ts` + `pdv-local` |
| Margem UI | `produtoForm.margem.ts`, `MargemCell.tsx` (display only) |
| Tiers CRUD | `precosAtacadoActions.ts` |

### Escrita cross-domínio observada
- `importar_nfe_transacao` / `confirmar_importacao_nfe` INSERT/UPDATE `produtos` (custo, NCM, barcode, varejo inventado custo×1.5)

---

## 2. Estoque (`inventory`)

### Tabelas / views
| Artefato | Papel |
|----------|--------|
| `estoque` | Saldo `quantidade_atual` por loja+SKU |
| `movimentos_estoque_log`, `tipos_movimento_estoque` | Kardex |
| `estoque_baixas` | Idempotência baixa venda |
| `estoque_reposicoes_cancelamento` / `_devolucao` | Reposição |
| `remessas`, `remessa_itens` | Recebimento sem NF |
| `v_estoque_baixo`, `v_kardex_unificado` | Leitura |
| `importacoes_nfe*` | Processo NF-e (orquestra inventory+financial) |

### RPCs que mutam saldo (lista real — completa o mapa)
| RPC | Efeito |
|-----|--------|
| `ajustar_estoque_manual_seguro` / `ajustar_estoque_manual` | Ajuste absoluto |
| `criar_produto_com_estoque_inicial` | INSERT + ajuste opcional |
| `decrementar_estoque_seguro` | Baixa venda |
| `transferir_estoque_seguro` | Transferência |
| `confirmar_remessa_entrada` / `criar_confirmar_remessa_entrada` | Entrada remessa |
| `receber_ordem_compra` | Entrada OC |
| `confirmar_importacao_nfe` | Entrada NF-e |
| `importar_nfe_transacao` | INSERT linha qty 0 |
| `cancelar_venda_transacional` | Reposição |
| `devolver_ou_trocar_venda` | Reposição |
| `excluir_linha_estoque_produto` | DELETE linha |

### App
| Entry | RPC |
|-------|-----|
| `inventoryAdjustment.ts` | ajuste seguro |
| `inventoryMovementWriter.ts` | transfer / remessa / NF-e |
| `recebimento/actions.ts` | remessa atômica |
| `compras/actions.ts` | `receber_ordem_compra` |
| `caixaVendas.impl.ts` | cancel |
| `devolverOuTrocarVenda.impl.ts` | devolver |
| sync-outbox | `decrementar_estoque_seguro` |

### Achados de fronteira
- **Nenhum** `.from('estoque').update` no app de produção.
- Dívida: `garantirLinhaEstoque` / `criarLinhaEstoqueZerada` INSERT qty 0 fora de RPC.
- Reservas: **não existem**; disponibilidade ≈ `quantidade_atual`.

---

## 3. Vendas (`sales`)

### Tabelas
`vendas`, `itens_venda`, `vendas_pagamentos`, `devolucoes`, `vendas_em_espera`, `descontos_venda`, `vendas_canceladas_auditoria`

### RPCs
| Nome | Papel |
|------|--------|
| `finalizar_venda_transacional_canonica_v4` | Online canônico |
| `…_v4_unscoped` | Interno (REVOKE app) |
| `registrar_venda_com_itens` | Offline/sync |
| `cancelar_venda_transacional` | Cancel |
| `devolver_ou_trocar_venda` | Devolução/troca |
| v2/v3 | Stub `LEGACY_DISABLED` |

### App
`caixaVendas.impl.ts`, `finalizarVendaValidation.ts`, `unifiedCartStore` (totais espelho), gate `scripts/rpc-gate-guard.mjs`

### Cálculos
- Totais: pré-check TS + autoridade RPC (`TOTAIS_DIVERGENTES`)
- Preço unitário: RPC / `calcularPrecoCanonico`
- Parcial online → `contas_receber` com `venda_id`
- Offline `registrar_venda_com_itens`: **sem** criação de CR parcial

---

## 4. Caixa (`cash`)

### Tabelas
`caixas`, `movimentacoes_caixa`, legado `movimentos_caixa`

### Autoridade vs cache
| Conceito | Artefato |
|----------|----------|
| Esperado \(E(c)\) | `internal.valor_sistema_dinheiro` ← `calcular_valor_sistema_dinheiro_caixa` |
| Cache físico | `caixas.saldo_atual` — comentário C3: *nenhuma decisão financeira pode ler* |
| Sync cache | `internal.sincronizar_saldo_cache` (usado em devolver; **não** em todos writers) |

### Writers de `saldo_atual` (reais)
1. Abertura app INSERT (`cashSession.ts`)
2. Trigger `trg_vendas_pagamentos_credita_caixa` (venda DINHEIRO)
3. `registrar_movimentacao` / `aprovar_movimentacao`
4. `cancelar_venda_transacional` (UPDATE incremental)
5. Liquidação/estorno AR DINHEIRO
6. `sincronizar_saldo_cache` (devolver)

### App
`cashSession.ts`, `cashMovementWriter.ts`, `caixaFechamentoServer.ts` (lê E(c)), UI turno usa `valorSistemaDinheiro`

### Consumidor perigoso
`financeiro_painel` → `sum(saldo_atual)` como `saldo_pdv` → UI `FinanceiroWorkspace` “Dinheiro nos PDVs abertos”

---

## 5. Financeiro (`financial`)

### Tabelas
`contas_receber`, `liquidacoes_receber`, `contas_pagar`, `contas_pagar_pagamentos`, `categorias_financeiras`, `contas_financeiras`, `movimentos_financeiros`, `financeiro_comandos`, `financeiro_recebiveis_venda`, comissões*

### RPCs / comandos
| Nome | Papel |
|------|--------|
| `registrar_liquidacao_receber` | Liquidar AR |
| `registrar_pagamento_contas_pagar` | Pagar AP |
| `financeiro_comando` | CRIAR_AR/AP, BAIXAR_*, ledger |
| `financeiro_painel` | KPIs + listas |
| `confirmar_importacao_nfe` | INSERT AP (se houver duplicatas) |

### App
`receivableWriter.ts`, `receivableReader.ts`, `payablePayment.ts`, `gerente/financeiro/actions.ts`, `financeiroLojaActions.ts`

### Origem
- CR parcial: `venda_id` (unique)
- CR manual / painel: `venda_id` nullable
- AP NF-e: `nfe_importacao_id`
- AP manual: sem documento obrigatório

---

## 6. Fiscal (`fiscal`)

### Tabelas
`documentos_fiscais_pendentes`, `documentos_fiscais_eventos`, `documentos_fiscais_dlq`, config provider

### RPCs / jobs
`fiscal_enfileirar_documento_venda`, `fiscal_claim_*`, `fiscal_marcar_*`, `fiscal_reprocessar_documento`, Edge `fiscal-worker`, cron pg

### App
`caixaFiscalEnqueueServer.ts`, sync-outbox enqueue, UI fila `/admin/financeiro?tab=fiscal`

### Bypass
`enfileirarDocFiscalStub` — INSERT direto em `documentos_fiscais_pendentes` (`gerente/financeiro/actions.ts`)

---

## 7. Clientes (`customers`)

| Artefato | Path |
|----------|------|
| Tabela | `clientes` |
| Writer canônico | `admin/clientes/customerWriter.ts` |
| UI | `/admin/clientes` |
| PDV | search only |
| Legado | `criarCliente` em `gerente/financeiro/actions.ts` (INSERT direto; sem callers UI encontrados) |

---

## 8. Fornecedores (`suppliers`)

| Artefato | Path |
|----------|------|
| Tabela | `fornecedores` |
| UI SSoT | `/admin/fornecedores` → `gerente/fornecedores/actions.ts` |
| Inline | `FornecedorCombobox` no form de produto (dívida entity-ssot) |
| NF-e | RPC pode INSERT/UPDATE fornecedor |

---

## 9. Compras (`purchases`) — parcial

### Tabelas
`ordens_compra`, `ordens_compra_itens`, vínculo `importacoes_nfe.ordem_compra_id` (FK desde mig. 20260918)

### RPCs
`receber_ordem_compra`, helpers `_oc_abater_por_produto`, `_oc_atualizar_estado`

### Três vias de entrada (não equivalentes economicamente)
1. OC → `receber_ordem_compra` → estoque (**sem** AP / **sem** custo)
2. Remessa → `criar_confirmar_remessa_entrada` → estoque (**sem** AP)
3. NF-e → `confirmar_importacao_nfe` → estoque + custo opcional + AP **somente se** `importacoes_nfe_duplicatas` tiver linhas

### App
`gerente/compras/actions.ts`, recebimento estoque, importar-nfe

---

## 10. Orquestradores cross-domínio (reais)

| Fluxo | Inicia | Contrato | Escreve | Idempotência |
|-------|--------|----------|---------|--------------|
| Venda | PDV | `finalizar_venda_*_v4` | sales + inventory (−) + CR se parcial + trigger cash A | `client_request_id` / unique |
| Cancel | PDV/admin | `cancelar_venda_transacional` | sales + inventory (+) + cash A + AR | auditoria cancel |
| Devolver | admin | `devolver_ou_trocar_venda` | sales + inventory + cash (sync cache) | retry auth C3 |
| Create SKU+estoque | catálogo | `criar_produto_com_estoque_inicial` | products + inventory | `produto_create_requests` |
| NF-e confirm | estoque UI | `confirmar_importacao_nfe` | inventory + products(custo) + financial(AP?) | status `FOR UPDATE` |
| OC receber | compras | `receber_ordem_compra` | inventory + OC status | parcial OC |
| Fiscal enqueue | pós-venda | `fiscal_enfileirar_*` | fiscal | unique por venda/tipo |

---

## 11. Divergências mapa × implementação (resumo)

| Declaração do mapa | Realidade |
|--------------------|-----------|
| Writers inventory canônicos listados (subset) | Faltam cancel/devolver/OC/`confirmar_importacao_nfe`/`ajustar_…_seguro` |
| Venda não incrementa `saldo_atual` | Trigger **credita** `saldo_atual` em DINHEIRO |
| UX-03 OC sem FK em NF-e | FK `ordem_compra_id` **existe** em `importacoes_nfe`; remessa ainda textual |
| Financeiro não usa `saldo_atual` como decisão | `financeiro_painel.saldo_pdv = sum(saldo_atual)` |
| Importações nacionais = estoque+AP | AP só com duplicatas; remessa/OC sem AP |
