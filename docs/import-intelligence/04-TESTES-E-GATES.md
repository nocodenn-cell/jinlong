# 04 — Testes e gates do Import Intelligence (proposta)

Matriz de testes exigida pela Etapa G, com evidência existente (arquivo e linha) e lacunas. Status:

- **EXISTE** — cobre o cenário no repositório atual.
- **PARCIAL** — cobre parte do cenário ou outra camada.
- **GAP** — não existe; precisa ser criado.

Os testes marcados como GAP testam funções que ainda não existem. Não é possível marcá-los como EXISTE a partir da análise.

---

## 1. Gates de aprovação

| Gate | Momento | Critério de passagem | Evidência exigida |
|---|---|---|---|
| **G0 — Auditoria** | Sprint 0 (agora) | Documentos 00 a 05 revisados; decisões DECISÃO-01 a 13 levadas à diretoria | Este conjunto de documentos aprovado |
| **G1 — Motor puro** | Fim da Sprint 1 | Motor passa T-DET, T-PREC, T-CONS, T-RND, T-RAT sem exceção; zero dependência de I/O | Relatório de testes unitários; saída de referência gravada |
| **G2 — Parser** | Fim da Sprint 1 | T-PARSE-01 a 04 passam; XML real anonimizado da importadora validado | Lista de XMLs usados e resultados |
| **G3 — Dados** | Fim da Sprint 2 | Migrations aplicadas só em clone de staging; contagens e somatórios idênticos antes e depois; rollback testado | Relatório de contagens; script de rollback executado em clone |
| **G4 — Integração** | Fim da Sprint 3 | T-IDEM, T-RET, T-PARC, T-EST, T-FALHA passam; sem escrita em `preco_custo` | Logs de integração |
| **G5 — Multiempresa** | Antes de qualquer dado de custo entre CNPJs | Suíte T-ISO completa (ESPEC §14, "Isolamento A × B") verde | Relatório por perfil e por tabela |
| **G6 — Publicação** | Antes de alterar `preco_custo` | DECISÃO-01 registrada; aprovação contábil; teste de margem comparativa | Ata de decisão; comparativo antes/depois |

**Regra geral:** nenhum gate é pulado. Falha em gate bloqueia a sprint seguinte.

---

## 2. Matriz de cenários da Etapa G

### 2.1 Precisão financeira

| ID | Cenário | Resultado esperado | Evidência existente | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-PREC-01** | Custo unitário com fração (`3.33333 ÷ 12`) | Escala 6 sem perda além da regra de arredondamento | `20261005173427:134,174,230` faz `ROUND(…, 2)`. Ver A-06 | GAP (o caso atual falha) | TS (motor) | G1 |
| **T-PREC-02** | Taxa de câmbio com 10 casas × valor em USD | Produto exato em inteiros escalados | Nenhuma | GAP | TS | G1 |
| **T-PREC-03** | Soma de valores em moedas diferentes | Erro `LANDED_CAMBIO_AUSENTE` ou soma recusada | Nenhuma. Entrada manual usa `valorEmCentavos` em `notaManualFinanceiro.ts:5-7` (só BRL) | GAP | TS | G1 |
| **T-PREC-04** | Valor com mais de 2 casas no XML (`vUnCom 1.23456`) | Preserva as casas até a persistência definida | `nfeParser.test.ts` não cobre fração | GAP | TS (parser) | G2 |

### 2.2 Conservação de valores

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-CONS-01** | `Σ custo_total_item = Σ componentes − descontos` | Diferença zero, senão `BLOQUEADO` | Nenhuma | GAP | TS | G1 |
| **T-CONS-02** | Despesa rateada em 3 itens | Σ partes = total da despesa, centavo a centavo | Nenhuma | GAP | TS | G1 |
| **T-CONS-03** | Quantidade de estoque = quantidade comercial × fator | Igualdade exata; diferença gera `LANDED_QTD_FATOR_INCONSISTENTE` | `20260904120000:150-160` calcula `q_entrada = q_com × fator` sem teste de igualdade com o banco | PARCIAL | SQL + TS | G1 |
| **T-CONS-04** | Soma de estoque recebido = soma de recebimentos da OC | Igual após cada entrada | `ux04-oc-recebimento-parcial.test.sql` | EXISTE (OC) | SQL | G4 |

