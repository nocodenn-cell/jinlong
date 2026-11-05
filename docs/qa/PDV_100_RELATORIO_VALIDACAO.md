# PDV-100 — Relatório de validação operacional da Frente de Caixa (Jinlong)

**Data:** 2026-11-03
**Branch:** `claude/jinlong-pdv-operational-validation-56c18a` (worktree `e2e-docs-sprints-3fa0d7`)
**Parecer:** **NO-GO** para liberação operacional. A validação cobriu os fluxos básicos de venda, pagamento dividido, espera, fechamento e a conferência no banco, mas ficaram sem teste fluxos críticos (cancelamento/devolução, permissões negativas, concorrência, equipamentos) e há defeitos abertos de decisão de produto e de integridade financeira. Detalhes na seção 14.

---

## 1. Ambiente utilizado

| Item | Valor |
|---|---|
| Banco | Supabase **local** (`supabase start`, projeto `fastproduct`), `127.0.0.1:54322` (Postgres 17) |
| API | `http://127.0.0.1:54321` |
| Web PDV | Next.js dev (`pdv-importados`), porta **3002**, config `pdv-validacao-local` em `.claude/launch.json` |
| Navegador | Browser pane do app (Chromium), **não** Playwright |
| Produção | Não acessada. Nenhuma escrita fora do banco local. |
| Dinheiro/PIX/cartão/NF-e | Simulados. Nenhum pagamento real, nenhum documento fiscal emitido. |

Observações de ambiente:

- Existe um servidor Next já rodando na porta **3001** deste worktree (`next start`, PID 58728), que aponta para um Supabase de placeholder (`xyzcompany.supabase.co`). **Não foi usado nem encerrado.** O `preview_start` o reaproveitou por engano na primeira tentativa.
- O banco local estava com **450 de 457** migrations aplicadas. As 7 faltantes (`20261028100000` a `20261030100000`, incluindo `sec_token_dispositivo_vale_na_loja`) foram aplicadas somente no stack local com `supabase migration up --local --include-all`. Isso exigiu `--include-all` porque as migrations estão fora de ordem em relação ao histórico remoto (ver pendências).

## 2. Versão validada

- `pdv-importados` `0.1.0` (package.json), HEAD `5876b468` da branch.
- Migrations: 457 arquivos em `backend/supabase/migrations`, última `20261030140000_nfe_qtd_precisao`.
- Rotas: `/login`, `/caixa`. Componentes: `app/caixa/CaixaPageClient.tsx`, `CaixaCartList.tsx`, `hooks/useCaixaVendasEmEspera.ts`, `CaixaAbrirTurnoModal`.
- Tabelas/RPC observadas no banco: `caixas`, `caixas_fechamento_formas`, `vendas`, `vendas_pagamentos`, `vendas_em_espera`, `venda_eventos`, `estoque`, `movimentos_estoque_log`, `estoque_baixas`, `produtos`, `usuarios`, `contas_receber`, `movimentos_financeiros`.

## 3. Usuários e permissões de teste

Criados pelo script do projeto `npm run seed:dev-users` (`pdv-importados/scripts/seed-dev-users.mjs`), que só roda contra localhost e tem guard de ambiente. Senha de teste definida no `.env.local` (gitignored); a senha usada no login de validação foi redefinida via API admin local.

| Usuário | Perfil | Loja | Uso nesta validação |
|---|---|---|---|
| `e2e-operador@localhost.test` | OPERADOR | Matriz (`a0000001-…0001`) | Login, abertura de caixa, vendas, fechamento |
| `e2e-gerente@localhost.test` | GERENTE | Matriz | Não usado |
| `e2e-dono@localhost.test` | DONO | Matriz | Não usado |

Empresa: `e0000001-…0001` ("Empresa 1 (cliente piloto)"). Loja: Matriz (`a0000001-…0001`). Caixas de teste: `db4e6a48-…` (aberto e fechado nesta validação).

Não foram testadas as negativas de permissão (operador tentando ação de gerente) — ver matriz.

## 4. Estado inicial dos dados (fotografia antes da operação)

Capturada com `snapshot.sql` antes da primeira venda.

| Tabela | Antes |
|---|---|
| `vendas` | 0 |
| `vendas_pagamentos` | 0 |
| `vendas_em_espera` | 0 |
| `movimentos_estoque_log` | 2 (entradas NF-e de seed) |
| `caixas` | 1 (soma fundo 200,00 ao abrir) |
| `contas_receber` / `movimentos_financeiros` | 0 / 0 |

Estoque (loja Matriz) de interesse: USB-C 2m = **120**; Garrafa térmica 500ml = **40**; Chaleira silicone = **18**.

## 5. Matriz de cenários

