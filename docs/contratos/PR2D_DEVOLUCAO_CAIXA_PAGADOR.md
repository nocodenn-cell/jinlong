# PR-2D — Devolução paga pelo caixa pagador (D-2/D-3/D-7) e conciliação D-13

Escopo: **somente `devolver_ou_trocar_venda`** e a infraestrutura mínima que ela exige (colunas, autoridade única, resolvedor 0/1/N,
cache derivado). Sem PR-2B/2C/2E/PR-3, sem migrations pendentes, sem backfill, sem correção fiscal. Nada foi aplicado em produção.

## 1. Decisões finais
| # | Decisão |
|---|---|
| 1 | **Caixa pagador.** O dinheiro devolvido sai do caixa ABERTO elegível (regra 0/1/N em `internal.resolver_caixa_pagador`); o caixa da venda de origem — aberto ou fechado — nunca é alterado. |
| 2 | **Elegibilidade.** `ABERTO` ∧ mesma loja do usuário logado ∧ (dono do caixa ∨ `GERENTE/DONO/ADMIN`). D-8b: gerente+ pode usar qualquer caixa aberto da loja (mesma semântica de AR/AP). A devolução em si exige perfil gerencial (regra existente, preservada). `p_operador_id` só vale sem `auth.uid()`. |
| 3 | **0/1/N.** 0 → `DEVOLVER_VENDA_SEM_CAIXA_ABERTO`; 1 → automático; ≥2 sem `p_caixa_id` → `DEVOLVER_VENDA_CAIXA_OBRIGATORIO` (sem efeito); `p_caixa_id` de outra loja, fechado ou inexistente → `DEVOLVER_VENDA_CAIXA_INVALIDO`. |
| 4 | **Autoridade.** `internal.valor_sistema_dinheiro` (implementação única; `calcular_valor_sistema_dinheiro_caixa` autoriza e delega). `saldo_atual` é cache derivado (`internal.sincronizar_saldo_cache`, só caixa ABERTO); nenhuma decisão da devolução o lê. |
| 5 | **D-13 — reembolso monetariamente FUNGÍVEL.** A devolução é limitada ao total **efetivamente pago** na venda e ainda não devolvido em meio de pagamento. **Não é obrigatório devolver pelo mesmo meio do pagamento original** (ex.: venda paga em PIX pode ser devolvida em dinheiro até o valor pago). Não há rastreio por forma de pagamento — de propósito. O excedente ao pago abate o saldo a receber (`CREDITO_CLIENTE`, mecanismo existente); nunca vira dinheiro nem dívida nova. |
| 6 | **D-13 — liquidação ativa** (RECEBIMENTO sem ESTORNO) bloqueia a devolução: `DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO`; o operador estorna a liquidação pelo fluxo financeiro. |
| 7 | **D-13 — venda 100% a prazo:** sem dinheiro a devolver; só abate o AR; nenhuma saída de caixa; **não exige caixa**. |
| 8 | **Desconto da venda não é reembolsável.** Em vendas com desconto no nível da venda (itens a preço cheio somam mais que o total líquido — 2 de 240 vendas em produção), devolver todos os itens seria impossível sob o limite "valor pago". Regra: a sobra que excede *pago + saldo em aberto* é absorvida **somente** até o desconto implícito restante (`Σ itens − total_liquido − já absorvido`); acima disso → `DEVOLVER_VENDA_EXCEDE_VALOR_PAGO`. O `valor_estornado` gravado é o efetivamente devolvido. |
| 9 | **Invariante no banco:** `valor_estornado = valor devolvido em meio + valor_abatido_ar` (testado) e `CHECK valor_abatido_ar + valor_caixa_estornado <= valor_estornado` (migration `20261001100300`). |
| 10 | **Retry idempotente** por `idempotency_key`; com `p_caixa_id` divergente do gravado → `DEVOLVER_VENDA_RETRY_CAIXA_DIVERGENTE`. |
| 11 | **Lock do caixa pagador:** `FOR NO KEY UPDATE` (não `FOR UPDATE`). Achado pela prova de concorrência: com `FOR UPDATE`, uma devolução paga por outro caixa ficava presa 4 s (lock_timeout) porque o FK `venda_pos_venda_operacoes.caixa_id` exige `KEY SHARE` no caixa da venda. Com `NO KEY UPDATE`: pagadores do mesmo caixa continuam serializados e caixas distintos não se bloqueiam (F = 20 ms). |