### 2.3 Arredondamento

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-RND-01** | Arredondamento "meio" (`x.xxxx5`) | Modo definido em DECISÃO-06, aplicado de forma idêntica em TS e SQL | Nenhuma | GAP | TS | G1 |
| **T-RND-02** | Resíduo do unitário (`8056.5450 ÷ 1440`) | `residuo_unitario_brl = -0.0001200000` (escala 10). Fixture `15-exemplo-doc-02` | Fixture de referência existe (`fixtures/casos/15`); teste de implementação não existe | GAP (implementação) | TS | G1 |
| **T-RND-03** | Mesmo valor arredondado no TS e no Postgres | Igual para todo o conjunto de referência | Nenhuma. Motor SQL não existe | GAP | TS + SQL | G3 |
| **T-RND-04** | Custo de venda usa `custo_unitario_snap` numeric(10,2) | Escala suficiente ou documentada como limite | `20260621003100:15` | PARCIAL | SQL | G3 |

### 2.4 Rateio por critérios distintos

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-RAT-01** | Rateio por VALOR_ADUANEIRO | Proporcional ao valor; resíduo pelo maior resto | Nenhuma | GAP | TS | G1 |
| **T-RAT-02** | Rateio por PESO_BRUTO | Idem, base em kg | Nenhuma | GAP | TS | G1 |
| **T-RAT-03** | Rateio por VOLUME | Idem, base em m³ | Nenhuma | GAP | TS | G1 |
| **T-RAT-04** | Rateio por QUANTIDADE_ESTOQUE | Idem, base em unidades de estoque (não comerciais) | Nenhuma | GAP | TS | G1 |
| **T-RAT-05** | Despesa direta | Vai inteira para o item indicado | Nenhuma | GAP | TS | G1 |
| **T-RAT-06** | Peso ausente em um item, critério PESO | `LANDED_DADO_AUSENTE`, não zero | Nenhuma | GAP | TS | G1 |
| **T-RAT-07** | Soma da base zero | `LANDED_RATEIO_BASE_ZERO`, sem fallback | Nenhuma | GAP | TS | G1 |
| **T-RAT-08** | Critério sem justificativa | Recusado | Nenhuma | GAP | TS | G1 |
| **T-RAT-09** | Mudança de critério após cálculo | Nova versão; a anterior intacta | Nenhuma | GAP | SQL + TS | G4 |

### 2.5 Unidades distintas

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-UNI-01** | NF-e em caixa (`CX`), estoque em unidade (`UN`), fator 12 | Quantidade de estoque = 12 × comercial; custo unitário = total ÷ estoque | `20260904120000:150-160` (fator aplicado); `NotaManualForm.produto.behavior.test.tsx` (manual) | PARCIAL | SQL + TS | G1 |
| **T-UNI-02** | Fator zero ou negativo | `IMPORT_NFE_FATOR_INVALIDO` / `LANDED_FATOR_INVALIDO` | `20260904120000` lança `IMPORT_NFE_FATOR_INVALIDO` | EXISTE (SQL) | SQL | G1 |
| **T-UNI-03** | Fração de unidade (`0.5 CX`) | Escala 3 preservada; sem arredondar quantidade | Nenhuma | GAP | TS | G1 |
| **T-UNI-04** | Unidade sem fator cadastrado | Erro, não assume 1 | `v_fator := COALESCE(...,1)` em `20260904120000:139` assume 1 | **Achado**: default silencioso | SQL | G1 |