Resultado: **PASSOU** (executado e comprovado no banco ou na UI), **FALHOU** (defeito reproduzido), **NÃO TESTADO**, **BLOQUEADO**. A matriz completa com rastreabilidade está em `docs/qa/PDV_100_MATRIZ_COBERTURA.md`.

Resumo (98 cenários): **PASSOU 41 · FALHOU 1 (B6, corrigido e retestado) · NÃO TESTADO 56 · BLOQUEADO 0**. A maior parte dos NÃO TESTADO é de cancelamentos, concorrência, permissões e equipamentos, que não foram executados nesta rodada.

Principais cenários:

| ID | Cenário | Resultado | Evidência |
|---|---|---|---|
| A1 | Login do operador | PASSOU com ressalva (D-03) | Auth 200 e linha em `usuarios` lida; redirect não ocorreu na 1ª tentativa |
| — | Teste de regressão da correção D-01/D-02 | PASSOU | Vitest 9/9 no arquivo; 393/393 na pasta `app/caixa` |
| A2 | Abertura de caixa com fundo 200,00 | PASSOU | `caixas` ABERTO, `valor_inicial 200.00`, operador correto |
| B1–B3 | Busca por nome, código de barras, inclusão de vários, repetida | PASSOU | Carrinho USB ×2 + Garrafa = 134,90 |
| B5 | Alteração de quantidade por digitação | **FALHOU → corrigido (D-01/D-02)** | Ver seção 9; reteste "2,5" → total 197,50 |
| B6 | Remoção de item | PASSOU | "remover" esvazia linha, cupom vazio |
| B9 | Produto inexistente | PASSOU | "Código não encontrado. Busque por nome/SKU…" |
| C1 | Preço varejo | PASSOU | 22,50 e 89,90 batem com `produtos.preco_varejo` |
| C12 | Arredondamentos e totais | PASSOU | 134,90 / 237,00 / 371,90 conferidos no banco |
| D1 | Dinheiro com troco | PASSOU com ressalva (D-05) | Troco 15,10 no visor; `vendas_pagamentos` grava 134,90 |
| D4 | Pagamento dividido 2 formas | PASSOU | Venda 237,00 = DINHEIRO 100,00 + PIX 137,00 |
| E1–E4 | Venda em espera, nova venda, recuperar, conferir itens | PASSOU | `vendas_em_espera`: Pedido #1 CONVERTIDA, Pedido #2 EM_ESPERA |
| F1 | Finalizar venda simples | PASSOU | `vendas` CONCLUIDA 134,90, `venda_eventos` SALE_REGISTERED |
| F2 | Venda com vários produtos | PASSOU | 2 itens, kardex 2 linhas |
| F9 | Comprovante | PASSOU | Recibo exibido com itens e pagamentos |
| F-único | Cada venda gravada uma vez | PASSOU | 2 finalizações → 2 vendas; sem duplicata |
| H1–H5 | Fechamento: vendas, modalidades, dinheiro esperado, diferença | PASSOU | Esperado 434,90; contado 430,00; diferença −4,90 em `caixas` e `caixas_fechamento_formas` |
| G1–G6 | Cancelamentos e devoluções | NÃO TESTADO | Não executado nesta rodada |
| 4.x / Etapa 4 | Concorrência, cliques repetidos, sessão | NÃO TESTADO | Não executado nesta rodada |
| Etapa 6 | Equipamentos físicos | NÃO TESTADO | Sem leitor, impressora térmica ou Tauri neste ambiente |

## 6. Evidências de execução

- Operações feitas pela interface do Browser pane (cliques e digitação). Nenhuma venda foi criada por RPC direta.
- Conferência no banco por `docker exec supabase_db_fastproduct psql` após cada venda e ao fechar o caixa (consultas listadas na seção 7).
- Logs: console do navegador sem erros durante o fluxo; `[Fast Refresh]` apenas no primeiro carregamento. Telemetria do pipeline de leitura (`scan_total_duration_ms` ~ 500–1100 ms) visível no painel DEV.
- Capturas de tela: foram tiradas durante a sessão, mas **não foram salvas como arquivos no repositório**. Vídeo não gravado. Pendência para a próxima rodada (ver seção 13).

## 7. Resultados de conferência no banco

Após as duas vendas e o fechamento:

