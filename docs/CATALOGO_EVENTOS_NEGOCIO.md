# Catálogo Oficial de Eventos de Negócio — FastProduct / Jīn Lóng ERP

> **Natureza:** artefato de fechamento da Rodada R1. Somente leitura. Nenhum evento novo criado.
> **Data:** 2026-08-04
> **Objetivo:** referência única de eventos. Substitui a necessidade de reler
> `AUDITORIA_ARQUITETURA_EVENTOS_JINLONG.md` §1 para saber "o que emite o quê".
> **Fonte:** `docs/AUDITORIA_ARQUITETURA_EVENTOS_JINLONG.md` (Parte 1 e 2) + migrations verificadas.

## Advertência de leitura — o que "evento" significa aqui

O sistema **não é event-driven**. Este catálogo lista **eventos de negócio** (fatos que o
domínio produz), não mensagens de um barramento. O que existe hoje:

| Nível de registro | Significado | Onde ocorre |
|---|---|---|
| **`evento`** | Ledger append-only, com `occurred_at`, ator e idempotência | `venda_eventos`, `historico_precos_produto`, `documentos_fiscais_eventos` |
| **`estado`** | O fato só existe como valor atual de uma coluna de status | maioria dos domínios |
| **`linha`** | Só um `INSERT` em tabela operacional | recebimento, movimentações |
| **`nada`** | Não deixa rastro próprio | RecebimentoConferido |

**Não confundir catálogo com implementação.** Listar `OrdemCompraConfirmada` aqui **não** significa
que existe um evento persistido — significa que o negócio produz esse fato, e a coluna
"Auditoria" declara honestamente como (ou se) ele é registrado.

**Este documento não autoriza criar ledger novo.** Fazer isso é decisão de R2.

---

## 1. Produto

| Evento | Origem | Responsável | Auditoria | Tabela | Trigger | RPC | Consumidores |
|---|---|---|---|---|---|---|---|
| **ProdutoCriado** | `/admin/catalogo`, import CSV, NF-e | GERENTE+ | `linha` | `produtos`, `estoque` | — | `criar_produto_com_estoque_inicial` (270) | Estoque, PDV |
| **ProdutoAtualizado** | `/admin/catalogo` | GERENTE+ | `linha` | `produtos` | — | `ProductUpdater` → `UPDATE` | Relatórios, PDV |
| **PrecoAlterado** | `/admin/catalogo` | GERENTE+ | **`evento`** (append-only) | `historico_precos_produto` | `trg_historico_precos_produto` | — | PDV, Relatórios |
| **ProdutoPublicado** | `/admin/catalogo` | GERENTE+ | `estado` | `produtos.status_publicacao` | — | `ProductLifecycle` | PDV |
| **ProdutoInativado** | `/admin/catalogo` | GERENTE+ | `estado` | `produtos.status_publicacao` | — | `ProductLifecycle` | PDV, Relatórios |
| **FaixaAtacadoDefinida** | modal do produto | GERENTE+ | `linha` | `precos_atacado` | `trg_fn_precos_atacado_margem` | — | PDV (RN-029) |

## 2. Compras e Recebimento

