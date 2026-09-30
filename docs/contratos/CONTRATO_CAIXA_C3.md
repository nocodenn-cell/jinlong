# C3 — Contrato do caixa (dinheiro na gaveta)

Status: **investigação/contrato. Nada implementado; `saldo_atual` NÃO será removido nesta etapa.**
Sem novo ledger. Fonte: corpo das funções **em produção** (`kbabmewnahysfvlybiak`, SELECT read-only) +
harness `backend/scripts/caixa-reconciliacao-contrato.test.sql` executado em Supabase local (2026-09-30).

## 1. Candidata a fonte canônica: `calcular_valor_sistema_dinheiro_caixa(p_caixa_id)`
É a base de `fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`, do comprovante (`caixaFechamentoServer.ts:18`,
`cashSession.ts:211`) e de gates existentes (A05). **Não lê `saldo_atual`.** É **derivada**:

| # | Componente | Sinal | Filtro relevante |
|---|---|---|---|
| 1 | `caixas.valor_inicial` (fundo) | + | — |
| 2 | `vendas_pagamentos` forma `DINHEIRO` | + | `vendas.caixa_id = caixa` **e** `vendas.status='CONCLUIDA'` |
| 3 | `vendas.total_liquido` legado | + | forma `DINHEIRO`, CONCLUIDA, **sem** linhas em `vendas_pagamentos` |
| 4 | `liquidacoes_receber` `DINHEIRO` | + recebimento / − estorno | `lr.caixa_id = caixa` |
| 5 | `movimentos_caixa` (legado) | + suprimento / − sangria | **todos os status**, ainda somado |
| 6 | `movimentacoes_caixa` (atual) | + suprimento dinheiro / − sangria / estorno inverte a origem | `status='aprovado'`, `deleted_at IS NULL` |
| 7 | `devolucoes` `DINHEIRO` | − | `vendas.caixa_id = caixa` (**caixa da venda**) e venda CONCLUIDA |

Propriedades observadas:
- **Cancelamento não tem termo próprio**: some porque a venda deixa de ser `CONCLUIDA` (itens 2, 3, 7).
  Efeito colateral: o valor de um caixa **já fechado** muda retroativamente quando uma venda dele é cancelada.
- Parcela **a receber** nunca entra (só `vendas_pagamentos` pagos) — coerente com "não lançar valor não recebido".
- Venda paga em PIX/cartão não entra.
- Autorização própria (`auth.uid()` → loja e operador/gerente).

## 2. Os escritores de `caixas.saldo_atual` (contador paralelo)
| Escritor | Efeito no contador | Grava `movimentacoes_caixa` | Exige ABERTO | Idempotência |
|---|---|---|---|---|
| `trg_caixas_saldo_inicial_bi` | `:= valor_inicial` na abertura | — | — | — |
| `trg_creditar_saldo_caixa_venda_dinheiro` (AFTER INSERT/UPDATE em `vendas_pagamentos`) | + dinheiro pago | não | **não** | **nenhuma** (reinserir credita de novo) |
| `registrar_movimentacao` | suprimento +, sangria −, estorno inverte (só `aprovado`) | sim | sim | (caixa, chave) único |
| `aprovar_movimentacao` | aplica pendente; usa `saldo_antes` gravado na criação | atualiza | sim | só se `pendente` |
| `cancelar_venda_transacional` | − parcela em dinheiro proporcional | não | **não** | status CANCELADA |
| `devolver_ou_trocar_venda` | − só se caixa **da venda** ABERTO | não | efeito só se ABERTO | chave em `venda_pos_venda_operacoes` |
| `registrar_liquidacao_receber` | + dinheiro | não | sim | (título, chave) |
| `estornar_liquidacao_receber` | − dinheiro | não | sim | único por origem |
Indiretos via `registrar_movimentacao`: `estornar_movimentacao`, `registrar/estornar_pagamento_contas_pagar`.
`fechar_caixa_*` **não** tocam `saldo_atual`. Nenhum outro escritor existe.
Escritores de `movimentacoes_caixa`: `registrar_movimentacao` (INSERT), `aprovar_movimentacao` e
`cancelar_movimentacao` (UPDATE de status/saldos). A tabela só admite `suprimento|sangria|estorno` (7 linhas em produção).

