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

## Idioma

Os rótulos que faltavam entram em `admin_ui` e reaproveitam chaves já existentes:

| Texto | Chave |
|-------|--------|
| Valor (R$) | `admin_ui.financeiro_col_valor` + ` (R$)` |
| Pagar | `contas_pagar.btn_pagar` |
| Receber | `admin_ui.financeiro_acao_receber_titulo` |
| Salvar | `comum.salvar` |

Chaves novas, com o mesmo nome em `pt.json` e `zh.json`: conta de origem, conta de destino, data efetiva, classificar título, nova despesa, título, título a receber, título a pagar, selecione, selecione a conta, registrando, operação registrada, dados inválidos, falha de comunicação, valor mensal, primeiro vencimento, competência e competência inicial.

Português e chinês foram conferidos no teste do formulário com `AdminV2SessionProvider`. Sem o provider, o fallback continua português.

Ainda em português fixo, fora desta lista: descrição, favorecido, categoria, observação, parcelas, "como gerar" e "título desta página".

## Envio único

`FinanceiroForm` guarda um `useRef` ligado no início do submit e solto no `finally`, inclusive quando a transformação dos dados falha. O segundo submit do mesmo formulário, no mesmo instante, não chama o escritor. O botão fica `disabled` e mostra "Registrando…" / "登记中…" enquanto a operação está pendente. Ao concluir ou falhar, o botão volta.

Se a resposta é erro, `dataset.requestId` permanece. O reenvio do mesmo payload manda a mesma chave. O `financeiro_comando` continua devolvendo o comando já gravado. Sucesso apaga a chave e limpa o formulário, como antes.

## Testes

Em `pdv-importados`, no fechamento:

| Comando | Resultado |
|---------|-----------|
| `npx vitest run app/admin/financeiro` | 12 arquivos, 68 testes, passaram |
| `baixaFluxo.behavior.test.tsx` | autorização, pré-seleção, um envio pendente, reuso da chave após erro, rótulos em chinês |
| `baixaEscritores.test.ts` | os quatro escritores continuam separados |
| `payablePayment.test.ts` e `receivableWriter.test.ts` | idempotência dos escritores, passaram na suíte do financeiro |
| `npm run typecheck` | saiu 0 |
| `npm run lint` | saiu 0, no projeto inteiro |
| `npm test` | 374 arquivos passaram, 2 ignorados, 2370 testes passaram. 1 suíte falhou: `productUpdater.semRpc.integracao.test.ts` com `Expected 3 parts in JWT; got 1`. A falha ocorre no insert, antes de alterar a RPC, e já acontecia na `main` sem estas mudanças. Não foi alterada. |
| `npm run build` | saiu 0 |

O que os testes de baixa travam:

- `BAIXAR_AP` usa `TRANSF` e caixa nulo; `BAIXAR_AR` usa `OUTROS` e caixa nulo.
- O modal não referencia `executarFinanceiroLoja`. O formulário da conta não referencia `registrarPagamentoAction` nem `liquidarTitulo`.
- OPERADOR não vê botão de baixa.
- O id devolvido pelo clique é o da linha, e o `<select>` da conta abre nesse id.
- Sem submit, `executarFinanceiroLoja` não é chamado.
- Dois submits enquanto a primeira chamada não voltou geram uma única chamada.
- Depois do erro, o botão habilita de novo e o mesmo payload reusa o `requestId`.
- Clicar em "Pagar pela conta" não chama `registrarPagamentoAction`.
- Em chinês aparecem 付款账户, 金额 (R$), 实际日期, 分类账款 e 新费用.

## Validação visual

Não concluída. Não houve sessão autenticada e o worktree não tem `.env.local`. O Playwright deste repositório recusa alvo que não seja `localhost` / `127.0.0.1`, porque o `.env.local` do checkout principal pode apontar para o mesmo Supabase de produção. Copiar esse arquivo e exercer os quatro fluxos poderia gravar baixa de verdade. Não foi feito.

O que ficou sem olhar no browser: pré-seleção na página inteira, clareza dos quatro botões, permissão com um usuário real, responsividade e a troca de idioma na tela.

## Commits

| Commit | Conteúdo |
|--------|----------|
| `36e51f9f` | tradução da tela de categorias financeiras |
| `aa3c13ed` | auditoria de redundâncias |
| `cf923fc7` | pré-seleção do título e rótulos dos quatro destinos |
| `ba3fa01e` | idioma dos campos, bloqueio de envio duplo e este relatório |

## Riscos que continuam

- GERENTE, DONO e ADMIN veem os dois destinos, porque os dois escritores aceitam os três. Não existe, hoje, um perfil só de caixa.
- Parte dos rótulos auxiliares do formulário continua em português.
- A validação visual dos quatro fluxos não foi feita.

## Status para merge

**NO-GO.** Os escritores e as regras financeiras não mudaram, e os testes de baixa, autorização, idempotência, typecheck e ESLint dos arquivos alterados passaram. O merge fica parado porque a validação visual não aconteceu e a suíte completa mantém a falha de JWT já conhecida, fora deste diff.