### 2.6 Repetição de requisições (idempotência)

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-IDEM-01** | Mesmo recebimento de OC com a mesma chave | Replay sem duplicar estoque | `ux04-oc-recebimento-parcial.test.sql`; `20260918100000:509-519` | EXISTE | SQL | G4 |
| **T-IDEM-02** | Mesma chave com payload diferente | `OC_IDEMPOTENCY_PAYLOAD_DIVERGENTE` | `ux04-oc-recebimento-parcial.test.sql`; `20260918100000:514-516` | EXISTE | SQL | G4 |
| **T-IDEM-03** | Remessa com a mesma chave e payload | Retorna id existente | `fase4-remessa-idempotencia-payload-hash.test.sql` | EXISTE | SQL | G4 |
| **T-IDEM-04** | Confirmação de NF-e chamada duas vezes | Segunda chamada falha por status, sem duplicar AP | `ssot_003:63-65`; `nfe-conferencia-concurrency` (`test-nfe-conferencia-concurrency.mjs`) | EXISTE (concorrência) | SQL / mjs | G4 |
| **T-IDEM-05** | Importação de mesma chave NF-e | Bloqueada pela unicidade | `075:68` (`chave_acesso UNIQUE`) | EXISTE (constraint) | SQL | G4 |
| **T-IDEM-06** | Cálculo de landed chamado duas vezes com mesmo input | Mesmo `input_hash`, mesma versão | Nenhuma | GAP | TS + SQL | G4 |
| **T-IDEM-07** | Retry após timeout no cliente | Mesma chave → mesmo resultado | Padrão existe em remessa e OC; não testado para import | GAP (import) | SQL | G4 |

### 2.7 Retificação documental

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-RET-01** | Documento posterior associado a remessa | Confirmação posterior sem novo estoque | `entrada-documento-posterior.test.mjs`; `20261005225856` | EXISTE | mjs | G4 |
| **T-RET-02** | Retificação de NF-e (novo XML para a mesma chave) | Recusa ou nova versão; nunca sobrescrever | Nenhuma. `chave_acesso UNIQUE` impede re-importação, sem fluxo de retificação | GAP | SQL | G4 |
| **T-RET-03** | Retificação de processo publicado | Nova versão; publicada anterior intacta | Nenhuma | GAP | SQL + TS | G4 |
| **T-RET-04** | Tributo retificado | Novo lançamento com `supersede_de` | Nenhuma | GAP | SQL | G4 |
| **T-RET-05** | Tentativa de UPDATE em custo publicado | Erro pelo banco | `movimentos_estoque_log` tem trigger análogo (`20260903190000:84-104`). Custo não | GAP | SQL | G4 |

### 2.8 Recebimento parcial

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-PARC-01** | OC de 100, entrega de 40, depois 60 | Estado `EM_TRANSITO` → `RECEBIDA`; soma 100 | `ux04-oc-recebimento-parcial.test.sql`; `20260918100000:379-400` | EXISTE | SQL | G4 |
| **T-PARC-02** | Entrega acima do saldo | `OC_QTD_ACIMA_SALDO` | `20260918100000:279-281`, `:549-551` | EXISTE | SQL | G4 |
| **T-PARC-03** | Encerramento com falta | Auditoria `encerrada_com_falta_*` | `ux04-oc-recebimento-parcial.test.sql` (verificar cobertura) | PARCIAL | SQL | G4 |
| **T-PARC-04** | NF-e de 80 vinculada a OC de 100, com 40 já recebidos | Abate 80 ou falha se saldo < 80 | `actions.vinculoOc.abateSaldo.test.ts` (TS) | PARCIAL | TS | G4 |
| **T-PARC-05** | Custo landed com entrega parcial | Custo calculado sobre a quantidade efetivamente recebida, e não sobre o pedido | Nenhuma | GAP | TS | G4 |
| **T-PARC-06** | Rateio de frete com entrega parcial em duas entradas | Frete rateado sobre o total da importação, e não sobre cada entrega | Nenhuma | GAP | TS | G4 |

### 2.9 Mercadorias com unidades distintas

Ver seção 2.5 (T-UNI-*).

### 2.10 Crédito fiscal pendente

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-FIS-01** | Tributo `PENDENTE_VALIDACAO` | Publicação bloqueada (`TRIBUTO_PENDENTE`) | Nenhuma | GAP | TS | G1 |
| **T-FIS-02** | `RECUPERAVEL_RECONHECIDO` sem `validado_por` | Rejeitado | Nenhuma | GAP | SQL | G4 |
| **T-FIS-03** | Crédito potencial não entra no custo | Custo idêntico com e sem potencial | Nenhuma | GAP | TS | G1 |
| **T-FIS-04** | Regra fora de vigência na data do documento | `TRIBUTO_REGRA_FORA_VIGENCIA` | Nenhuma | GAP | TS | G1 |
| **T-FIS-05** | Valor recolhido ≠ apurado | Aviso, não bloqueio | Nenhuma | GAP | TS | G1 |
| **T-FIS-06** | Glosa de crédito já reconhecido | Novo lançamento com `supersede_de`; custo recalculado conforme `incorpora_custo` | Nenhuma | GAP | TS | G1 |