## 3. Operações que mexem em dinheiro físico × o que o cálculo enxerga
| Operação | Dinheiro físico | No cálculo (§1) | No contador (§2) | Lacuna |
|---|---|---|---|---|
| Venda dinheiro / parte em dinheiro | entra | sim (2/3) | sim | — |
| Parcela a receber / PIX / cartão | não entra | não | não | — |
| Suprimento / sangria / estorno | ± | sim (6) | sim | movimento **pendente** não conta em nenhum (coerente) |
| Recebimento de título em dinheiro | entra | sim (4) | sim | Comprovante de fechamento **não lista** esta linha (P2-18) |
| Estorno de recebimento | sai | sim (4) | sim | — |
| Pagamento AP em dinheiro | sai | sim (via sangria `PAGAMENTO_AP`, 6) | sim | — |
| Cancelamento, caixa **aberto** da venda | sai | sim (venda deixa de contar) | sim | — |
| Devolução em dinheiro, caixa da venda **aberto** | sai | sim (7) | sim | — |
| **Devolução em dinheiro, caixa da venda FECHADO** | sai **da gaveta que pagou** (outro caixa) | subtrai do caixa **fechado** (alterando o passado) e **nada** do caixa que pagou | 0 (`valor_caixa_estornado=0`) | **NÃO REPRESENTADA na gaveta real** (P1-04) |
| **Cancelamento, caixa da venda FECHADO** | sai da gaveta que pagou | zera o caixa fechado retroativamente; nada no que pagou | **debita o contador do caixa fechado** | **NÃO REPRESENTADA** + mutação pós-fechamento |
| `movimentos_caixa` legado | ± | sim (5) | não | Fonte legada ainda somada — risco de dupla contagem se algo ainda escrever nela (nenhum escritor encontrado) |
| Diferença de fechamento | — | — | — | `valor_fechamento`/`fechamento_diferenca` gravados; recomputar depois muda o "valor sistema" |

## 4. Evidência empírica (harness local, `caixa-reconciliacao-contrato.test.sql`)
| Cenário | saldo_atual | sistema | esperado | Veredito |
|---|---|---|---|---|
| S1 venda dinheiro (fundo 50 + 100) | 150 | 150 | 150 | OK |
| S2 dividida 60 dinheiro + 40 PIX | 60 | 60 | 60 | OK |
| S3 parcial 60 pago + 40 a receber | 60 | 60 | 60 | OK |
| S4 venda 100, sangria 30, suprimento 10 | 80 | 80 | 80 | OK |
| S5 recebimento de título 50 | 50 | 50 | 50 | OK |
| S6 cancelamento no mesmo caixa aberto | 0 | 0 | 0 | OK |
| S7 devolução 50 (caixa da venda aberto) | 50 | 50 | 50 | OK |
| S8a devolução de venda de caixa **fechado** → caixa A | 100 | **50** | 100 | sistema diverge (passado mudou) |
| S8b …→ caixa B (aberto, pagou) | **100** | **100** | 50 | AMBOS divergem |
| S9a cancelamento de venda de caixa **fechado** → caixa C | **0** | **0** | 100 | AMBOS divergem |
| S9b …→ caixa D (aberto, pagou) | **100** | **100** | 0 | AMBOS divergem |
Conclusão: com caixa da venda aberto os dois modelos **coincidem** (S1–S7). O defeito é **uma única classe**:
*operação de dinheiro que ocorre depois do fechamento do caixa de origem* — hoje é atribuída ao caixa da venda,
nunca à gaveta que efetivamente pagou.
Em produção (55 caixas, 0 abertos): 27 divergem entre contador e cálculo (maioria com contador zerado em caixa fechado;
`3c22d540` diverge em +50). Causa histórica não investigada. Drift de migration: a constraint de
`20260929120000` (fechamento exige dados) não aparece em produção.

