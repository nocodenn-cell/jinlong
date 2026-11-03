# ADR-008 · Emenda 1 — Proposta técnica revisada: escritores de estoque, valoração e modo sombra

| Campo | Valor |
|---|---|
| **Status** | Proposta técnica revisada. **Não implementada.** Depende de D6 (validação contábil) antes de qualquer publicação em produção |
| **Data** | 2026-11-03 |
| **Base** | [ADR-008 vigente (intacto)](../adr/ADR-008-inventory-domain-boundary.md) · [Emenda 1](../adr/ADR-008-emenda-1-custo-medio.md) · banco isolado reconstruído a partir das 459 migrations |
| **Escopo desta etapa** | Mapear escritores, desenhar valoração sem fonte duplicada, definir modo sombra e critérios de aceite. **Sem migration, sem alteração do mecanismo atual, sem produção ou homologação** |

---

## 1. Decisões registradas (2026-11-03)

| # | Decisão | Consequência técnica nesta proposta |
|---|---|---|
| D1 | **Aprovado.** Inventory é dono da valoração derivada: custo por movimento e custo médio ponderado | Custo médio é gravado só pelo escritor canônico de inventory (§3) |
| D2 | **Aprovado com condições.** Custo médio por loja, com valoração preservada em transferências | Chave de média = `(loja_id, produto_id)`. Transferência carrega o custo (§4) |
| D3 | **Pendente.** Sem precedência entre custo NF-e e Landed Cost até validação contábil. Separar: custo fiscal, custo de aquisição, custo provisório e custo final | Taxonomia de custos documentada separadamente (§2). Nenhuma regra de precedência implementada |
| D4 | **Pendente.** Auditar movimentos históricos e qualidade dos dados antes da data de corte. Sem custo retroativo inventado | Movimentos anteriores ao corte ficam com `custo_indisponivel` (§5). Auditoria é pré-requisito da fase 2 |
| D5 | **Aprovado.** Registrar o custo atribuído à saída no momento da venda, preservando histórico | Reutiliza `itens_venda.custo_unitario_snap` já existente (§3.2) |
| D6 | **Obrigatório.** Validação contábil do método antes de qualquer publicação em produção | Bloqueia promoção do modo sombra para escrita (§6) |
| D7 | **Aprovado.** Modo sombra primeiro, sem alterar saldos, custos oficiais ou preços | Critérios de aceite em §6 |

---

## 2. Taxonomia de custos (D3: documentar, não decidir precedência)

Cada conceito tem campo e fonte próprios. Nenhum sobrescreve outro.

| Conceito | Definição | Fonte atual no banco | Dono |
|---|---|---|---|
| **Custo fiscal** | Base de cálculo tributário do item (ex.: valor aduaneiro, base de ICMS) | `import_itens.valor_aduaneiro_brl` (importação); `importacoes_nfe_itens.valor_total_documento` | Fiscal / import |
| **Custo de aquisição** | Valor documentado pago ou faturado pelo item | `importacoes_nfe_itens.custo_unitario` (escala 2 — D-10); `ordens_compra_itens.preco_unitario` (preço esperado, não faturado) | Compras |
| **Custo provisório** | Estimativa usada antes da apuração aprovada, rotulada como tal | Hoje: custo da NF-e gravado em `produtos.preco_custo` | Inventory (valoração) |
| **Custo final (landed efetivo)** | Custo apurado e aprovado pelo motor (S4) | `import_apuracao_itens.custo_unitario_brl` | Import |
| **Custo médio** | Média ponderada móvel do saldo por loja | **Inexistente hoje** (`produtos.preco_custo_medio` nunca gravado) | Inventory (D1) |

**Regra de não duplicação:** cada valor é gravado uma vez, no dono do conceito. Custo médio não copia custo de aquisição nem custo final; ele é **calculado** a partir do custo de entrada que a regra de D3 escolher.

---

## 3. Mapa dos escritores de estoque

Levantamento das definições **vigentes** no banco isolado (`prosrc` de `pg_proc`), não de arquivos de migration.

### 3.1 Escritores que alteram `estoque.quantidade_atual`