### 2.11 Estoque parcialmente vendido

Esta seção é o cenário mais sensível. O custo de uma venda de estoque parcialmente vendido depende de **como o custo sai do estoque** (FIFO, custo médio ou custo atual). Hoje o sistema usa `custo_unitario_snap` no momento da venda (`20260806004637_300_br03_custo_unitario_snap_servidor.sql`, nota de BR-03), com fallback para `preco_custo` atual (A-18). **Não existe custeio por lote.** Qualquer custo landed novo precisa de DECISÃO sobre o método de baixa, que não está nesta matriz.

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-EST-01** | Custo landed muda após 50% das unidades vendidas | Vendas anteriores mantêm o snapshot; estoque restante usa o novo custo, conforme método definido | Snapshot de venda existe (`custo_unitario_snap`); método de baixa não existe | GAP (método) | SQL + TS | G4 |
| **T-EST-02** | Devolução de item de importação | Snapshot da venda original preservado | `kardex-unificado-anti-join-devolucao.matrix.test.ts`; `devolucao-troca-cadeia.test.ts` | PARCIAL (estrutura) | TS | G4 |
| **T-EST-03** | Valor do estoque (`valor_imobilizado`) | Derivado do custo publicado, não do `preco_custo` atual | `127_kardex_vendas_imutavel.sql:320` usa `preco_custo` atual | **Achado** | SQL | G4 |
| **T-EST-04** | Ajuste manual de estoque após publicação | Não altera custo publicado | `estoque_ajuste_concorrente.test.mjs` cobre quantidade, não custo | PARCIAL | mjs | G4 |

### 2.12 Isolamento entre CNPJs

Esta seção depende de multiempresa (A-19). Enquanto a ESPEC não for implementada, só é possível testar isolamento **entre lojas**.

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-ISO-01** | GERENTE da loja A lê NF-e da loja B | Negado | `importacoes_nfe_gerente_all` (`075`), `test-rls-scope.mjs` | EXISTE (loja) | mjs/SQL | G5 |
| **T-ISO-02** | GERENTE da loja A opera OC da loja B | Negado (`OC_LOJA`) | `20260918100000:494-496` | EXISTE (loja) | SQL | G5 |
| **T-ISO-03** | DONO de empresa A opera OC de empresa B | **Deve ser negado.** Hoje permitido: DONO sem filtro de loja | Nenhuma. Não há empresa (A-08, A-19) | **GAP crítico** | SQL | G5 |
| **T-ISO-04** | GERENTE A1+A2 opera A2 | Permitido | Nenhuma. `usuarios.loja_id` único | GAP (multi-loja) | SQL | G5 |
| **T-ISO-05** | Custo landed de empresa A visível a empresa B | Negado | Nenhuma | GAP | SQL | G5 |
| **T-ISO-06** | Fornecedor de loja A sugerido para loja B | Não aparece | `fornecedores_loja_isolado` (`294:19-39`) | EXISTE (loja) | SQL | G5 |
| **T-ISO-07** | Tenant ausente no contexto | Negado (fail closed) | Parcial: `internal.financeiro_loja()` lança erro (`20261005004647:73-74`) | PARCIAL | SQL | G5 |
| **T-ISO-08** | Usuário sem vínculo ativo | Negado | Nenhuma (sem vínculo) | GAP | SQL | G5 |

### 2.13 Falhas de integração

| ID | Cenário | Resultado esperado | Evidência | Status | Camada | Gate |
|---|---|---|---|---|---|---|
| **T-FALHA-01** | XML malformado | Erro claro, nada gravado | `nfeParser.test.ts` (XML sem `infNFe`, sem chave) | EXISTE | TS | G2 |
| **T-FALHA-02** | Duplicata malformada | Aborta importação inteira | `nfe-duplicata-invalida-aborta.test.sql`; `nfeParser.ts:65-74` | EXISTE | SQL + TS | G2 |
| **T-FALHA-03** | Falha no meio da confirmação (estoque OK, AP falha) | Transação inteira revertida | Implícito na função (uma transação). Teste de falha injetada: nenhum | PARCIAL | SQL | G4 |
| **T-FALHA-04** | Falha de rede após RPC bem-sucedida | Retry com mesma chave é seguro | Padrão existe em remessa/OC; não testado para import | GAP (import) | TS + SQL | G4 |
| **T-FALHA-05** | Cotação de câmbio indisponível | Entrada manual obrigatória, sem valor padrão | Não há API nesta fase (DECISÃO-04) | N/A nesta fase | — | G1 |
| **T-FALHA-06** | Storage do XML indisponível | Importação recusada, sem gravar NF-e sem arquivo | Nenhuma. XML não é persistido (A-04) | GAP | TS | G3 |