## 5. Contrato proposto (para aprovação)
**C-1. Fonte de verdade.** O dinheiro esperado de um caixa é `calcular_valor_sistema_dinheiro_caixa`. Qualquer outro
número (contador, comprovante, tela) é derivado dele ou é bug.
**C-2. Atribuição por gaveta.** Uma operação de dinheiro pertence ao caixa **de onde o dinheiro entrou/saiu**, não ao
caixa da venda de origem. Vendas entram no caixa da venda; **devoluções, cancelamentos e estornos saem do caixa aberto que
paga**.
**C-3. Sentido.**
| Operação | Efeito no caixa que a executa |
|---|---|
| Fundo de abertura | + |
| Venda: parcela DINHEIRO | + |
| Venda: parcela PIX/cartão/**a receber** | 0 |
| Suprimento (dinheiro) | + |
| Sangria / pagamento AP em dinheiro | − |
| Estorno de movimento | inverte o original |
| Recebimento de título DINHEIRO | + |
| Estorno de recebimento DINHEIRO | − |
| Devolução / cancelamento pago em DINHEIRO | − (caixa aberto que paga) |
| Devolução / cancelamento em PIX/cartão/crédito de cliente | 0 |
**C-4. Caixa aberto.** Todo movimento exige `status='ABERTO'` no caixa que o executa; saldo resultante ≥ 0 para saídas
(mensagem de regra existente: `..._SALDO_CAIXA_INSUFICIENTE`).
**C-5. Caixa fechado é imutável.** Depois do fechamento, nenhuma operação altera o valor esperado daquele caixa.
Consequência: o cálculo não pode depender do `status` **atual** da venda para caixa fechado (hoje o cancelamento a
reescreve). É preciso decidir a representação (ver D-2).
**C-6. Idempotência.** Toda operação com efeito de caixa tem chave estável e efeito único: movimentos (caixa, chave);
liquidações (título, chave); devolução (venda, chave); cancelamento (status terminal); **crédito de venda em dinheiro:
hoje sem chave** — deve ser idempotente por `vendas_pagamentos.id`.
**C-7. Cancelamento/devolução.** Estorno na forma original do pagamento; a parte em dinheiro sai do caixa que paga (C-2),
proporcional ao pago em dinheiro e descontadas devoluções anteriores; parte a receber **reduz o título**, não o caixa.
**C-8. Comprovante.** Lista **todas** as parcelas do cálculo (fundo, vendas, recebimentos, suprimentos, sangrias, devoluções)
e soma exatamente o "valor sistema" gravado no fechamento (snapshot, não recomputado).

## 6. Decisões pendentes (bloqueiam a implementação)
- **D-1.** `saldo_atual`: remover, manter como **cache** derivado (recalculado por uma única rotina) ou manter só por
  compatibilidade? *(decisão do produto, adiada)*.
- **D-2.** Como atribuir ao caixa que paga sem novo ledger: (a) coluna `caixa_id` em `devolucoes`/`venda_pos_venda_operacoes`
  (e equivalente para cancelamento) preenchida com o caixa aberto que executa; ou (b) linha em `movimentacoes_caixa` com novo
  `tipo`. **Recomendação: (a)** — a informação já vive nessas tabelas e o cálculo passa a somar por `d.caixa_id`.
- **D-3.** Qual caixa paga quando o gerente executa e há vários abertos: parâmetro explícito na RPC vs. caixa do operador
  logado vs. único aberto da loja.
- **D-4.** Encerrar o componente legado `movimentos_caixa` (5)?
- **D-5.** Backfill/tratamento dos 27 caixas históricos divergentes (só relatório, sem correção automática).

## 7. Testes de reconciliação
- `backend/scripts/caixa-reconciliacao-contrato.test.sql` (**criado**, fora do CI): S1–S9 acima; passa em S1–S7 e
  **falha em S8/S9** até o PR-2 implementar C-2/C-5. Deve ser ligado ao CI quando passar.
- A criar no PR-2: idempotência do crédito de venda (C-6), comprovante = snapshot (C-8), imutabilidade pós-fechamento (C-5),
  cancelamento com parcela a receber (C-7).

## 8. Arquivos previstos no PR-2 (após aprovar §5 e §6)
`devolver_ou_trocar_venda` (base `20260821110000`), `cancelar_venda_transacional` (base `20260909200000`),
`calcular_valor_sistema_dinheiro_caixa`, `trg_creditar_saldo_caixa_venda_dinheiro`,
`registrar_liquidacao_receber`/`estornar_liquidacao_receber` (se D-1 = cache),
`caixaFechamentoServer.ts`, `cashSession.ts`, comprovante de fechamento, `devolverOuTrocarVenda.impl.ts`,
`caixaVendas.impl.ts` (cancelamento) e os testes de §7.
