# Matriz de testes de homologação — Fase 3

Regra: **nenhuma migration é considerada pronta por executar sem erro.** Cada item exige: (1) cenário indevido bloqueado; (2) fluxo legítimo funcionando; (3) auditoria íntegra; (4) sem regressão; (5) rollback testado.

Ambiente: **homologação** (`jinlong-homolog-palm`) ou staging, com dados de teste. Nunca produção. Os 33 casos negativos citados no relatório (V1–V19, P1–P8, F1–F3, E1–E3) estão em arquivos que não estão no repositório; devem ser recuperados antes da execução.

## Critérios objetivos de aprovação

| Código | Critério |
|---|---|
| CA-1 | Todo caso negativo indevido retorna erro (`42501`, `permission denied`, `P0001` com a mensagem esperada) e não altera linha alguma (comparar contagem e hash antes/depois). |
| CA-2 | Todo caso positivo retorna sucesso e o estado final bate com o esperado (saldo, status, totais). |
| CA-3 | Para toda operação de venda/caixa/perfil, existe linha de `venda_eventos` ou registro de auditoria correspondente. Zero escrita sem trilha. |
| CA-4 | Suíte de regressão do PDV verde (sem nenhum teste pulado por ambiente). |
| CA-5 | Rollback executado em homologação, estado restaurado = estado antes (hash de `pg_policies`, `information_schema.role_table_grants` e contagens). |
| CA-6 | Tempo de resposta de venda e de fechamento não piora mais de 10% em comparação com baseline. |

## Matriz

