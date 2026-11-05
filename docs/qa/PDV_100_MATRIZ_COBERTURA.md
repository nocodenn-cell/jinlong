# PDV-100 — Matriz de cobertura e rastreabilidade

**Data:** 2026-11-03 · **Relatório:** [PDV_100_RELATORIO_VALIDACAO.md](PDV_100_RELATORIO_VALIDACAO.md)

Legenda de status: **PASSOU** (executado e comprovado) · **FALHOU** (defeito reproduzido) · **NÃO TESTADO** · **BLOQUEADO**.

Colunas: *Requisito* (item da sprint), *Cenário* (o que foi feito), *Automatizado* (teste existente que cobre o comportamento, se houver), *Evidência* (como foi comprovado nesta rodada).

Resumo: **98 cenários · PASSOU 41 · FALHOU 1 (corrigido) · NÃO TESTADO 56 · BLOQUEADO 0**

## A. Abertura e operação do caixa

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| A1 | Login do operador | Login com `e2e-operador@localhost.test` | PASSOU (ressalva D-03) | `e2e/caixa.spec.ts` (não executado) | Auth 200, `usuarios` lido; redirect falhou na 1ª tentativa |
| A2 | Empresa e loja | Identificação da loja no caixa | PASSOU | — | Cabeçalho e recibo "Matriz" |
| A3 | Abertura do caixa | Fundo R$ 200,00 | PASSOU | `CaixaAbrirTurnoModal.behavior.test.tsx` | `caixas` ABERTO, `valor_inicial 200.00` |
| A4 | Saldo inicial | Conferência do fundo | PASSOU | — | Cabeçalho "Fundo: R$ 200,00" |
| A5 | Operador responsável | Operador no cabeçalho e no vendedor | PASSOU | — | `caixas.operador_id` = operador |
| A6 | Permissões | Operador tentando ação de gerente/dono | NÃO TESTADO | — | — |

## B. Pesquisa e inclusão de produtos

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| B1 | Pesquisa pelo nome | "USB" → USB-C 2m | PASSOU | `caixa-venda.spec.ts` (não executado) | Item no carrinho, código 7898512340003 |
| B2 | Pesquisa pelo código interno | SKU interno | NÃO TESTADO | — | Seed sem `codigo_interno` |
| B3 | Código de barras | Barcode 7898512340001 digitado + Enter (simulado) | PASSOU | `useScannerDetector.test.tsx` | Garrafa adicionada |
| B4 | Vários produtos | USB + Garrafa + Chaleira | PASSOU | — | Venda 1 com 2 itens; venda 2 com 1 item |
| B5 | Inclusão repetida | USB adicionado 2× | PASSOU | — | Linha com qtd 2, R$ 45,00 |
| B6 | Alteração de quantidade | Digitação no campo de quantidade | **FALHOU → corrigido (D-01)** | `CaixaCartList.behavior.test.tsx` (2 novos) | Antes: 1,002 / 35,015. Depois: "2,5" → R$ 197,50 |
| B7 | Alteração de quantidade | Botões + / − | PASSOU | `CaixaCartList.behavior.test.tsx` | Chaleira 1 → 3, R$ 237,00 |
| B8 | Remoção de item | Botão "remover" | PASSOU | — | Carrinho volta a "Cupom vazio" |
| B9 | Cancelamento de item | Cancelamento com registro (distinto de remover) | NÃO TESTADO | — | — |
| B10 | Produto inexistente | "zzqq999" | PASSOU | — | "Código não encontrado. Busque por nome/SKU…" |
| B11 | Produto inativo | "NFE-CONC" (inativo, outra loja) | PASSOU (ressalva) | — | Mesma mensagem de inexistente; não distingue o motivo |
| B12 | Produto sem estoque | Venda sem saldo | NÃO TESTADO | — | Seed sem produto zerado na Matriz |
| B13 | Produto fracionado | Produto cadastrado como fracionado | NÃO TESTADO | — | Seed só tem UN; fração em UN é D-04 |
| B14 | Consulta de estoque | Tela de estoque na UI | NÃO TESTADO | — | Conferido no banco (estoque) |