| Escritor (vigente) | Tipo de efeito | Lock | Idempotência | Kardex `tipo_codigo` | Custo hoje no movimento |
|---|---|---|---|---|---|
| `internal.decrementar_estoque_seguro` (chamado por `finalizar_venda_transacional_canonica_v4_unscoped`) | Saída por venda | `FOR UPDATE` em `estoque` | `estoque_baixas(venda_id, produto_id)` | `SAIDA_VENDA` | **Não** (`itens_venda.custo_unitario_snap` existe, não é lido aqui) |
| `internal.cancelar_venda_transacional` | Reposição por cancelamento | `FOR UPDATE` em `estoque` | por venda | `ENTRADA_DEVOLUCAO_CLIENTE` | Não |
| `internal.devolver_ou_trocar_venda` | Reposição por devolução/troca | `FOR UPDATE` em `estoque` | `idempotency_key` | `ENTRADA_DEVOLUCAO_CLIENTE` | Não |
| `internal.receber_ordem_compra` / `public._oc_creditar_item` | Entrada por OC | `FOR UPDATE` em `ordens_compra` e `estoque` | `ordens_compra_recebimentos(ordem_id, idempotency_key)` | `ENTRADA_OC` | Não (`ordens_compra_itens.preco_unitario` disponível) |
| `internal.confirmar_remessa_entrada` / `internal.criar_confirmar_remessa_entrada` | Entrada por remessa de loja | `FOR UPDATE` | `(loja_id, idempotency_key)` | `ENTRADA_REMessa_LOJA` (grafia divergente, A-12) | Não (`remessa_itens` não tem custo) |
| `internal.importar_nfe_transacao` / `internal.confirmar_importacao_nfe` | Entrada por NF-e | `FOR UPDATE` | `chave_acesso` | `ENTRADA_NFE` | Não (custo da nota em `importacoes_nfe_itens.custo_unitario`) |
| `internal.transferir_estoque_seguro` (wrapper público `public.transferir_estoque_seguro`, `authenticated`) | Saída origem + entrada destino | `FOR UPDATE` | `idempotency_key`; `transferencia_id` no kardex | `TRANSFERENCIA_SAIDA` / `TRANSFERENCIA_ENTRADA` | Não |
| `internal.ajustar_estoque_manual_seguro` (wrapper público `ajustar_estoque_manual_seguro`) | Ajuste manual (`COMPRA`, `PERDA`, `QUEBRA`, `ACERTO_INVENTARIO`, `OUTRO`) | `FOR UPDATE` + snapshot esperado | snapshot (`p_quantidade_esperada`) | `ENTRADA_AJUSTE` / `SAIDA_AVARIA` / `SAIDA_AJUSTE` | Não |
| `internal.criar_produto_com_estoque_inicial` (RPC 270) | Saldo inicial | `FOR UPDATE` | por request | (verificar) | Não |
| `public.transferir_estoque_entre_lojas` | **Legado** | sem `EXECUTE` para a API (SEC-06) | **nenhuma** | `TRANSFERENCIA_*` | Não |

### 3.2 Achados do mapa

1. **Nenhum escritor grava custo no kardex.** `movimentos_estoque_log` tem `quantidade_delta` e nenhuma coluna de valor. O kardex precisa ganhar colunas (§5).
2. **Venda já tem snapshot de custo.** `itens_venda.custo_unitario_snap` existe (migration 300, BR-03). A baixa de venda não o lê para o kardex. D5 pede exatamente isso: o custo atribuído à saída é o snapshot do momento da venda. A devolução deve usar o **mesmo** snapshot da venda original, não o custo médio atual.
3. **Entrada por remessa não tem custo.** `remessa_itens` não tem preço. A entrada precisa de custo do documento de origem (OC ou NF-e vinculada) ou fica `custo_indisponivel`.
4. **Duas implementações de transferência.** `public.transferir_estoque_entre_lojas` não tem idempotência e não é mais executável pela API. `internal.transferir_estoque_seguro` é a canônica. Proposta: remover o legado após confirmar que nenhum chamador o usa (busca no código: só testes de SEC-06 e tipos gerados).
5. **Ajuste com snapshot.** O ajuste compara saldo esperado com saldo atual antes de gravar. Qualquer escritor novo precisa manter essa proteção.
6. **Fonte de custo de entrada é heterogênea.** Três documentos com custo diferente em natureza (preço esperado, custo faturado, custo provisório). D3 decide a precedência; esta proposta só garante que a origem fica registrada no movimento.
7. **Precisão.** `importacoes_nfe_itens.custo_unitario` e `ordens_compra_itens.preco_unitario` têm escala de 2 casas em parte do caminho (D-10). A valoração precisa de escala ≥ 6 no unitário.

---

## 4. Modelo de valoração (sem fonte duplicada)

### 4.1 Onde cada coisa mora

| Dado | Tabela | Regra |
|---|---|---|
| Saldo | `estoque.quantidade_atual` | Inalterado (ADR-008 I1–I2) |
| **Custo médio vigente** | `estoque.custo_medio` (nova coluna, escala 6) | Escrito **somente** pelo escritor canônico, na mesma transação, com `FOR UPDATE` |
| Custo de cada movimento | `movimentos_estoque_log.custo_unitario`, `valor_total`, `custo_origem`, `custo_indisponivel` (novas colunas) | Snapshot imutável (I3) |
| Custo final publicado | `produtos.preco_custo` | Dono: products/import. **Não** é o custo médio |
| `produtos.preco_custo_medio` | Coluna existente | **Proposta:** deixar de ser fonte. Ver §4.3 |

