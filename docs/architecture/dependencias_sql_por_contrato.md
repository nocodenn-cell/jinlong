# Dependências SQL por contrato/adapter

**Decisão D-02 (2026-09-30):** o SQL específico do Jinlong **permanece no hospedeiro** (`backend/supabase/migrations`, ADR-011). Migrations, RPCs e RLS **não** são empacotados como ativos reutilizáveis nesta etapa. As fronteiras são modeladas por **contratos (`shared-core`) + adapters (web)**, e as dependências SQL de cada adapter ficam **explícitas aqui**. A distribuição de SQL será reavaliada quando existir um segundo produto real (D-01).

## Método e limites
- Levantamento automático por regex sobre `.from('<nome>')` e `.rpc('<nome>')` nos arquivos adapter não-teste (`pdv-importados/app/**`, `pdv-importados/lib/adapters/**`).
- Existência verificada por `SELECT` em `pg_class`/`pg_proc` no Postgres **local** do Supabase (372 das 373 migrations). Não é leitura de produção.
- **Não captura** dependências implícitas: policies RLS, triggers, defaults, grants e funções chamadas dentro das RPCs. Essas estão resumidas na seção 7 e nos documentos citados.
- Contratos e adapters listados são os existentes; nenhum contrato novo foi criado.

## 1. Products — `shared-core/src/products` (`ProductReader`, `ProductWriter`, `ProductPriceReader`)
| Adapter | Tabelas/views | RPCs |
|---|---|---|
| `app/admin/produtos/productReader.ts` | `produtos`, `estoque` (read-through) | `list_produtos_gerente_filtrados` (**não** é SECURITY DEFINER) |
| `app/admin/produtos/productWriter.ts` + `lib/adapters/supabase/criarProdutoComEstoqueInicialRpc.ts` | `produtos` | `criar_produto_com_estoque_inicial` (SECURITY DEFINER) |
| `app/admin/produtos/productUpdater.ts` | `produtos` | `atualizar_produto_com_faixa_atacado` |
| `app/admin/produtos/productLifecycle.ts` | `produtos` | — |
| `app/admin/produtos/productExclusion.ts` | `produtos`, `estoque`, `regras_preco` | `excluir_linha_estoque_produto` |
| `app/admin/produtos/productPriceReader.ts` | — | `calcular_preco_produto` (autoridade de preço, ADR-007) |

Acoplamento: a criação grava estoque inicial na mesma transação (products + inventory); preço efetivo é decidido no Postgres.

## 2. Customers — `shared-core/src/customers` (`CustomerReader`, `CustomerWriter`, …)
| Adapter | Tabelas/views | RPCs |
|---|---|---|
| `customerReader.ts` | `v_clientes_gerente` (view) | — |
| `customerWriter.ts`, `customerUpdater.ts` | `clientes` | — |
| `customerExclusion.ts` | `clientes`, `v_clientes_gerente`, `contas_receber` | — |

Acoplamento: a exclusão consulta `contas_receber` (financial).

## 3. Inventory — `shared-core/src/inventory` (`InventoryReader`, `InventoryMovementReader/Writer`, serviços de ajuste)
| Adapter | Tabelas/views | RPCs |
|---|---|---|
| `inventoryReader.ts` | `estoque` | — |
| `inventoryMovementReader.ts` | `v_kardex_unificado` (view) | — |
| `inventoryAdjustment.ts` | — | `ajustar_estoque_manual` (2 sobrecargas no catálogo local) |
| `inventoryMovementWriter.ts` | — | `transferir_estoque_seguro`, `confirmar_remessa_entrada`, `importar_nfe_transacao`, `registrar_conferencia_nfe`, `confirmar_importacao_nfe` |

Acoplamento: `estoque` também é escrito por RPCs de **venda, cancelamento e devolução** fora deste contrato (ver evidências D-09).

## 4. Financial — `shared-core/src/financial` (`ReceivableReader/Writer`, `PayableReader`, serviços de pagamento)
| Adapter | Tabelas/views | RPCs |
|---|---|---|
| `receivableReader.ts` | `contas_receber`, `clientes`, `liquidacoes_receber` | — |
| `receivableWriter.ts` | `contas_receber` | `registrar_liquidacao_receber`, `estornar_liquidacao_receber` |
| `payableReader.ts` | `contas_pagar` | — |
| `payablePayment.ts` | — | `registrar_pagamento_contas_pagar`, `cancelar_conta_pagar` |

Acoplamento: `receivableReader` lê `clientes` (customers); o resultado do serviço de pagamento de contas a pagar inclui `caixaId` e `movimentacaoCaixaId` (contrato em `shared-core/src/financial`), ou seja, o pagamento pode gerar movimentação de caixa.

## 5. Cash — `shared-core/src/cash` (`CashSessionReader/Writer`, `CashMovementReader/Writer`)
| Adapter | Tabelas/views | RPCs |
|---|---|---|
| `app/caixa/server/cashSession.ts` | `caixas` | `obter_status_caixa_operador`, `fechar_caixa_atomico` |
| `app/caixa/server/cashMovementReader.ts` | `movimentacoes_caixa` | — |
| `app/caixa/server/cashMovementWriter.ts` | — | `registrar_movimentacao` |

Acoplamento: `caixas.saldo_atual` também é alterado por cancelamento e devolução de venda (fora deste contrato).

## 6. Existência no catálogo (verificada no Postgres local)
- Tabelas com RLS habilitado: `caixas`, `clientes`, `contas_pagar`, `contas_receber`, `estoque`, `liquidacoes_receber`, `movimentacoes_caixa`, `produtos`, `regras_preco`.
- Views (sem RLS próprio; dependem das tabelas-base): `v_clientes_gerente`, `v_kardex_unificado`.
- Todas as 18 RPCs citadas existem em `public`; 17 são SECURITY DEFINER e `list_produtos_gerente_filtrados` não é.

## 7. Dependências SQL transversais (não modeladas por estes contratos)
- **RLS:** 132 policies em `public`; 62 usam subquery inline em `usuarios`, 13 usam helpers `auth_usuario_*` (ver `modularizacao_sprint1_evidencias.md`, D-10). Todo adapter acima depende do escopo por `loja_id`/perfil definido nessas policies.
- **Venda:** `finalizar_venda_transacional_canonica_v4` escreve `estoque` (via `decrementar_estoque_seguro`), `vendas_pagamentos` e dispara triggers (caixa, comissão, fiscal). **Não** é chamada por nenhum dos adapters acima e está sob o feature freeze do piloto.
- **Escrita de estoque/caixa por outras RPCs:** cancelamento e devolução fazem `UPDATE estoque` e `UPDATE caixas` diretos (D-09).

## 8. Uso prático
Para um segundo produto, **nada aqui é distribuído como pacote**. Levar um contrato exige reescrever o adapter contra o schema do novo hospedeiro; esta lista delimita o que esse adapter precisa encontrar (tabelas, views, RPCs e semântica de RLS).