## C. Preços e descontos

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| C1 | Preço de varejo | Itens sem regra | PASSOU | — | 22,50 e 89,90 = `produtos.preco_varejo` |
| C2 | Seleção manual de preço | Escolha de tabela | NÃO TESTADO | — | — |
| C3 | Regra de atacado | USB com `preco_atacado` 17,90 | NÃO TESTADO | `caixa-atacado-quantidade-minima.spec.ts` (não executado) | Qtd 2 ficou em varejo (faixa não atingida) |
| C4 | Quantidade mínima atacado | Atingir a faixa | NÃO TESTADO | — | — |
| C5 | Quantidade abaixo do limite | Abaixo da faixa | NÃO TESTADO | — | — |
| C6 | Desconto permitido | Desconto comercial no dinheiro | NÃO TESTADO | — | — |
| C7 | Desconto acima do limite | Acima de 10% | NÃO TESTADO | — | — |
| C8 | Desconto sem autorização | Sem token de gerente | NÃO TESTADO | — | — |
| C9 | Arredondamentos | Totais e troco | PASSOU | — | Troco 15,10; fechamento 434,90 |

## D. Formas de pagamento

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| D1 | Dinheiro e troco | Recebido 150,00 para total 134,90 | PASSOU (ressalva D-05) | — | Troco 15,10 no visor; `vendas_pagamentos` 134,90 (sem valor recebido) |
| D2 | PIX simulado (individual) | Venda só em PIX | NÃO TESTADO | — | Usado apenas dentro do pagamento dividido |
| D3 | Cartão simulado (individual) | Débito/crédito | NÃO TESTADO | — | Aparece como "Registrado no Jinlong" no fechamento |
| D4 | Crédito de cliente | Uso de crédito | NÃO TESTADO | — | — |
| D5 | Pagamento dividido 2 formas | Dinheiro 100,00 + PIX 137,00 | PASSOU | — | `vendas_pagamentos`: 100,00 + 137,00 = 237,00 |
| D6 | Pagamento dividido 3 formas | Três formas | NÃO TESTADO | — | — |
| D7 | Pagamento insuficiente | Recebido menor que total | NÃO TESTADO | — | Indicador "Falta" visível; botão não foi acionado |
| D8 | Valor inválido | Texto ou negativo | NÃO TESTADO | — | — |
| D9 | Recebimento parcial / saldo devedor | Venda a prazo | NÃO TESTADO | — | — |

## E. Vendas em espera

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| E1 | Colocar em espera | "Nova venda" com itens | PASSOU | `useCaixaVendasEmEspera.behavior.test.tsx` | `vendas_em_espera` Pedido #1 `EM_ESPERA` |
| E2 | Criar outra venda | Nova venda após espera | PASSOU | — | Carrinho novo com USB |
| E3 | Recuperar a primeira venda | Clique em "Pedido #1" | PASSOU | — | "Venda #1 retomada", R$ 237,00 |
| E4 | Conferir itens e quantidades | Após recuperar | PASSOU | — | Chaleira qtd 3; sem baixa de estoque na espera |
| E5 | Recuperar após atualizar a página | Reload com venda em espera | NÃO TESTADO | — | — |
| E6 | Isolamento entre operadores | Dois operadores | NÃO TESTADO | — | — |
| E7 | Recuperação indevida | Venda de outro usuário | NÃO TESTADO | — | — |

## F. Finalização de vendas

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| F1 | Venda simples | Uma linha, dinheiro | PASSOU | `caixa-venda.spec.ts` (não executado) | `vendas` CONCLUIDA 134,90 |
| F2 | Vários produtos | USB + Garrafa | PASSOU | — | 2 itens no `venda_eventos` e no kardex |
| F3 | Venda fracionada | Quantidade decimal | NÃO TESTADO | — | Ver D-04 |
| F4 | Pagamento dividido | Ver D5 | PASSOU | — | Ver D5 |
| F5 | Cliente identificado | Venda com cliente | NÃO TESTADO | — | — |
| F6 | Venda com crédito | Crédito de cliente | NÃO TESTADO | — | — |
| F7 | Gerar comprovante | Recibo após finalizar | PASSOU | — | Recibo com itens, total e pagamentos |
| F8 | Consultar histórico | Lista de vendas na UI | NÃO TESTADO | — | Conferido no banco |
| F9 | Reabrir/visualizar comprovante | Reimpressão | NÃO TESTADO | — | — |
| F10 | Registro único | Cada venda gravada uma vez | PASSOU | — | 2 finalizações → 2 vendas |

## G. Cancelamentos e devoluções

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| G1 | Cancelamento de item | Item já finalizado | NÃO TESTADO | — | — |
| G2 | Cancelamento de venda | Venda concluída | NÃO TESTADO | `cancelarVendaContrato.integration.test.ts` (não executado) | — |
| G3 | Cancelamento com autorização | Token de gerente | NÃO TESTADO | — | — |
| G4 | Devolução parcial | Parte dos itens | NÃO TESTADO | — | — |
| G5 | Devolução integral | Todos os itens | NÃO TESTADO | — | — |
| G6 | Troca | Quando disponível | NÃO TESTADO | — | — |