### 2.14 Compatibilidade com módulos existentes

| ID | Suíte | Motivo | Status | Gate |
|---|---|---|---|---|
| **T-COMP-01** | Suítes listadas em ESPEC §14: `fase3-tenant-isolation-*`, `test-rls-scope`, `p0-rls-rest-smoke`, `rls-produtos-tenant-rest-smoke`, `sec04-*`, `run-financial-tests`, `test:e2e:critical` | Regressão de isolamento e financeiro | Existem no repositório (verificar execução) | Todo gate |
| **T-COMP-02** | `ocRecebimento.test.ts`, `ItensPedidoRecebimento.behavior.test.tsx` | Compatibilidade de UI de OC | EXISTE | G4 |
| **T-COMP-03** | `NotaManualForm.produto.behavior.test.tsx`, `notaManual.financeiro.test.ts` | Compatibilidade do cadastro manual | EXISTE | G4 |
| **T-COMP-04** | `vendaLabels.enums.test.ts` | Rótulos de movimento (A-12 deve ser corrigido aqui) | EXISTE (sem o caso `ENTRADA_REMessa_LOJA`) | G1 |
| **T-COMP-05** | `financeiro.spec.ts` e `inventory.spec.ts` em `shared-core` | Contratos de domínio existentes | EXISTE | G1 |
| **T-COMP-06** | Comparação de margem antes e depois de qualquer mudança de custo | Impacto em relatório de margem (A-18) | GAP | G6 |

---

## 3. Testes de determinismo (transversais)

| ID | Teste | Critério |
|---|---|---|
| **T-DET-01** | Mesma entrada 1000 vezes em ordem de itens aleatória | Saída idêntica byte a byte |
| **T-DET-02** | Ordem de chaves JSON diferente | Mesmo `input_hash` |
| **T-DET-03** | Caso de referência fixado (fixture `15-exemplo-doc-02`: `residuo_unitario = -0.0001200000`) | Valores fixos no teste |
| **T-DET-04** | Mudança de `engine_version` sem mudança de regra | Diferença zero na saída de referência |
| **T-DET-05** | Motor sem acesso a `Date`, `Math.random`, rede ou arquivo | Verificado por lint de importação em `shared-core/src/import/` |
| **T-DET-06** | Reprocessamento a partir do XML persistido | Mesma saída que o cálculo original |

---

## 4. Testes do parser (G2)

| ID | Cenário | Esperado | Evidência | Status |
|---|---|---|---|---|
| **T-PARSE-01** | `cProd "0012"` | String `"0012"` | Probe: retorna número `12` (`nfeParser.ts:95`) | **FALHA CONFIRMADA** |
| **T-PARSE-02** | `cEAN "07891234567890"` | String com zero à esquerda | Probe: `7891234567890` | **FALHA CONFIRMADA** |
| **T-PARSE-03** | `cProd` alfanumérico `"SKU-1"` | `"SKU-1"` | `nfeParser.test.ts:17` | EXISTE |
| **T-PARSE-04** | `vUnCom` com 10 casas | Preservado como string | Probe: convertido para número JS (`3.33333`). Para 5 casas o double basta, mas valores com mais dígitos significativos não são garantidos; a conversão deve ser evitada | **Achado** |
| **T-PARSE-05** | `ICMSTot` e `vFrete`, `vSeg`, `vOutro`, `vDesc` | Lidos e persistidos | Não lidos (A-11) | GAP |
| **T-PARSE-06** | `det/imposto` por item | Lido | Não lido | GAP |
| **T-PARSE-07** | Namespace `nfe:` | Tolerado | `removeNSPrefix: true` (`nfeParser.ts:94`) | EXISTE |
| **T-PARSE-08** | XML real da importadora, anonimizado | Passa sem perda | Nenhum XML de teste real no repositório | GAP (depende de amostra) |