## 2. `CREDITO_CLIENTE` gravado como `PIX` em `devolucoes` — análise
O ramo **puro** `CREDITO_CLIENTE` grava uma linha em `devolucoes` com `forma_pagamento = 'PIX'` (o `CHECK` de `devolucoes` não admite `CREDITO_CLIENTE`).
**Conclusão: nomenclatura legada, sem impacto funcional hoje** → dívida conhecida, **não corrigida** (fora de escopo).
Evidência (produção, SELECT, 2026-09-30):
- uso real: 0 operações `CREDITO_CLIENTE`; 1 linha `PIX` em `devolucoes` (de 9); 1 operação pós-venda no total;
- leitores de `devolucoes`: só 3 funções — `calcular_valor_sistema_dinheiro_caixa` (filtra `DINHEIRO`; o `PIX` não entra), `cancelar_venda_transacional` (escreve; o "já devolvido" usa `venda_pos_venda_operacoes`) e `devolver_ou_trocar_venda`; **nenhuma view**, nenhum consumidor TS/relatório/dashboard;
- auditoria: a tela lê `venda_pos_venda_operacoes` (onde `forma_estorno = 'CREDITO_CLIENTE'` está correto);
- reconciliação: o PR-2D exclui do "meio já devolvido" as operações `CREDITO_CLIENTE` (`forma_estorno <> 'CREDITO_CLIENTE'`), portanto a linha `PIX` não distorce o limite.
Risco residual: um consumidor **futuro** que agrupe `devolucoes` por forma superestimaria PIX. Nas operações mistas o PR-2D **não** grava essa linha (só o meio realmente devolvido).

## 3. Rastreabilidade (auditoria) — sem sistema novo
| Pergunta | Onde está |
|---|---|
| venda | `venda_pos_venda_operacoes.venda_id` (+ `venda_eventos` `SALE_PARTIAL_RETURN`) |
| valor devolvido / abatido | `valor_estornado`, `valor_caixa_estornado`, `valor_abatido_ar`, linhas de `devolucoes` |
| caixa pagador | `venda_pos_venda_operacoes.caixa_desembolso_id`, `devolucoes.caixa_desembolso_id` (caixa da venda continua em `caixa_id`) |
| usuário / data-hora | `operador_id`, `created_at` |
A tela existente `/admin/auditoria` (fonte `venda_pos_venda_operacoes`) passou a exibir também **valor abatido do saldo a receber** e **caixa que pagou** (2 campos; chaves i18n pt/zh).
`venda_eventos.caixa_id` permanece o caixa da venda (evitar mudar a semântica do ledger/KPIs).

## 4. Provas (todas executadas em Supabase local; nenhuma em produção)
| Requisito | Prova |
|---|---|
| Caixa fechado não sofre alteração (saldo_atual, fechamento, valor esperado, movimentações) | `devolucao-d13…test.sql` T2/T7: linha inteira do caixa (`to_jsonb`) idêntica, autoridade = snapshot (`valor_fechamento − fechamento_diferenca`), movimentações (conteúdo e saldos) e liquidações idênticas |
| 0/1/N; outra loja; fechado; inexistente | T1, T3, T3b, T8, S-estrutura (+ independente da ordem de criação dos caixas) |
| Autorização | T3/T5/T9: operador não devolve; DONO/ADMIN/GERENTE devolvem; resolvedor: operador só o próprio caixa, gerencial qualquer da loja, outra loja bloqueada, sem identidade bloqueada |
| Idempotência (estoque, devolução, crédito/AR, saída de caixa) | T4 e T10 (operação mista: retry idêntico e com o mesmo `p_caixa_id`) |
| Fungibilidade / desconto / limites | T11 (PIX devolvido em dinheiro), T12 (desconto), D-13.1…4 |
| `valor_estornado = meio + abatimento AR` e nada acima do elegível | varredura A-9 sobre todas as operações do teste + T13 (o banco recusa violações) |
| Concorrência (2 sessões reais) | `devolucao-concorrencia.sh`: (1) mesmo caixa, duas vendas → uma passa, outra `SALDO_CAIXA_INSUFICIENTE`, autoridade final 50; (2) mesma venda → uma passa, outra `QTD_EXCEDE_VENDIDA`, estoque +4 uma vez; (3) caixas diferentes em paralelo → ambas passam, F = 20 ms dentro do banco; (4) mesma venda por caixas diferentes → uma passa, só o caixa vencedor debitado |
| Sensibilidade do teste | teste de mutação: 7 regras quebradas, 7 detectadas (liquidação, guard por cache, limite ao pago, pagador = caixa da venda, absorção sem desconto, retry sem caixa, sem abatimento de AR) |
| Estrutura | exatamente **uma** assinatura de `devolver_ou_trocar_venda` (10 args), sem EXECUTE para PUBLIC/anon, com `authenticated`/`service_role`; `internal.*` não executáveis por `authenticated`; teste Vitest `devolucao-troca-cadeia` exige DROP+CREATE com grants e verificação de overload |
| Rollback | aplicado num clone: `md5` do corpo de `devolver_ou_trocar_venda` (`a99947852eef57b1fc6ab9fa95fde742`) e de `calcular_valor_sistema_dinheiro_caixa` (`afbecb10ba45ab70cc828618f377b35d`) **idênticos aos de produção**; 1 assinatura de 9 args; ACL igual; 0 funções `internal`, 0 colunas, 0 índice, 0 constraint |