## H. Fechamento de caixa

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| H1 | Conferir vendas | Vendas em dinheiro do turno | PASSOU | — | "Vendas em dinheiro (2): + R$ 234,90" |
| H2 | Recebimentos por modalidade | PIX, cartão | PASSOU | — | PIX 137,00 em `caixas_fechamento_formas` |
| H3 | Dinheiro físico esperado | Saldo do sistema | PASSOU | — | 200,00 + 234,90 = 434,90 |
| H4 | Suprimento | Entrada de dinheiro | NÃO TESTADO | — | — |
| H5 | Sangria | Retirada de dinheiro | NÃO TESTADO | — | — |
| H6 | Fechamento | Confirmação com valor contado | PASSOU | — | `caixas` FECHADO em 16:28 |
| H7 | Diferenças | Contado 430,00 | PASSOU | — | Diferença −4,90 em `caixas` e `caixas_fechamento_formas` |
| H8 | Histórico do fechamento | Consulta na UI | NÃO TESTADO | — | Registro conferido no banco |
| H9 | Restrições de reabertura | Reabrir caixa fechado | NÃO TESTADO | — | — |

## I. Integridade dos dados (Etapa 3)

| ID | Requisito | Cenário | Status | Automatizado | Evidência |
|---|---|---|---|---|---|
| I1 | Nenhuma venda duplicada | Contagem após operações | PASSOU | — | 2 vendas para 2 finalizações |
| I2 | Nenhuma baixa de estoque duplicada | Estoque antes/depois | PASSOU | — | USB −2, Garrafa −1, Chaleira −3 |
| I3 | Nenhum pagamento duplicado | Soma dos pagamentos | PASSOU | — | 371,90 = soma das vendas |
| I4 | Nenhuma movimentação sem origem | Kardex | PASSOU | — | 3 `SAIDA_VENDA`, todas com `venda_id` |
| I5 | Nenhum saldo negativo | Estoque após vendas | PASSOU | — | Todos os saldos positivos |
| I6 | Caixa × vendas | Fechamento × vendas | PASSOU | — | Sistema 434,90 = fundo + dinheiro |
| I7 | Financeiro conciliado | `contas_receber`, `movimentos_financeiros` | NÃO TESTADO | — | Vazios após vendas (D-07) |
| I8 | Auditoria | Usuário, data, operação | PASSOU (parcial) | — | `venda_eventos` com operador e caixa; sem evento para abertura/fechamento |
| I9 | Operações privilegiadas sem autorização | Negativas | NÃO TESTADO | — | — |
| I10 | Isolamento entre empresas | Dados de outra empresa | NÃO TESTADO | — | — |

## R. Resistência e recuperação (Etapa 4)

| ID | Cenário | Status | Evidência |
|---|---|---|---|
| R1 | Dois operadores vendendo ao mesmo tempo | NÃO TESTADO | — |
| R2 | Dois operadores com o mesmo produto | NÃO TESTADO | — |
| R3 | Cliques repetidos em "Finalizar" | NÃO TESTADO | — |
| R4 | Atualização da página durante operação | NÃO TESTADO | — |
| R5 | Perda simulada de conexão | NÃO TESTADO | — |
| R6 | Repetir operação já concluída | NÃO TESTADO | — |
| R7 | Recuperação de venda após falha de interface | NÃO TESTADO | — |
| R8 | Expiração de sessão | NÃO TESTADO | — |
| R9 | Operação sem permissão | NÃO TESTADO | — |

## U. Usabilidade (Etapa 5)

| ID | Cenário | Status | Evidência |
|---|---|---|---|
| U1 | Foco automático no campo de busca | PASSOU | Campo recebe foco após adicionar item |
| U2 | Atalhos de teclado | NÃO TESTADO | Rodapé mostra Ctrl+B e F4; não acionados |
| U3 | Clareza das mensagens de erro | PASSOU | Mensagem de produto inexistente com orientação |
| U4 | Resoluções e cliques medidos | NÃO TESTADO | Viewport mobile observado; medição não feita |

## X. Equipamentos (Etapa 6)

| ID | Equipamento | Status | Evidência |
|---|---|---|---|
| X1 | Leitor de código de barras físico | NÃO TESTADO | Simulado por digitação (B3) |
| X2 | Impressora térmica | NÃO TESTADO | Botão "Imprimir (térmica)" visível, não acionado |
| X3 | Versão desktop Tauri | NÃO TESTADO | `pdv-local` não iniciado |