### 4.2 Fórmula

```
Entrada (q > 0, custo c):
  se saldo_anterior > 0:  custo_medio' = (saldo_anterior × custo_medio + q × c) / (saldo_anterior + q)   [escala 6, HALF_UP]
  senão:                  custo_medio' = c                                                              [REINICIO]
  movimento.custo_unitario = c ; valor_total = q × c

Saída (q < 0):
  custo_medio inalterado
  movimento.custo_unitario = custo_medio vigente ; valor_total = |q| × custo_medio   (D5: snapshot)

Venda: custo_unitario = itens_venda.custo_unitario_snap (não o médio atual)
Devolução/cancelamento: custo_unitario = custo do movimento de saída original da venda
Transferência: origem sai ao custo_medio da origem; destino entra ao MESMO custo unitário (§4.4)
Ajuste: entrada usa custo informado com motivo; saída usa custo_medio vigente
```

**Conservação:** `Σ valor_total das entradas − Σ valor_total das saídas = estoque.quantidade_atual × estoque.custo_medio` (dentro da tolerância de arredondamento, com resíduo registrado). Essa é a invariante central dos testes de reconciliação (§6.2).

### 4.3 Ponto em aberto: `produtos.preco_custo_medio`

`produtos` tem uma coluna de custo médio **sem loja**, mas D2 define custo médio **por loja**. Manter as duas gera duas fontes. Propostas, a decidir antes da fase 2:
- (a) `produtos.preco_custo_medio` vira **projeção** somente leitura (view ou coluna gerada pela loja de contexto), sem escrita; ou
- (b) é removida da tela e de `produtos_custos`, e a UI passa a ler `estoque.custo_medio`.

Recomendação: (b), porque elimina a dupla fonte e não exige migration em produtos antes da fase 2.

### 4.4 Transferências entre lojas (requisito 6)

- Custo **acompanha o produto**: a entrada no destino usa o mesmo custo unitário da saída na origem. Não há reprecificação no destino.
- Conservação por transferência: `valor_total(saída origem) = valor_total(entrada destino)`, sem resíduo.
- As duas linhas de kardex compartilham `transferencia_id` (já existe). O custo é gravado nas duas.
- Locks em ordem determinística (`loja_id` crescente) para evitar deadlock entre transferências opostas. O wrapper atual faz lock de origem e destino; a ordem precisa ser verificada.
- Transferência para loja com saldo zero: `custo_medio` do destino vira o custo transferido (REINICIO).
- Transferência em cadeia (A→B→C): cada etapa carrega o custo de sua origem, o que mantém a conservação.

### 4.5 Como não duplicar a verdade

- Kardex é a **fonte histórica**. `estoque.custo_medio` é a **fonte corrente** e é derivável do kardex. A reconciliação (§6) verifica essa derivação continuamente.
- Nenhuma tela, adapter ou relatório recalcula custo médio por conta própria. Relatórios leem o kardex.

---

## 5. Migração e impacto (fase 2, não nesta etapa)

| Item | Impacto | Mitigação |
|---|---|---|
| Colunas novas em `movimentos_estoque_log` (nullable) | Aditivo | `custo_indisponivel = true` para histórico (D4) |
| `estoque.custo_medio` | Aditivo | Inicia como `NULL`, com flag de "não valorado" |
| Escritores (10 da tabela §3.1) | Alteram RPCs de venda, estoque e NF-e | Uma RPC de cada vez, cada uma com teste de regressão e feature flag |
| Relatório de margem por venda | Hoje usa `COALESCE(custo_unitario_snap, preco_custo)` (A-18) | Passa a usar o snapshot de movimento; vendas antigas ficam marcadas |
| `historico_precos_produto` | Hoje registra só `preco_custo` | Não muda. Custo médio fica fora do histórico de preço |
| Legado `transferir_estoque_entre_lojas` | Remoção | Após confirmação de que não há chamador |

**Ordem proposta (fase 2):** (1) auditoria D4; (2) colunas aditivas; (3) escritor de valoração em modo sombra; (4) migrar escritores um a um; (5) virar leitura de produção só após D6.

---

## 6. Modo sombra (D7)

### 6.1 Definição

Modo sombra **calcula** a valoração a partir do kardex e dos documentos de origem, **sem gravar** em `estoque`, `movimentos_estoque_log`, `produtos`, `historico_precos_produto` ou em qualquer tabela oficial. O resultado é comparado com o que o sistema hoje oferece.

**Implementação proposta:** função **somente leitura** (`STABLE`, sem `INSERT`/`UPDATE`) que recebe `(loja_id, produto_id, de, ate)` e devolve a sequência de movimentos com custo simulado e custo médio simulado. Nenhuma tabela nova é criada na fase sombra; os resultados vão para um relatório consultado sob demanda ou para um arquivo fora do banco.