| Módulo | Verificação | Resultado |
|---|---|---|
| Vendas | 2 vendas CONCLUIDA; totais 134,90 e 237,00 (soma 371,90) | OK |
| Pagamentos | 3 linhas: DINHEIRO 134,90; DINHEIRO 100,00; PIX 137,00 (soma 371,90) | OK, igual ao total |
| Estoque | USB 120 → 118 (−2); Garrafa 40 → 39 (−1); Chaleira 18 → 15 (−3) | OK |
| Kardex | 3 linhas `SAIDA_VENDA`, soma delta −6, todas com `venda_id` | OK, sem baixa duplicada |
| Espera | Pedido #1 `CONVERTIDA` (sem baixa até finalizar); Pedido #2 `EM_ESPERA` (sem baixa) | OK |
| Caixa | `caixas`: 1 FECHADO (fundo 200, fechamento 430, diferença −4,90, saldo 434,90) e 1 ABERTO | OK |
| Fechamento por forma | DINHEIRO sistema 434,90 × informado 430,00 = −4,90; PIX 137,00 registrado | OK |
| Auditoria | `venda_eventos`: 2 eventos SALE_REGISTERED com operador e caixa | OK (parcial: cobre venda, não caixa) |
| Financeiro | `contas_receber` 0, `movimentos_financeiros` 0 após vendas em PIX/dinheiro | **Não confirmado** (D-07) |
| Caixa (movimentos) | `movimentos_caixa` 0 | **Não confirmado** (D-07) |

Soma de conferência: fundo 200,00 + vendas em dinheiro 234,90 = 434,90 = saldo do sistema. Bate com o fechamento.

## 8. Defeitos encontrados

