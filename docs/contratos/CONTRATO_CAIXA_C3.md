# C3 — Contrato do caixa (dinheiro na gaveta)

Status: **contrato v2 — decisões D-1, D-2 e D-3 registradas; implementação NÃO aprovada.**
Sem novo ledger. `saldo_atual` **não é removido** agora.
Fonte dos fatos: corpo das funções em **produção** (`kbabmewnahysfvlybiak`, SELECT read-only) e harness
`backend/scripts/caixa-reconciliacao-contrato.test.sql` executado em Supabase local (2026-09-30).

## 0. Decisões do produto (registradas)
| ID | Decisão |
|---|---|
| **D-1** | `calcular_valor_sistema_dinheiro_caixa` é a **autoridade** para cálculo, reconciliação e fechamento. `saldo_atual` permanece só por compatibilidade/**cache** e **não pode decidir disponibilidade financeira**. Sem novo ledger. |
| **D-2** | A devolução carrega `caixa_id` **do caixa que desembolsa**; esse caixa recebe o impacto financeiro. **Nunca** alterar retroativamente um caixa fechado. Ex.: venda no caixa A (fechado) → devolução no caixa B (aberto) → impacto em B. |
| **D-3** | Exatamente **um** caixa aberto elegível → seleção automática. **Mais de um** → `caixa_id` explícito obrigatório. **Nunca** escolher primeiro/último/mais recente. |

Extensão proposta (mesma classe, **a confirmar**): D-2 e D-3 valem também para **cancelamento** de venda e para
**estorno de recebimento** — hoje os três atribuem o dinheiro ao caixa de origem.

## 1. Autoridade: `calcular_valor_sistema_dinheiro_caixa(p_caixa_id)`
Base de `fechar_caixa_atomico`, `fechar_caixa_pdv_atomico`, do comprovante (`caixaFechamentoServer.ts:18`,
`cashSession.ts:211`) e de gates existentes (A05). **Não lê `saldo_atual`.** É derivada:

| # | Componente | Sinal | Filtro relevante |
|---|---|---|---|
| 1 | `caixas.valor_inicial` (fundo) | + | — |
| 2 | `vendas_pagamentos` forma `DINHEIRO` | + | `vendas.caixa_id = caixa` e `vendas.status='CONCLUIDA'` |
| 3 | `vendas.total_liquido` legado | + | forma `DINHEIRO`, CONCLUIDA, **sem** linhas em `vendas_pagamentos` |
| 4 | `liquidacoes_receber` `DINHEIRO` | + recebimento / − estorno | `lr.caixa_id = caixa` |
| 5 | `movimentos_caixa` (legado) | + suprimento / − sangria | todos os status; ainda somado |
| 6 | `movimentacoes_caixa` | + suprimento dinheiro / − sangria / estorno inverte a origem | `status='aprovado'`, `deleted_at IS NULL` |
| 7 | `devolucoes` `DINHEIRO` | − | `vendas.caixa_id = caixa` (**caixa da venda**) e venda CONCLUIDA |

Propriedades e defeitos do cálculo em relação a D-2:
- **P-a.** O termo 7 atribui a devolução ao **caixa da venda**, não ao que desembolsa (viola D-2).
- **P-b.** Cancelamento **não tem termo próprio**: some porque a venda deixa de ser `CONCLUIDA` (termos 2, 3, 7) — o valor de um
  caixa **já fechado** muda retroativamente (viola D-2 e a imutabilidade).
- **P-c.** Parcela a receber nunca entra (só `vendas_pagamentos` pagos): coerente com "não lançar valor não recebido".
- **P-d.** Termo 5 (legado) segue somado; nenhum escritor atual o alimenta.

## 2. Matriz dos escritores de `caixas.saldo_atual`
Todos são `SECURITY DEFINER` com `UPDATE` direto. "Guard usa `saldo_atual`" = decide disponibilidade lendo o contador
(análise do texto do corpo em produção; confirmar linha a linha no PR-2). Nenhum chama o cálculo autoritativo.

| Escritor (migration vigente) | Origem (TS) | Δ no contador | Grava `movimentacoes_caixa` (tipo) | Exige ABERTO | `loja_id` / `caixa_id` | Idempotência | Concorrência | Guard usa `saldo_atual` |
|---|---|---|---|---|---|---|---|---|
| `trg_caixas_saldo_inicial_bi` | abertura de caixa (`cashSession.ts:129`) | `:= valor_inicial` | não | — | do caixa | — | — | — |
| `trg_creditar_saldo_caixa_venda_dinheiro` (`20260731195933`) | trigger em `vendas_pagamentos` | + dinheiro (INSERT) / + diferença (UPDATE) | não | **não** | caixa da venda | **nenhuma** | `FOR UPDATE` na venda | não |
| `registrar_movimentacao` (`20260731195704`) | `cashMovementWriter.ts:51` | suprimento +, sangria −, estorno inverte (só `aprovado`) | sim: `suprimento`/`sangria`/`estorno` | sim | `caixas.loja_id = usuarios.loja_id`; caixa do cliente | (caixa, chave) único | `FOR UPDATE` caixa e origem | **sim** (`saldo+Δ ≥ 0`) |
| `aprovar_movimentacao` (`20260909120000`) | `caixaMovimentacoes.impl.ts:130` | aplica sangria pendente | atualiza status e `saldo_antes/depois` (usa o `saldo_depois` da criação) | sim | da movimentação | só se `pendente`; token uma vez | `FOR UPDATE` | **sim** |
| `cancelar_venda_transacional` (`20260909200000`) | `caixaVendas.impl.ts:100` | − parte dinheiro proporcional | não (grava `devolucoes`) | **não** | **caixa da venda** | status `CANCELADA` | `FOR UPDATE` venda e caixa | **sim** (`CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE`, só se ABERTO) |
| `devolver_ou_trocar_venda` (`20260821110000`) | `devolverOuTrocarVenda.impl.ts:74` | − só se caixa **da venda** ABERTO; senão 0 | não (grava `devolucoes`, `venda_pos_venda_operacoes`) | efeito só se ABERTO | **caixa da venda** | `venda_pos_venda_operacoes.idempotency_key` | `FOR UPDATE` venda e caixa | **sim** (`DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE`) |
| `registrar_liquidacao_receber` (`20260814013447`) | `receivableWriter.ts:76` | + dinheiro | não (grava `liquidacoes_receber`) | sim | loja do título; `caixa_id` informado ou o único aberto | (título, chave) | `FOR UPDATE` título e caixa | não |
| `estornar_liquidacao_receber` (`20260814095445`) | `receivableWriter.ts:117` | − dinheiro | não | sim (caixa da liquidação original) | da liquidação original | chave + `operacao_origem_id` | `FOR UPDATE` | **sim** |

Indiretos via `registrar_movimentacao`: `estornar_movimentacao`, `registrar_pagamento_contas_pagar`, `estornar_pagamento_contas_pagar`.
`cancelar_movimentacao` só altera status de pendente. `fechar_caixa_*` **não** tocam `saldo_atual`.
**Escritores de `movimentacoes_caixa`:** `registrar_movimentacao` (INSERT), `aprovar_movimentacao` e `cancelar_movimentacao` (UPDATE).
Tabela restrita a `suprimento|sangria|estorno`; 7 linhas em produção.

**Violações de D-1:** cinco escritores decidem disponibilidade lendo o contador — `registrar_movimentacao`,
`aprovar_movimentacao`, `cancelar_venda_transacional`, `devolver_ou_trocar_venda`, `estornar_liquidacao_receber`.

## 3. Operações que mexem em dinheiro físico × o que a autoridade enxerga
| Operação | Dinheiro físico | Na autoridade (§1) | Lacuna |
|---|---|---|---|
| Venda: parcela dinheiro | entra no caixa da venda | sim (2/3) | — |
| Parcela a receber / PIX / cartão | não entra | não | — |
| Suprimento / sangria / estorno de movimento | ± | sim (6) | movimento **pendente** não conta (coerente) |
| Recebimento de título em dinheiro | entra | sim (4) | comprovante de fechamento não lista a linha (P2-18) |
| Estorno de recebimento | sai do caixa que paga | sim (4) — pelo `lr.caixa_id` da liquidação original | atribuído ao caixa **original**, mesmo fechado |
| Pagamento AP em dinheiro | sai | sim (via sangria `PAGAMENTO_AP`) | — |
| Cancelamento/devolução com caixa da venda **aberto** | sai | sim | — |
| **Devolução em dinheiro, caixa da venda FECHADO** | sai do **caixa aberto que paga** | subtrai do caixa **fechado** (P-a) e nada do que pagou | **NÃO REPRESENTADA** |
| **Cancelamento, caixa da venda FECHADO** | sai do caixa aberto que paga | zera o fechado retroativamente (P-b) e nada no que pagou | **NÃO REPRESENTADA** + mutação pós-fechamento |
| **Devolução/cancelamento sem NENHUM caixa aberto** | não há gaveta | aceito e registrado | **regra ausente** (S13) |
| **Vários caixas abertos** | qual gaveta paga? | não decide | **regra ausente** (S10, S12) |

## 4. Evidência empírica (harness local; 4 lojas isolam a contagem de caixas abertos)
| Cenário | saldo_atual (cache) | sistema (autoridade) | esperado | Veredito |
|---|---|---|---|---|
| S1 venda dinheiro (fundo 50 + 100) | 150 | 150 | 150 | OK |
| S2 dividida 60 dinheiro + 40 PIX | 60 | 60 | 60 | OK |
| S3 parcial 60 pago + 40 a receber | 60 | 60 | 60 | OK |
| S4 venda 100, sangria 30, suprimento 10 | 80 | 80 | 80 | OK |
| S5 recebimento de título 50 | 50 | 50 | 50 | OK |
| S6 cancelamento, caixa da venda aberto | 0 | 0 | 0 | OK |
| S7 devolução 50, caixa da venda aberto | 50 | 50 | 50 | OK |
| S8a devolução de venda de caixa **fechado** → A | 100 | **50** | 100 | autoridade diverge (passado reescrito) |
| S8b …→ B (único aberto, paga) | **100** | **100** | 50 | ambos divergem |
| S9a cancelamento de venda de caixa fechado → C | **0** | **0** | 100 | ambos divergem (contador do fechado alterado) |
| S9b …→ D (único aberto, paga) | **100** | **100** | 0 | ambos divergem |
| S10 devolução, 2 abertos, sem `caixa_id` | — | — | **rejeitar** | **ACEITA** (sem escolher gaveta) |
| S11 devolução com `caixa_id` explícito (C) | — | C=100 (esp. 50); A=250 (esp. 300) | aceitar | **API AUSENTE** (`p_caixa_id` não existe) |
| S12 cancelamento, 2 abertos, sem `caixa_id` | — | — | **rejeitar** | **ACEITO** |
| S13 devolução sem nenhum caixa aberto | — | — | **rejeitar** | **ACEITA** (registra devolução sem gaveta) |
Resultado: 7/7 cenários com caixa da venda aberto reconciliam; **10 divergências** concentram-se em uma classe —
*operação de dinheiro executada depois do fechamento do caixa de origem, sem gaveta definida.*
Em produção (55 caixas, 0 abertos): 27 divergem entre cache e autoridade (maioria com contador zerado em caixa fechado; `3c22d540`: +50).
Drift: a constraint de `20260929120000` (fechamento exige dados) não aparece em produção.

## 5. Contrato
**C-1 Autoridade.** O dinheiro esperado de um caixa é `calcular_valor_sistema_dinheiro_caixa`. Disponibilidade financeira (sangria,
estorno, devolução, cancelamento) **decide-se por ela**, não por `saldo_atual`. `saldo_atual` é cache: pode ser recalculado a partir da
autoridade, nunca o contrário.
**C-2 Atribuição por gaveta (D-2).** Vendas, suprimentos e recebimentos entram no caixa que os executa. Devolução, cancelamento e estorno
saem do **caixa aberto que desembolsa** (`caixa_desembolso_id`), com impacto só nele. Nunca no caixa fechado da venda.
**C-3 Seleção da gaveta (D-3).** Elegível = caixa `ABERTO` da mesma loja que o executor pode operar (dono do caixa ou GERENTE/DONO/ADMIN).
| Elegíveis | `p_caixa_id` | Resultado |
|---|---|---|
| 0 | — | rejeita (`*_SEM_CAIXA_ABERTO`) |
| 1 | omitido | usa o único |
| 1 | informado | valida que é o elegível |
| ≥ 2 | omitido | rejeita (`*_CAIXA_OBRIGATORIO`), sem efeito |
| ≥ 2 | informado | valida elegibilidade; senão `*_CAIXA_INVALIDO` |
Mesmos nomes de RPC, novo parâmetro `p_caixa_id uuid DEFAULT NULL` (compatível com chamadores atuais). Sem "primeiro/último/mais recente".
**C-4 Sentido.**
| Operação | Efeito no caixa que a executa |
|---|---|
| Fundo de abertura | + |
| Venda: parcela DINHEIRO | + |
| Venda: parcela PIX/cartão / valor a receber | 0 |
| Suprimento (dinheiro) | + |
| Sangria / pagamento AP em dinheiro | − |
| Estorno de movimento | inverte o original, no caixa que estorna |
| Recebimento de título DINHEIRO | + |
| Estorno de recebimento DINHEIRO | − |
| Devolução/cancelamento pago em DINHEIRO | − |
| Devolução/cancelamento em PIX/cartão; parcela a receber | 0 no caixa (parcela a receber reduz o **título**) |
**C-5 Caixa aberto e fechado.** Toda operação exige caixa executor `ABERTO`; saídas exigem `autoridade − valor ≥ 0`
(`*_SALDO_CAIXA_INSUFICIENTE`, medido pela autoridade). **Caixa fechado é imutável**: nenhuma operação posterior pode alterar seu
valor esperado nem seu contador. O comprovante mostra o **snapshot** do fechamento, não um recálculo.
**C-6 Idempotência.** Toda operação com efeito de caixa tem chave estável e efeito único: movimentos (caixa, chave); liquidações
(título, chave); devolução (venda, chave — o `caixa_id` faz parte do payload comparado no retry); cancelamento (status terminal);
**crédito de venda em dinheiro: hoje sem chave — passa a ser idempotente por `vendas_pagamentos.id`**.
**C-7 Cancelamento/devolução.** Reembolso na forma original; a parte dinheiro sai do caixa que paga (C-2), proporcional ao pago em dinheiro
e descontadas devoluções anteriores; a parte a receber reduz o título.
**C-8 Comprovante.** Lista todas as parcelas da autoridade (fundo, vendas, recebimentos, suprimentos, sangrias, devoluções pagas) e soma
exatamente o valor sistema gravado no fechamento.

## 6. Mudança de dados proposta (sem novo ledger)
- `devolucoes` e `venda_pos_venda_operacoes`: coluna **`caixa_desembolso_id uuid NULL`** (a coluna `caixa_id` existente de
  `venda_pos_venda_operacoes` guarda o caixa **da venda** e é mantida como origem). Linhas legadas: `NULL` ⇒ atribuição legada
  (`vendas.caixa_id`), de modo que **nenhum fechamento histórico muda**.
- Autoridade, termo 7: `SUM(d.valor)` agrupado por `COALESCE(d.caixa_desembolso_id, v.caixa_id)`; sem filtrar por `v.status` para linhas com
  `caixa_desembolso_id` (o efeito não depende do status **atual** da venda).
- **D-6 (nova)** — representação do cancelamento sem mutar caixa fechado. Recomendação: o cancelamento registra o reembolso em dinheiro na mesma
  família de tabelas (linha com `caixa_desembolso_id`) e a autoridade conta a venda cancelada **depois** do fechamento no caixa de origem
  (venda continua contribuindo; a saída aparece no caixa pagador). Cancelamentos legados (sem linha) mantêm o tratamento atual.
- `saldo_atual`: mantido por compatibilidade e recalculado a partir da autoridade por uma única rotina; nenhuma decisão o consulta (C-1).

## 7. Testes
| Teste | Cobre | Situação |
|---|---|---|
| `caixa-reconciliacao-contrato.test.sql` bloco A (S1–S7) | caixa aberto | **passa hoje** |
| bloco B (S8–S9) | devolução/cancelamento em caixa **fechado** | **falha hoje** (esperado) |
| bloco C (S10–S13) | vários / um / nenhum caixa aberto; `caixa_id` explícito | **falha hoje** (esperado) |
| A criar no PR-2 | idempotência do crédito de venda (C-6); comprovante = snapshot (C-8); imutabilidade do fechado após cancelar (C-5); guards por autoridade (C-1); troco/arredondamento | pendente |
Não ligado ao CI enquanto B/C falharem; entra no CI quando passar.

## 8. Decisões ainda abertas
- **D-4** Encerrar o componente legado `movimentos_caixa` (termo 5).
- **D-5** Tratamento dos 27 caixas históricos divergentes (só relatório, sem correção automática).
- **D-6** Representação do cancelamento (§6).
- **D-7** Confirmar a extensão de D-2/D-3 a cancelamento e estorno de recebimento.
- **D-8** Definição de "elegível" (dono do caixa ou gerente+) para o executor.

## 9. Arquivos previstos no PR-2 (após aprovação)
Migrations: `devolver_ou_trocar_venda`, `cancelar_venda_transacional`, `calcular_valor_sistema_dinheiro_caixa`,
`registrar_movimentacao`, `aprovar_movimentacao`, `estornar_liquidacao_receber` (guards pela autoridade),
`trg_creditar_saldo_caixa_venda_dinheiro` (idempotência), colunas `caixa_desembolso_id`.
TS: `devolverOuTrocarVenda.impl.ts`, `caixaVendas.impl.ts` (cancelamento), `caixaFechamentoServer.ts`, `cashSession.ts`, comprovante de fechamento, UI de escolha de caixa.