### 6.2 Reconciliação

Três verificações, todas somente leitura:

| Verificação | Regra | Esperado |
|---|---|---|
| **R1 — quantidade** | `Σ quantidade_delta` do kardex = `estoque.quantidade_atual` por `(loja, produto)` | Já existe como `v_estoque_ledger_divergencia` (migration 20260801090000). Reaproveitar. Divergências existentes são listadas, não corrigidas |
| **R2 — valor** | `custo_medio_simulado` (fim do período) = referência independente calculada em TypeScript (`shared-core`) sobre o mesmo kardex | Igualdade exata em escala 6 |
| **R3 — conservação** | `Σ valor_total entradas − Σ valor_total saídas` = `quantidade_atual × custo_medio_simulado`, com resíduo ≤ tolerância declarada | Resíduo registrado por par |

### 6.3 Critérios de aceite do modo sombra

Todos obrigatórios para avançar à escrita (fase 2 com flag):

1. **Zero escrita.** Checksum (md5 de `estoque`, `movimentos_estoque_log`, `produtos`, `historico_precos_produto`) idêntico antes e depois de rodar a simulação sobre todo o período. Teste automatizado.
2. **R1 sem divergência nova.** Nenhum par novo além da lista de divergências já existentes no momento do início.
3. **R2 exato.** Em 100% dos pares de um conjunto de referência (dados de homologação anonimizados ou fixtures), `custo_medio_simulado` igual à referência TypeScript, escala 6.
4. **R3 dentro da tolerância.** Resíduo máximo declarado e não excedido.
5. **Determinismo.** Duas execuções sobre o mesmo snapshot produzem saída de mesmo hash.
6. **Cobertura declarada.** Percentual de movimentos com custo conhecido, por origem (`VENDA`, `OC`, `NFE`, `REMESSA`, `AJUSTE`, `TRANSFERENCIA`). Nenhum movimento com custo zero sem marca de `custo_indisponivel`.
7. **Casos de borda cobertos:** saldo zero, entrada após zerar, saída que zera, transferência em cadeia, devolução de venda antiga sem snapshot, ajuste de sinal oposto ao motivo, transferência com saldo insuficiente (deve falhar, não gerar valor).
8. **Concorrência.** Simulação em paralelo a escritas não altera o resultado de um snapshot fixado (`REPEATABLE READ` na consulta).
9. **Desempenho.** Tempo de execução para o maior `(loja, produto)` do banco de homologação dentro de orçamento definido na fase de auditoria.
10. **Parecer.** Validação contábil do método (D6) registrada antes de qualquer migração que passe a gravar.

### 6.4 Testes da fase sombra

| Nível | Teste | Evidência de aceite |
|---|---|---|
| Unitário (TS) | Fórmula de média, arredondamento HALF_UP, REINICIO, saída ao médio, transferência | Casos de referência com saídas esperadas fixadas |
| Propriedade (TS) | Conservação em sequências aleatórias de movimentos com semente fixa | Nenhuma violação de R3 em N sequências |
| Integração (SQL, BEGIN…ROLLBACK) | Cada escritor gera kardex com as colunas de custo vazias (fase sombra) e não altera `estoque` | Checksum idêntico |
| Concorrência (script com sessões reais, como D-04) | Duas escritas e uma simulação simultâneas | Resultado da simulação = snapshot fixado |
| Reconciliação (SQL + TS) | R1, R2, R3 sobre o banco de homologação (somente leitura) | Relatório com zero divergência nova |

---

## 7. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Regra de precedência (D3) escolhida sem parecer | Alta se não houver gate | D3 bloqueia escrita de custo médio com custo landed |
| Histórico incompleto (D4) gera média enganosa | Alta | `custo_indisponivel`; auditoria antes do corte |
| Escrita concorrente gera média inconsistente | Média | `FOR UPDATE` em `estoque`, ordem de locks, teste de concorrência |
| Alteração de muitas RPCs de venda | Alta | Uma por vez, flag, regressão; venda é a mais sensível |
| Dupla fonte com `produtos.preco_custo_medio` | Alta se nada for feito | Decisão §4.3 antes da fase 2 |
| Ambiente de homologação divergente de produção | Média | Reconciliação roda em homologação; produção só após aceite |

---

## 8. Próximos passos (sem implementação nesta etapa)

1. Auditoria D4: contagem e qualidade de movimentos históricos por origem e loja (somente leitura em homologação).
2. Decisão §4.3 (`produtos.preco_custo_medio`) e D3 (taxonomia aprovada, precedência pendente).
3. Parecer contábil do método (D6).
4. Implementar a função de simulação (somente leitura) e os testes da §6.4 na fase sombra, após autorização.