| Evento | Origem | Responsável | Auditoria | Tabela | Trigger | RPC | Consumidores |
|---|---|---|---|---|---|---|---|
| **OrdemCompraCriada** | `/admin/compras` | GERENTE+ | `linha` | `ordens_compra` | — | `INSERT` direto | Recebimento |
| **OrdemCompraConfirmada / EmTransito / Cancelada** | `/admin/compras` | GERENTE+ | `estado` | `ordens_compra.status` | — | `UPDATE` direto | Recebimento |
| **RecebimentoIniciado** | `/admin/estoque/recebimento` | GERENTE+ | `linha` | `remessas` (`EM_CONFERENCIA`) | — | `INSERT` | — |
| **RecebimentoConferido** | `/admin/estoque/recebimento` | GERENTE+ | **`nada`** — sem registro próprio | `remessas` (`CONFERIDO`/`DIVERGENTE`) | — | `registrar_conferencia_remessa` (`20260801120000`) | Estoque (ADR-004) |
| **RecebimentoConfirmado** | `/admin/estoque/recebimento` | GERENTE+ | `estado` + `linha` | `remessas`, `estoque` | — | `confirmar_remessa_entrada` (034) | Estoque, Financeiro |
| **OrdemCompraRecebida** | `/admin/compras` | GERENTE+ | `estado` + `linha` | `ordens_compra`, `estoque` | — | `receber_ordem_compra` (110) | Estoque, Compras |
| **NFeImportada** | `/admin/estoque/importar-nfe` | GERENTE+ | `linha` | `produtos`, `estoque`, `contas_pagar`, `fornecedores` | — | `importar_nfe_transacao` | Estoque, Produtos, Financeiro |

## 3. Estoque

| Evento | Origem | Responsável | Auditoria | Tabela | Trigger | RPC | Consumidores |
|---|---|---|---|---|---|---|---|
| **EstoqueAjustado** | `/admin/estoque` | GERENTE+ | `linha` (log) | `estoque`, log de movimento | `trg_estoque_anomalia` | `ajustar_estoque_manual` (269) | Relatórios |
| **EstoqueTransferido** | `/admin/estoque/transferencias` | GERENTE+ | `linha` | `estoque` ×2 | `trg_estoque_anomalia` | `transferir_estoque_seguro` | Estoque (2 lojas) |
| **EstoqueBaixadoPorVenda** | PDV (efeito interno) | sistema | `linha` | `estoque`, `estoque_baixas`, kardex | `trg_estoque_anomalia` | `decrementar_estoque_seguro` (127) | Estoque |
| **EstoqueInicialCriado** | `/admin/catalogo` | GERENTE+ | `linha` (log) | `estoque` | — | `criar_produto_com_estoque_inicial` → `ajustar_estoque_manual` | Estoque |

## 4. Vendas e Caixa

| Evento | Origem | Responsável | Auditoria | Tabela | Trigger | RPC | Consumidores |
|---|---|---|---|---|---|---|---|
| **CaixaAberto** | `/caixa` | OPERADOR | `linha` | `caixas` | — | `INSERT` (`cashSession.ts`) | Vendas |
| **VendaEmEspera** | `/caixa` | OPERADOR | `estado` | `vendas_espera` | — | `colocar_venda_em_espera` | PDV |
| **VendaFinalizada** | `/caixa`, `pdv-local` | OPERADOR | **`evento`** `SALE_REGISTERED` | `vendas`, `itens_venda`, `pagamentos`, `estoque`, `contas_receber`, `documentos_fiscais`, `comissoes` | `trg_vendas_caixa_aberto_bi/_bu`, `trg_registrar_comissao` | `finalizar_venda_transacional_canonica_v4` | Estoque, Financeiro, Fiscal, Caixa, Comissões |
| **VendaCancelada** | `/admin/vendas` | GERENTE+ | **`evento`** `SALE_CANCELLED` | `vendas`, `estoque`, `contas_receber`, `caixas` | — | `cancelar_venda_transacional` | Estoque, Financeiro, Caixa, Auditoria |
| **DevolucaoRegistrada** | `/admin/vendas` | GERENTE+ | **`evento`** `SALE_PARTIAL_RETURN` — **nunca emitido em produção** | `estoque`, devoluções, `caixas` | — | `devolver_ou_trocar_venda` (248) | Estoque, Financeiro, Caixa |
| **SangriaRealizada / SuprimentoRealizado** | `/caixa` | OPERADOR | `linha` + `estado` | `movimentacoes_caixa` | — | `registrar_movimentacao` | Caixa (RN-025, RN-026) |
| **MovimentacaoAprovada** | `/caixa` | GERENTE+ | `estado` | `movimentacoes_caixa` | — | `aprovar_movimentacao` | Caixa |
| **CaixaFechado** | `/caixa` | OPERADOR | `estado` | `caixas` | — | `fechar_caixa_atomico` (207) / `fechar_caixa_pdv_atomico` (227) | Relatórios |