| ID | Área | Cenário | Perfil | Esperado | Critério |
|---|---|---|---|---|---|
| **Negativos de segurança** | | | | | |
| T-A1-01 | A1 | INSERT REST em `vendas` com total arbitrário | OPERADOR (JWT) | Bloqueado | CA-1 |
| T-A1-02 | A1 | INSERT REST em `vendas_pagamentos` DINHEIRO | OPERADOR | Bloqueado; saldo do caixa inalterado | CA-1 |
| T-A1-03 | A1 | INSERT REST em `itens_venda` | OPERADOR | Bloqueado | CA-1 |
| T-A3-01 | A3 | UPDATE `vendas.total_liquido` | GERENTE da loja | Bloqueado | CA-1 |
| T-A3-02 | A3 | DELETE `vendas` | GERENTE / DONO | Bloqueado | CA-1 |
| T-A3-03 | A3 | DELETE `itens_venda` / `vendas_pagamentos` / `descontos_venda` | GERENTE | Bloqueado | CA-1 |
| T-A2-01 | A2 | UPDATE `caixas.status` FECHADO→ABERTO | OPERADOR (dono) e GERENTE | Bloqueado (`CAIXA_FECHADO_STATUS_IMUTAVEL`) | CA-1 |
| T-A2-02 | A2 | UPDATE `caixas.status` ABERTO→FECHADO sem dados | OPERADOR | Bloqueado por CHECK | CA-1 |
| T-B1-01 | B1 | UPDATE `perfis.perfil` e `loja_id` próprios | OPERADOR | Bloqueado | CA-1 |
| T-B1-02 | B1 | DELETE de `perfis` de outra loja | GERENTE | Bloqueado | CA-1 |
| T-B1-03 | B1 | INSERT de `perfis` próprio com perfil elevado | OPERADOR | Bloqueado | CA-1 |
| T-C1-01 | C1 | INSERT/UPDATE/DELETE em `feature_flags` | DONO / ADMIN de outra empresa | Bloqueado | CA-1 |
| T-C1-02 | C1 | Mesmo cenário com `service_role` | Edge/administração | Permitido | CA-2 |
| T-N1-01 | N1 | Abertura de caixa com `valor_inicial` acima do teto | OPERADOR | Bloqueado ou exigir gerente (conforme D4) | CA-1 |
| **Fluxos legítimos (regressão)** | | | | | |
| T-V-01 | Venda | Venda normal, 1 item, dinheiro | OPERADOR | Venda criada; saldo +valor; evento registrado | CA-2, CA-3 |
| T-V-02 | Venda | Múltiplos pagamentos (dinheiro + cartão) | OPERADOR | Soma de pagamentos = total; saldo só do dinheiro | CA-2 |
| T-V-03 | Venda | Desconto de operador dentro do limite | OPERADOR | Total com desconto; sem token | CA-2 |
| T-V-04 | Venda | Desconto de gerente com token | OPERADOR + token | Aceito; registro em `descontos_venda` | CA-2, CA-3 |
| T-V-05 | Venda | Preço alterado no cliente | OPERADOR | Servidor recalcula; total correto | CA-2 |
| T-V-06 | Venda | Estoque baixado | OPERADOR | Kardex e estoque coerentes | CA-2 |
| T-CAN-01 | Cancelamento | Cancelar venda do turno atual | GERENTE | `cancelar_venda_transacional` ok; evento; estoque reposto | CA-2, CA-3 |
| T-CAN-02 | Cancelamento | Cancelar venda de caixa fechado | GERENTE | Regra conforme S9b (pendente) | CA-2 |
| T-EST-01 | Estorno | Devolução com troca | OPERADOR/GERENTE | `devolver_ou_trocar_venda` gera registros corretos | CA-2, CA-3 |
| T-CX-01 | Caixa | Abrir caixa | OPERADOR | Caixa ABERTO; `saldo_atual = valor_inicial` | CA-2 |
| T-CX-02 | Caixa | Fechar caixa sem divergência | OPERADOR | FECHADO com dados; E(c) = contado | CA-2, CA-3 |
| T-CX-03 | Caixa | Fechar com divergência > R$5 sem motivo | OPERADOR | Bloqueado (`FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO`) | CA-1 |
| T-CX-04 | Caixa | Sangria/suprimento | OPERADOR/GERENTE | Movimento registrado; saldo coerente | CA-2, CA-3 |
| T-RET-01 | Reabertura | Retomada com token de gerente válido e motivo | GERENTE | Cria **novo** turno; antigo intacto | CA-2, CA-3 |
| T-RET-02 | Reabertura | Retomada sem token | GERENTE | Bloqueado | CA-1 |
| T-RET-03 | Reabertura | Retomada por OPERADOR | OPERADOR | Bloqueado (`RETOMAR_CAIXA_REQUISITANTE_PERFIL`) | CA-1 |
| **Offline** | | | | | |
| T-OFF-01 | Sync | Venda offline enviada e replayada | PDV local → Edge | Venda criada uma vez; itens/pagamentos iguais | CA-2, CA-3 |
| T-OFF-02 | Sync | Replay duplicado (mesmo `venda_id`) | Edge | Idempotente; sem duplicar | CA-2 |
| T-OFF-03 | Sync | Replay com itens divergentes | Edge | Recusado (`validate_offline_replay_payload`) | CA-1 |
| T-OFF-04 | Sync | Venda offline sem loja | Edge | Recusado (`require_store_context`) | CA-1 |
| T-OFF-05 | Sync | Comando `sync_outbox` simulado | Tauri | Removido ou inoperante | CA-1 |
| T-REC-01 | Reconexão | Queda da Edge durante envio, reconexão | PDV | Outbox reprocessa sem perder nem duplicar | CA-2 |
| T-REC-02 | Reconexão | Token revogado durante offline | PDV | Itens em ERRO, sem perda local | CA-2 |
| **Concorrência e isolamento** | | | | | |
| T-CONC-01 | Concorrência | Dois operadores vendem no mesmo caixa | 2 OPERADORES | Ambas aceitas ou uma recusada; totais consistentes | CA-2 |
| T-CONC-02 | Concorrência | Fechamento durante venda em andamento | OPERADOR + venda | Venda concluída ou falha limpa; caixa fecha | CA-2 |
| T-ISO-01 | Isolamento | Operador de loja A lê/grava venda de loja B | OPERADOR A | Bloqueado | CA-1 |
| T-ISO-02 | Isolamento | GERENTE de loja A altera caixa de loja B | GERENTE A | Bloqueado | CA-1 |
| T-ISO-03 | Isolamento | DONO vê todas as lojas (regra de negócio) | DONO | Permitido somente para leitura | CA-2 |
| **Auditoria** | | | | | |
| T-AUD-01 | Auditoria | Toda venda tem `venda_eventos` | — | 100% das vendas do período | CA-3 |
| T-AUD-02 | Auditoria | Cancelamento registrado com autor e motivo | GERENTE | Evento com autor e motivo | CA-3 |
| T-AUD-03 | Auditoria | Saldo do caixa = calculado a partir de movimentos | — | Zero divergência | CA-3 |
| **Regressão do PDV** | | | | | |
| T-REG-01 | PDV | Fluxo completo: login, caixa, venda, pagamento dividido, cancelamento, devolução, fechamento, estoque e financeiro | Todos | Verde (Playwright existente) | CA-4 |
| T-REG-02 | PDV | Relatórios (vendas, top produtos, resumo executivo) | GERENTE | Valores iguais à base; tempo dentro de CA-6 | CA-2, CA-6 |
| **Rollback** | | | | | |
| T-RB-01 | Rollback 002 | Reverter GRANT e policies | DBA | Estado idêntico ao anterior | CA-5 |
| T-RB-02 | Rollback 003 | Reverter grants/policies de `perfis` | DBA | Idêntico | CA-5 |
| T-RB-03 | Rollback 004 | Reverter policies de `feature_flags` | DBA | Idêntico | CA-5 |

## Registro de execução

Para cada linha: data, executor, ambiente, resultado (PASS/FAIL), evidência (saída de SQL e contagens antes/depois). Não marcar PASS sem evidência.

## Pendências

- Recuperar os 33 casos negativos do relatório (não estão no repo).
- Definir a suíte de regressão do PDV no ambiente de homologação (existe no repo em `pdv-importados/e2e`; executar com `npm run test:financial`).
- Ambiente de homologação isolado e limpo (ver `TRANCHE_VALIDACAO` no repo).