| ID | Severidade | Módulo | Descrição | Status |
|---|---|---|---|---|
| **D-01** | Alta | Caixa / carrinho | Digitar a quantidade diretamente no campo corrompia o valor: 1,002 · 1,003 · 35,015 observados em produtos de unidade UN. O total era recalculado com a quantidade corrompida. Causa: `<input type=number>` controlado sem rascunho; cada tecla era normalizada pelo estado. | **Corrigido** (seção 9), reteste na UI OK |
| **D-02** | Média | Caixa / carrinho | Apagar o campo de quantidade removia a linha, porque 0 é tratado como remover. Sem confirmação. | **Corrigido** junto com D-01 |
| D-03 | Média | Login | Após login com sucesso (auth 200, `usuarios` lido), a página permaneceu em `/login` na primeira tentativa; `/caixa` abriu normalmente por navegação direta. Não reproduzido em nova tentativa. | **Aberto** — reteste necessário |
| D-04 | Alta (decisão) | Caixa / produto | Quantidade fracionada é aceita para qualquer produto, inclusive `unidade_medida = UN` (ex.: 2,5 chaleiras). O código não consulta a unidade do produto no carrinho; `shared/format/quantidadeCaixa.ts` aceita 3 casas por design (balança). Precisa decisão de negócio: bloquear fração por unidade ou manter. | **Aberto** — decisão de produto |
| D-05 | Média | Pagamento / troco | Valor recebido e troco não são persistidos. `vendas_pagamentos` grava o valor líquido (134,90 para recebido 150,00). Não há trilha do troco de R$15,10. | **Aberto** |
| D-06 | Média | Espera / fechamento | Venda em espera (Pedido #2, EM_ESPERA) sobrevive ao fechamento do caixa sem aviso nem bloqueio. | **Aberto** — definir regra |
| D-07 | Média | Financeiro / caixa | Após vendas em dinheiro e PIX, `movimentos_financeiros`, `contas_receber` e `movimentos_caixa` ficaram vazios. Pode ser desenho (saldo em `caixas.saldo_atual`), mas não foi confirmado com o código do módulo financeiro. | **Aberto** — confirmar |
| D-08 | Baixa | Busca | Digitar código e apertar Enter antes da lista carregar não adiciona o item; é preciso apertar de novo. Lista ambígua ("Vários produtos batem") exige escolha. | Aberto |
| D-09 | Baixa | Caixa | Campo "Recebido" mantém o valor da venda anterior (ex.: 79,00) após esvaziar o carrinho. | Aberto |
| D-10 | Baixa | Performance | Consultas repetidas a `rest/v1/usuarios?select=loja_id` (16 em ~2,5 min, uma URL). Não foi confirmado como loop; verificar. | Aberto |

## 9. Correções implementadas

**D-01 e D-02 — quantidade do item no carrinho** (`pdv-importados/app/caixa/CaixaCartList.tsx`, componente `QuantidadeStepper`)

- Adicionado estado local `rascunho` (string). O campo mostra o rascunho enquanto o operador digita.
- `onChange` grava o rascunho e só chama `onAlterarQuantidade` quando o valor normalizado é > 0. Campo vazio ou 0 não remove a linha.
- `onBlur` limpa o rascunho e o campo volta ao valor real do item.
- Remover continua sendo ação explícita: botão "remover", ou "−" com quantidade 1.

Causa raiz: campo controlado `value={item.quantidade}` com `onChange` que chamava `parseQuantidadeInput` e propagava o valor imediatamente. Cada tecla era renormalizada pelo estado, e o campo vazio passava por 0, que removia a linha.

Impacto: restrito ao componente de quantidade do carrinho. Não toca em preço, estoque ou RPCs. Os demais usos de `alterarQuantidade` (botões +/−, leitura de código, atacado) não mudaram.

**Reteste manual (UI, viewport mobile):** apagar o campo mantém a linha (`1` → vazio → linha presente); digitar `2.5` resulta em quantidade 2,5 e total R$ 197,50 (79,00 × 2,5). Antes da correção, o mesmo gesto gerava 1,002 / 35,015.

## 10. Testes de regressão

- `pdv-importados/app/caixa/CaixaCartList.behavior.test.tsx`: 2 testes novos, na mesma suíte de stepper.
  - "apagar o campo durante a digitação não remove a linha nem zera a quantidade".
  - "digitar uma nova quantidade confirma só valores válidos e volta ao valor do item ao sair do campo".
  - Helper `digitar()` simula digitação em input controlado do React.
- Resultado: `npx vitest run app/caixa/CaixaCartList.behavior.test.tsx` → **9/9 passaram**.
- Suíte completa da pasta de caixa: `npx vitest run app/caixa` → **58 arquivos, 393 testes, todos passaram**.
- Não foram executados os specs E2E Playwright (`e2e/caixa-*.spec.ts`). Ver pendências.

## 11. Testes automatizados e E2E

| Suíte | Status nesta rodada |
|---|---|
| Vitest `app/caixa` | Executada: 393/393 |
| Playwright `e2e/caixa-*.spec.ts` | **Não executada.** `playwright.config` aponta para um baseURL que não foi confirmado como o da porta 3002; configuração a revisar antes |
| `npm run test:e2e:critical` | Não executada |

## 12. Pendências (não executadas nesta rodada)

- **Etapa 2:** cancelamento de item e de venda com autorização de gerente, devolução parcial e total, troca.
- **Etapa 2:** permissões negativas (operador tentando ação de gerente/dono); "Desconto gerente"; desconto acima do limite.
- **Etapa 2:** atacado (faixa e quantidade mínima), pagamento com 3 formas, insuficiente, crédito de cliente, saldo devedor, cliente identificado, produto sem estoque, produto fracionado.
- **Etapa 2:** suprimento, sangria e restrições de reabertura do caixa.
- **Etapa 4:** dois operadores simultâneos, cliques repetidos em "Finalizar", recarregar durante operação, perda de conexão, expiração de sessão.
- **Etapa 5:** tempo e cliques medidos, atalhos, resoluções. Parcial (ver matriz).
- **Etapa 6:** leitor de código de barras físico, impressora térmica, versão Tauri. **Nenhum equipamento foi usado**; nada marcado como aprovado.
- **Playwright:** a exigência original pede Playwright com navegador visível. Foi usado o Browser pane do app. Os specs E2E existentes não foram rodados.

## 13. Decisões e pedidos ao time

1. **D-04 (decisão):** quantidade fracionada em produto UN — bloquear ou permitir? Depende de a loja vender a granel.
2. **D-05:** persistir valor recebido e troco em `vendas_pagamentos` (ou em coluna nova) para auditoria do dinheiro.
3. **D-06:** venda em espera de caixa fechado — bloquear fechamento, transferir para o próximo caixa ou descartar?
4. **D-07:** confirmar com o módulo financeiro se venda em PIX/dinheiro deve gerar linha em `movimentos_financeiros`/`movimentos_caixa`.
5. **Migrations:** 7 migrations de 2026-10-28/30 estão fora de ordem em relação ao histórico do stack local. Conferir se a homologação remota tem as mesmas, antes de liberar.
6. **Evidências:** salvar capturas e vídeo em `docs/qa/evidencias/` na próxima rodada.

## 14. Parecer final de liberação

**NO-GO.**

Motivos:

1. Fluxos críticos ainda não testados: cancelamento, devolução, permissões negativas, concorrência e idempotência (não há prova de "nenhuma venda duplicada" sob clique repetido ou dupla aba).
2. D-04 e D-05 afetam a exatidão financeira e o rastro do dinheiro. Dependem de decisão antes de liberar.
3. D-07 deixa a conciliação financeira sem confirmação.
4. Equipamentos não testados fisicamente.

O que foi comprovado e pode ser usado como base: abertura de caixa, venda em dinheiro, venda com pagamento dividido, venda em espera e recuperação, fechamento com diferença. Os valores batem entre tela, `vendas`, `vendas_pagamentos`, `estoque`, `movimentos_estoque_log` e `caixas`, com os ressalvas acima. A correção de D-01/D-02 está aplicada e com teste de regressão.