## 5. Financeiro e Fiscal

| Evento | Origem | Responsável | Auditoria | Tabela | Trigger | RPC | Consumidores |
|---|---|---|---|---|---|---|---|
| **ContaReceberGerada** | Venda (pgto parcial) | sistema | `linha` | `contas_receber` | — | dentro de `finalizar_venda_..._v4` | Financeiro |
| **ContaPagarGerada** | NF-e (duplicatas) | sistema | `linha` | `contas_pagar` | — | dentro de `importar_nfe_transacao` | Financeiro |
| **PagamentoRecebido** | `/admin/financeiro` | GERENTE+ | `linha` + `estado` | `contas_receber`, liquidações | `trg_finance_context_*` | `registrar_liquidacao_receber` | Caixa |
| **PagamentoEfetuado** | `/admin/financeiro` | GERENTE+ | `linha` + `estado` | `contas_pagar`, pagamentos | `trg_finance_context_pagamento` | `registrar_pagamento_contas_pagar` | — |
| **ContaPagarCancelada** | `/admin/financeiro` | GERENTE+ | `estado` | `contas_pagar` | — | `UPDATE` direto (`payablePayment.ts`) | — |
| **DocumentoFiscalEnfileirado** | Venda | sistema | `linha` | `documentos_fiscais` | — | `fiscal_enfileirar_documento_venda` | Fiscal (RN-014) |
| **NFCeEmitida / NFCeRejeitada** | worker fiscal | sistema | **`evento`** | `documentos_fiscais_eventos` | `tg_documentos_fiscais_estado_bi/_bu` (092), backoff (093) | worker + Focus NFe | Fiscal (RN-027) |
| **ComissaoRegistrada** | Venda | sistema (trigger) | `linha` | `comissoes` | `trg_registrar_comissao` | `fn_registrar_comissao` | Funcionários (RN-028) |

## 6. Inventário

**Nenhum evento. O domínio não existe.** Fora do escopo do piloto D0
(`FEATURE_FREEZE_PILOTO.md` — OUT). Registrado para que a ausência seja deliberada, não esquecida.

---

## 7. Vocabulário canônico do único ledger existente

`venda_eventos` (mig `228`), `CHECK`:

```sql
event_type = ANY (ARRAY['SALE_REGISTERED', 'SALE_CANCELLED', 'SALE_PARTIAL_RETURN'])
```

**Três valores.** Qualquer código que emita outro `event_type` falha no `CHECK`.
Ampliar esse vocabulário é migration + decisão — não acontece em R1.

---

## 8. Leitura de governança (sem abrir frente nova)

Fatos registrados, todos já conhecidos das auditorias:

1. **Um único domínio emite evento de verdade: Vendas.** Produto (preço) e Fiscal têm ledgers
   próprios; os demais oito domínios registram apenas estado.
2. **`RecebimentoConferido` é o único fato de negócio relevante sem nenhum rastro.** É o mesmo
   ponto que ADR-004 e FLX-04 tratam — ao implementar o Pacote 4, o rastro nasce junto.
3. **`SALE_PARTIAL_RETURN` existe no vocabulário e nunca foi emitido em produção.** Não é bug
   comprovado: pode significar que nenhuma devolução parcial ocorreu. **Não verificado.**
4. **Comissão e saldo de caixa nascem de trigger**, sem linha de aplicação. Efeito correto,
   rastro invisível — relevante para quem for depurar, não para quem for implementar R1.

Nada aqui vira ticket. São características do sistema, catalogadas para que a próxima
auditoria não as redescubra como se fossem novas.