## 5. Baseline — falhas que existem antes e depois (não introduzidas pelo PR-2D)
| Falha | Causa | Prova de que é pré-existente |
|---|---|---|
| `financial-adversarial-gates.test.sql` → `GATE19_PAGAMENTO1 bruto=31.47 comp=31.47 liq=0.00` | gate de pagamentos/financeiro independente da devolução | falha **idêntica** no clone com o PR-2D revertido (estado pré-PR) e no estado atual |
| `app/admin/produtos/productUpdater.semRpc.integracao.test.ts` → `Expected 3 parts in JWT; got 1` | o teste usa a chave placeholder `MOCK_SERVICE_ROLE_KEY_DO_NOT_COMMIT` quando `SUPABASE_SERVICE_ROLE_KEY` não está definida | com a variável do stack local o teste **passa (2/2)** já com o PR-2D aplicado; o arquivo só importa `productUpdater` (não tocado) |
| `homolog_sprint_b_devolucao_smoke.sql` no banco local "sujo" | fixture com dados fixos (`duplicate key … produtos_codigo_barras_loja_unique`) de execução anterior | falha idêntica antes/depois; rodado com o código de barras trocado em clone limpo → `SMOKE_OK` (script atualizado para o contrato novo) |

## 6. Harness do PR #438 (não alterado aqui)
No `caixa-reconciliacao-contrato.test.sql` (PR #438), o cenário **S7** chama a devolução **sem `p_caixa_id`** numa loja com 7 caixas abertos; após o PR-2D isso é rejeitado (`DEVOLVER_VENDA_CAIXA_OBRIGATORIO`), corretamente. **O S7 precisa fornecer `p_caixa_id`** (o caixa da venda) quando houver múltiplos caixas elegíveis. Os cenários S8, S10, S11 e S13 passam a OK; S9/S12 (cancelamento) seguem para o PR-2E.

## 7. Achados fora de escopo (registrados, não corrigidos)
1. `CREDITO_CLIENTE` puro gravado como `PIX` em `devolucoes` (seção 2).
2. Possível deadlock pré-existente entre `cancelar_venda_transacional` (venda → caixa → título) e `registrar_liquidacao_receber` (título → caixa) — inversão de ordem de lock; não tocado.
3. Devolução em qualquer meio não é restrita ao meio original (decisão 5) — é a regra aprovada; não há conciliação por forma.
4. `20260929120000` (CHECK de caixa fechado) abortaria em produção (6 caixas com `fechamento_diferenca` nula); o PR-2D não a exige e nunca escreve em caixa fechado.
5. Devoluções antigas de vendas com desconto podem ter reembolsado acima do pago (comportamento anterior); nenhum dado histórico foi alterado.

## 8. Riscos residuais / compatibilidade
- Devolução em **dinheiro** sem `p_caixa_id` com ≥2 caixas abertos passa a ser rejeitada (a UI já exige a escolha). Sem caixa aberto, a parte em dinheiro não pode ser devolvida (antes era "registrada sem gaveta").
- Devolução acima do valor pago agora é rejeitada, salvo desconto implícito da venda (decisão 8).
- O recálculo da autoridade roda a cada devolução em dinheiro e a cada crédito de venda em dinheiro (trigger) — o gate de desempenho do plano (PR-2B) continua pendente; nesta etapa o volume real é pequeno.
- Dependência de ordem de aplicação: migrations `20261001100000` → `…0100` → `…0200` → `…0300`.