**Correção sugerida para T-PARSE-01 e 02:** `parseTagValue: false` para `cProd`, `cEAN`, `cEANTrib`, `NCM`, `CNPJ`, `CPF`, `nNF` (campos textuais), mantendo a conversão numérica apenas para `qCom`, `vUnCom`, `vProd` (ou lendo-os como string e convertendo com o auxiliar decimal). Mudança de parser exige reprocessamento e teste de regressão contra o conjunto de XMLs de referência.

---

## 5. Testes obrigatórios por matriz de integração (ver `05-PLANO-DE-SPRINTS.md`)

| Integração | Testes mínimos |
|---|---|
| Recebimento OC → Import | T-PARC-01 a 06, T-IDEM-01/02, T-CONS-04 |
| Remessa → Import | T-IDEM-03, T-RET-01, T-CONS-03 |
| NF-e → Import | T-PARSE-01 a 08, T-IDEM-04/05, T-FALHA-02, T-NFE-* (A-02) |
| NF-e → AP (`contas_pagar`) | T-NFE-01 (soma das duplicatas), T-IDEM-04, T-FIS-06 |
| Kardex → Import | T-EST-01 a 04, T-CONS-03 |
| Produto → custo | T-RND-*, T-PREC-*, T-COMP-06 |
| Multiempresa | T-ISO-01 a 08 |

**T-NFE-01 (novo):** soma das duplicatas diferente do valor econômico da NF-e deve gerar `NFE_TOTAL_NAO_CONCILIADO` (A-02). Não existe hoje.

---

## 6. Resumo quantitativo

Contagem exata por linha de status da matriz (revisada na Sprint 0+):

| Status | Quantidade | Observação |
|---|---|---|
| EXISTE | 22 | Concentrados em OC, remessa, NF-e (SQL) e RLS por loja |
| PARCIAL | 10 | Estrutura existe sem o caso de custo |
| GAP | 45 | Quase todo o motor de landed, rateio, arredondamento e multiempresa. Para vários, já há **fixture de referência** (ver `fixtures/README.md`), mas não há teste de implementação |
| FALHA CONFIRMADA | 2 | T-PARSE-01 e T-PARSE-02 (parser, S1b) |
| ACHADO | 3 | T-UNI-04 (fator default 1), T-EST-03 (valor com custo atual), T-PARSE-04 |
| N/A | 1 | T-FALHA-05 |

**Leitura de "GAP":** significa que não há teste de implementação no repositório. Não significa ausência de especificação. Os fixtures em `docs/import-intelligence/fixtures/casos/` já cobrem, como referência, T-PREC-01, T-RND-01/02, T-RAT-01 a 07 (T-RAT-08 cobre a justificativa curta do fixture 08), T-UNI-02 (fator inválido, por 09), T-UNI-03 (fração de caixa, caso 20), T-CONS-02 e T-FIS-01 (tributo pendente, caso 12). Continuam sem fixture: T-PREC-02, T-PREC-03 parcial (só câmbio ausente), T-CONS-01 (explícito), T-FIS-04, T-FIS-05 e T-FIS-06 (pendências P-01 e P-03 em `07-MOTOR-CONTRATO-MINIMO.md` §11).

---

## 7. Evidências por gate (checklist)

- [ ] G1: relatório de cobertura do módulo `shared-core/src/import/` ≥ 95% em motor e rateio; saída de referência em `docs/import-intelligence/evidencias/` (a criar).
- [ ] G1: lint de importação prova ausência de I/O no motor (T-DET-05).
- [ ] G2: XMLs usados, com hash e origem anonimizada; T-PARSE-01 a 04 verdes.
- [ ] G3: relatório de clone de staging com contagens e somatórios antes e depois; script de rollback executado.
- [ ] G4: logs de T-IDEM, T-RET, T-PARC, T-EST, T-FALHA.
- [ ] G5: matriz de isolamento por perfil (DONO, GERENTE, GERENTE multi-loja, OPERADOR, usuário sem vínculo) × tabela × operação.
- [ ] G6: ata de DECISÃO-01; comparativo de margem antes e depois.