## T. Testes automatizados (regressão)

| ID | Suíte | Status | Evidência |
|---|---|---|---|
| T1 | Vitest `app/caixa` (58 arquivos) | PASSOU | 393 testes, todos passaram |
| T2 | Playwright `e2e/caixa-*.spec.ts` | NÃO TESTADO | Não executados; baseURL a confirmar |

## Rastreabilidade de defeitos

| Defeito | Cenário | Correção | Teste de regressão |
|---|---|---|---|
| D-01 quantidade corrompida | B6 | `CaixaCartList.tsx` (`rascunho`, `onBlur`) | `CaixaCartList.behavior.test.tsx` (2 testes) |
| D-02 apagar campo remove linha | B6 | Mesma correção | Mesmos testes |
| D-03 redirect pós-login | A1 | Não corrigido | Pendente de reteste |
| D-04 fração em UN | B13, F3 | Decisão de produto | — |
| D-05 troco não persistido | D1 | Não corrigido | — |
| D-06 espera após fechamento | E1, H6 | Não corrigido | — |
| D-07 financeiro vazio | I7 | Confirmar desenho | — |
| D-08 Enter antes da lista | B1 | Não corrigido | — |
| D-09 Recebido residual | D1 | Não corrigido | — |
| D-10 consultas repetidas a `usuarios` | — | Não confirmado | — |

---

## Atualização PDV-100.1 (2026-11-03)

Os status acima são da rodada PDV-100. Esta seção registra o que mudou depois.

| ID | Cenário | Novo status | Evidência |
|---|---|---|---|
| A6 | Permissões negativas (operador) | NÃO TESTADO | pendente |
| B6 | Quantidade fracionada em UN | PASSOU (regra D-04) | `CaixaCartList.behavior.test.tsx`, `caixa-golden-flow-cycle5.spec.ts` ("quantidade fracionada em produto UN é recusada") |
| B13 | Produto fracionado (KG/M) | PASSOU (unitário) | `lib/format/unidadeMedida.test.ts`; sem produto KG no seed |
| C3 | Regra de atacado com faixa | PASSOU (E2E, faixa criada pelo teste) | `caixa-atacado-quantidade-minima.spec.ts` |
| C6–C8 | Desconto manual/alçada | PASSOU (unitário, segurança) | `caixaPrecoAutoritativoServer.test.ts`: desconto medido contra o varejo do servidor |
| D2–D3 | PIX e débito individuais | PASSOU (financeiro, homolog) | 5 recebíveis PIX/débito configurados e recebidos pelo contrato; 5 movimentos, soma 244,50 |
| D6 | Pagamento em 3 modalidades | PASSOU | Venda 135,00 = DINHEIRO 50 + PIX 45 + DÉBITO 40 (`vendas_pagamentos`) |
| D4 | Crédito de cliente | NÃO TESTADO | Forma "crédito de cliente" não existe no caixa; saldo devedor vai a contas a receber |
| E5 | Recuperar após refresh | PASSOU (E2E) | `caixa-venda-em-espera.spec.ts` |
| F-único | Finalização repetida | NÃO TESTADO | pendente |
| G1–G6 | Cancelamentos e devoluções | NÃO TESTADO | pendente |
| H4–H5 | Suprimento e sangria | PASSOU (E2E) | `caixa-fluxos-criticos.spec.ts` (abrir → sangria → fechar) |
| H8 | Histórico do fechamento | NÃO TESTADO (UI) | conferido no banco |
| H9 | Restrição de reabertura | NÃO TESTADO | pendente |
| H-pend | Fechamento com venda em espera | PASSOU | migration 20261103120000; UI com 2 esperas bloqueou e, após descartar, fechou |
| I7 | Financeiro conciliado | PARCIAL | recebíveis conciliados por recebimento (1:1); extrato/conciliação bancária não testada |
| R1–R9 | Concorrência, cliques, perda de conexão, expiração de sessão | NÃO TESTADO | pendente |
| T1 | Vitest `app/caixa` + `lib/format` + `shared` | PASSOU | 73 arquivos, 524 testes (antes das últimas adições) |
| T2 | Playwright `e2e/caixa*.spec.ts` | PARCIAL | 23 passaram + 14 passaram na reexecução; 1 falha de estado compartilhado (ver `PDV_100_1_DEFEITOS_E_DECISOES.md`) |
| T3 | Smoke de provisionamento (contrato) | PASSOU | 4/4 em `smoke-fase1-provisionamento-homologacao.spec.ts` |
