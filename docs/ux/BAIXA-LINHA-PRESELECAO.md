# Baixa pela linha — pré-seleção do título

Data: 2026-10-11. Branch `audit/opencode-ux-simplificacao`. Sem migration, sem RPC nova e sem troca de escritor.

## Correspondência confirmada antes da tela

A leitura bate com o diagnóstico anterior. Por isso a implementação seguiu.

| Ação | Escritor | Destino |
|------|----------|---------|
| Pagar pelo caixa | `registrarPagamentoAction` → `registrar_pagamento_contas_pagar`, origem `UI_FINANCEIRO` | Gaveta quando a forma é dinheiro. Sem `conta_financeira_id`. |
| Pagar pela conta financeira | `executarFinanceiroLoja` → `financeiro_comando` `BAIXAR_AP` | A mesma RPC com forma `TRANSF` e `caixa_id` nulo. Depois grava `conta_financeira_id`. O gatilho `financeiro_baixa_ledger` só lança movimento se a conta está preenchida, e recusa dinheiro nessa conta. |
| Receber no caixa | `liquidarTitulo` → `registrar_liquidacao_receber`, forma `DINHEIRO` | Gaveta. O formulário da linha já carrega o título. |
| Receber na conta financeira | `financeiro_comando` `BAIXAR_AR` | Forma `OUTROS`, `caixa_id` nulo, depois `conta_financeira_id`. |

`assertGerenteSession` e `assertAdminSession` aceitam GERENTE, DONO e ADMIN. OPERADOR não passa. Os dois botões da linha usam essa mesma regra (`baixasAutorizadas`). Não há perfil que possa um destino e não o outro.

## Comportamento

Antes, o botão da linha em "A pagar" só abria o modal de caixa. O formulário bancário no fim da página pedia o título de novo. Em "A receber", o botão só descia a página, também sem título.

Agora a linha mostra os dois destinos, com texto:

- Pagar pelo caixa / Pagar pela conta financeira
- Receber no caixa / Receber na conta financeira

Pagar pelo caixa continua no `PagamentoModal` (`somenteCaixa`), que já recebe a conta da linha. Pagar ou receber pela conta abre o `FinanceiroForm` existente (`BAIXAR_AP` ou `BAIXAR_AR`) com o `titulo_id` da linha. Se o título não está na página do painel, a opção é acrescentada; o id enviado é o da linha. Receber no caixa rola até o formulário `liquidarTitulo` daquele título e foca o valor.

O formulário geral continua com "Selecione" quando ninguém clicou numa linha. As ações rápidas não receberam título pré-escolhido.

Título de outra loja não ganha botão de baixa. A RPC já recusava esse caso.

O texto que mandava usar a conta financeira para PIX, boleto ou cartão saiu. Esses meios não são o que `BAIXAR_AP` / `BAIXAR_AR` gravam.

## Preservação

Não mudaram `registrarPagamentoAction`, `liquidarTitulo`, `executarFinanceiroLoja`, `financeiro_comando`, migrations, gatilhos, RLS, saldos nem a checagem de permissão no servidor. A tela só esconde o botão quando o guard já recusaria.

## Testes

Em `pdv-importados`, nesta sessão:

| Comando | Resultado |
|---------|-----------|
| `baixaEscritores.test.ts` + `baixaFluxo.behavior.test.tsx` + suítes vizinhas do financeiro e do modal | 8 arquivos, 36 testes, passaram |
| `npx vitest run app/admin/financeiro app/gerente/financeiro/contas-pagar` | 20 arquivos, 87 testes, passaram |
| `npm run typecheck` | saiu 0 |
| ESLint nos arquivos alterados | saiu 0 |

O que esses testes travam:

- `BAIXAR_AP` usa `TRANSF` e caixa nulo; `BAIXAR_AR` usa `OUTROS` e caixa nulo.
- O modal não referencia `executarFinanceiroLoja`. O formulário da conta não referencia `registrarPagamentoAction` nem `liquidarTitulo`.
- OPERADOR não vê botão de baixa.
- O id devolvido pelo clique é o da linha, e o `<select>` da conta abre nesse id.
- Sem submit, `executarFinanceiroLoja` não é chamado.
- Dois submits do mesmo payload usam o mesmo `requestId`. O comando no banco devolve o resultado já gravado.
- Clicar em "Pagar pela conta" não chama `registrarPagamentoAction`.

Não houve sessão autenticada no browser. A comparação visual ficou nos testes de comportamento.

## Riscos que continuam

- Os campos do formulário bancário (conta, valor, data, classificar, nova despesa) seguem em português fixo. Só o título do formulário de baixa e os botões da linha acompanham o idioma.
- Dois cliques rápidos disparam duas chamadas. A segunda reusa a chave. A proteção contra duplicar o dinheiro continua no `financeiro_comando` e na chave do pagamento, não num bloqueio novo de interface.
- GERENTE, DONO e ADMIN veem os dois destinos, porque os dois escritores aceitam os três. Não existe, hoje, um perfil só de caixa.
