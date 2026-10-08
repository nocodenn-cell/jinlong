# Gate PR A — Fechamento por forma (read model)

| Campo | Valor |
|--------|--------|
| **Data** | 2026-10-07 |
| **Branch** | `cursor/fechamento-caixa-por-forma-pr-a-7da4` |
| **Base** | Tip pós-SSoT + docs `#477` (`cursor/proxima-fase-pos-gate-ssot-7da4`) |
| **Stack `#473–#476` em `main`** | **Não** — base inequívoca = tip linear da stack (sem duplicar commits) |
| **Contrato** | [CONTRATO_FECHAMENTO_POR_FORMA.md](./CONTRATO_FECHAMENTO_POR_FORMA.md) |
| **Migration** | `20261007180000_calcular_valor_sistema_por_forma_caixa.sql` |

## Matriz de invariantes

| Invariante | Fonte canônica | Evidência | Teste |
|------------|----------------|-----------|-------|
| Dinheiro = \(E(c)\) | `internal.valor_sistema_dinheiro` | RPC retorna `E_C_AUTORIDADE`; igualdade com facade | SQL prova + vitest estrutural |
| PIX registrado | `vendas_pagamentos` + `devolucoes` PIX | 60+25−10=75; cancel excluído | `fechamento-por-forma-prova.mjs` |
| Débito | idem CARTAO_DEBITO | 80 | idem |
| Crédito | idem CARTAO_CREDITO | 90 | idem |
| Split | parcelas isoladas | 40 DINHEIRO em \(E(c)\); 60 PIX em \(R\) | prova + vitest |
| CR / parcial | só valor recebido; título `contas_receber` | 20 DINHEIRO; FIADO fora do modelo | contrato + vitest |
| Cancelamento | venda sai de `CONCLUIDA` | PIX cancel não soma | prova |
| Devolução | − forma no desembolsador | −10 PIX | prova |
| Mov físico ≠ forma eletrônica | suprimento/sangria só \(E(c)\) | \(E(c)\)=115; PIX sem +10/−5 | prova |
| Auth loja | mesma regra de \(E(c)\) | cross-loja 42501 | prova |
| Sem 2ª fórmula \(E(c)\) | delegação obrigatória | DO estrutural na migration | migration + vitest |

## Decisão

## READY FOR CLOSURE UI

Semântica financeira do read model está fechada:

- \(E(c)\) intacto para DINHEIRO;
- PIX/débito/crédito = **registrado Jinlong**, não conciliação bancária;
- FIADO/forma a prazo não inventada (CR via `contas_receber`);
- sem persistência de snapshot (PR B);
- sem UI neste PR.

**Não iniciar PR B automaticamente** até revisão humana deste gate.
