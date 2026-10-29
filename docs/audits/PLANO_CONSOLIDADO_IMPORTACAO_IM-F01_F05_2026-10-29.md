# Plano consolidado — Bloco de Importação (NF-e de entrada) — IM-F01 a IM-F05

- **Data:** 2026-10-29
- **Base:** `origin/main` @ `02af24a0`; branch `claude/jinlong-import-block-audit-6a5135` @ `677f6132`
- **Natureza:** somente leitura e planejamento. Nenhum código, migration, commit, merge ou deploy. Orçamento adicional R$ 0,00.
- **Relaciona-se a:** [AUDITORIA_BLOCO_IMPORTACAO_2026-10-29.md](./AUDITORIA_BLOCO_IMPORTACAO_2026-10-29.md) (revisada por este documento, ver §1)
- **Status:** aguardando autorização para iniciar **qualquer** sprint. Pontos de decisão na §9.

---

## 1. Correções ao relatório anterior

| # | Inconsistência | Correção |
|---|---|---|
| C1 | A matriz tinha 13 linhas, mas o percentual (45%) foi calculado sobre 10. | Todo o cálculo agora usa as **13 linhas** (ver §2). |
| C2 | Um único eixo ("PASSOU/PARCIAL") misturava implementação, teste e homologação. | Três eixos independentes por linha (§2.1). |
| C3 | "NF-e ignora frete/seguro" era impreciso: o parser **nem lê** `vFrete`, `vSeg`, `vOutro`, `vDesc`, `vProd`, `vNF` nem `ICMSTot` (`nfeParser.ts` não contém essas tags). | Corrigido: ausência de leitura, não de uso. |
| C4 | Estimativa de 7,5 semanas-pessoa foi subdimensionada: não contava ~25 escritores de estoque e a migração deles. | Nova estimativa: **56 dias-dev ≈ 11 semanas-pessoa** (faixa de ±30%), ver §5. |
| C5 | "Custo médio" foi tratado como um item. Na prática, é uma mudança de arquitetura em todos os escritores de estoque. | Tratado como arquitetura na §4. |
| C6 | Afirmei que AP tinha idempotência por status. Ela existe só como guarda de status na função; não há chave única no banco. | Mantido e detalhado em IM-F03. |

### 1.1 Percentual revisado (método consistente, 13 linhas)

Cada linha recebe três marcas binárias: **Implementada** (função/tabela existe e está ligada ao fluxo da NF-e), **Testada** (existe suíte automatizada no repositório que cobre o requisito), **Comprovada em homologação** (há evidência documentada de execução em homologação).

Métrica: `(impl + test + homol) / 39`.

Resultado: **19 / 39 = 49%**. Por eixo: implementada 9/13 (69%), testada 9/13 (69%), homologada 1/13 (8%). Nenhuma suíte foi executada no banco nesta auditoria.

**Leitura correta:** o número de 49% superestima. O eixo que importa para o primeiro cliente é o de homologação (8%). Os 69% de "testada" indicam existência de arquivo de teste, não que passou.

---

## 2. Matriz de estado (13 linhas)

Legenda: I = implementada, T = testada (suíte existe), H = homologada. Cada 1 ou 0.

| # | Requisito | I | T | H | Evidência principal |
|---|---|---|---|---|---|
| 1 | Importação XML (leitura) | 1 | 1 | 0 | `lib/nfe/nfeParser.ts`; `nfeParser.test.ts` (executado: passou) |
| 2 | Associação de produtos ao catálogo | 1 | 0 | 1 | `211_vinculos_fornecedor_produto_depara`; S1c e G14 validados em homologação (PROXIMOS_PASSOS, 2026-10-29) |
| 3 | Conferência de quantidades | 1 | 1 | 0 | `registrar_conferencia_nfe` (`296`, `20260828150100`); `nfe-conferencia-*.test.sql` |
| 4 | Fornecedor sem CNPJ / cadastro | 1 | 1 | 0 | `20261005173427`; `nfe-manual-sem-cnpj.test.sql` |
| 5 | Custos complementares (frete, seguro, outras despesas, descontos) **no fluxo NF-e** | 0 | 1 | 0 | Parser não lê; `landedCost.ts` existe só no pipeline internacional (testado, não integrado) |
| 6 | Rateio desses custos entre itens | 0 | 1 | 0 | `shared-core/src/import/rateio.ts` + `rateio.spec.ts`; não ligado à NF-e |
| 7 | Custo médio ponderado | 0 | 0 | 0 | `preco_custo_medio` nunca é gravado; `preco_custo` = último custo |
| 8 | Entrada de estoque | 1 | 1 | 0 | `confirmar_importacao_nfe` (`SSOT-003`, `S2`); `test-nfe-conferencia-concurrency.mjs` |
| 9 | Contas a pagar | 1 | 1 | 0 | `contas_pagar` por duplicata; `nfe-duplicata-invalida-aborta.test.sql` |
| 10 | Atualização de preços | 1 | 1 | 0 | Regra ×1,5 (`20261005173427:174`); `nfe-conferencia-margem-nao-bloqueia-estoque.test.sql`. **Viola D7** (ver §3) |
| 11 | Rastreabilidade | 1 | 0 | 0 | `chave_acesso UNIQUE` (`075:68`); `movimentos_estoque_log` (`034`). Sem XML guardado |
| 12 | Erros, duplicidade e reprocessamento | 1 | 1 | 0 | `chave_acesso UNIQUE`; `IMPORT_NFE_DUPLICATA_INVALIDA`; status `EM_CONFERENCIA` |
| 13 | Estorno / compensação | 0 | 0 | 0 | Nenhuma função de estorno de NF-e |

**Totais:** I = 9/13 · T = 9/13 · H = 1/13 · **49%** (19/39).

**Observação:** a linha 2 é homologada apenas no sentido S1c/G14 (vínculo na conferência). A linha 3 não é homologada porque S2 ainda não foi validado em homologação.

---

## 3. Decisões D1–D14: verificação

Critério: só propor reabertura quando houver conflito concreto com o código ou com um requisito obrigatório.

| ID | Status | Verificação |
|---|---|---|
| D1 | **CONFLITO (ver §9, P1)** | D1 fixa "quatro casas decimais internas". O requisito do MVP pede seis casas. A DECISÃO-06 do plano antigo (`docs/import-intelligence/13-PLANO-DE-CORRECOES.md`) fixa seis casas para o custo unitário. D1 e DECISÃO-06 não são consistentes entre si. |
| D2 | Compatível | `preco_custo_medio` mantido, sem cache novo. Plano: parar de gravar nele e expor por view. Estoque (`estoque`, chave `loja_id`+`produto_id`) passa a ser a fonte. |
| D3 | Compatível | Tolerância R$ 0,01 é o requisito. Não existe hoje reconciliação Σ duplicatas × valor (IM-F03). |
| D4 | Compatível | Exige chave única de AP por duplicata (IM-F03). Não há hoje (`contas_pagar` sem chave na duplicata). |
| D5 | Compatível | Importação internacional fica fora do MVP. Pipeline B (`import_*`) não grava em estoque, custo, AP nem preço. |
| D6 | Compatível | Transferência só dentro da mesma empresa (mesmo CNPJ-raiz da empresa). Custo médio sai com o remetente e entra no destino. |
| D7 | **Código em desacordo** | A regra ×1,5 altera `preco_varejo` sem autorização. D7 exige aviso de margem mínima e alteração por DONO ou GERENTE autorizado. Não é reabertura: é correção de código para cumprir D7. |
| D8 | Compatível com ajuste | D8 diz que custo aprovado não altera o médio antes do recebimento físico. Para entradas sem OC, confirmação = recebimento. Para entradas com OC, o crédito já segue D12. |
| D9 | Compatível | Legados (`importar_nfe_transacao`, `decrementar_estoque_seguro`, `finalizar_venda_transacional_canonica_v2`) ficam para aposentadoria planejada. Nenhum será revogado nesta sequência. |
| D10 | Compatível | Estorno e ajuste são permitidos a DONO (e GERENTE conforme P6). Nenhum caminho novo concede ADMIN. |
| D11 | Compatível | Nomes de UI e tickets devem separar "NF-e de Entrada" de "Importação Internacional". |
| D12 | Compatível, com dependência | O movimento de custo médio de entrada deve usar **a mesma quantidade** que `confirmar_importacao_nfe` credita (conferida − recebido físico). Qualquer nova escrita de custo precisa respeitar isso. |
| D13 | Compatível, com decisão pendente | Vendas históricas não são reescritas: `itens_venda.custo_unitario_snap` é imutável. Ajuste de CMV depende de política validada (P9). |
| D14 | Compatível | Produto e estoque continuam por loja. Custo médio é por loja. |

**Conclusão:** há **um** conflito real que exige decisão do dono (D1 × requisito de seis casas) e **uma** violação de decisão no código (D7, ×1,5). Nenhuma decisão aprovada precisa ser reaberta, exceto se o dono escolher alterar D1 por P1.

---

## 4. Arquitetura de custos

### 4.1 Diagnóstico atual

- **Estoque por loja:** tabela `estoque`, única por `(loja_id, produto_id)` (`032_lojas_estoque_por_loja.sql:62`). Não tem coluna de custo.
- **Custo:** `produtos.preco_custo` (último custo) e `produtos.preco_custo_medio` (`numeric(10,2)`, default 0, **nunca gravado**). Custo em `numeric(10,2)` também em `importacoes_nfe_itens.custo_unitario` (`296:100`) e `itens_venda.custo_unitario_snap` (`235`, `20260731200800`).
- **Escritores de estoque:** o grep de `UPDATE`/`INSERT` em `estoque` aponta **63 migrations** e, nas últimas definições, cerca de **25 funções reais** entre vendas, cancelamento, devolução, transferência, remessa, OC (`_oc_creditar_item`), conferência, NF-e, criação de produto com estoque inicial, ajuste manual e caixa. Lista de referência: `decrementar_estoque_seguro`, `decrementar_estoque_idempotente`, `baixar_estoque_venda`, `finalizar_venda_transacional_canonica_v2/v3`, `registrar_venda_com_itens`, `cancelar_venda_transacional`, `devolver_ou_trocar_venda`, `transferir_estoque_seguro`, `transferir_estoque_entre_lojas`, `confirmar_remessa_entrada`, `criar_confirmar_remessa_entrada`, `registrar_conferencia_remessa`, `receber_ordem_compra`, `registrar_conferencia_ordem_compra`, `_oc_creditar_item`, `_oc_abater_por_produto`, `encerrar_ordem_compra_com_falta`, `importar_nfe_transacao`, `confirmar_importacao_nfe`, `registrar_conferencia_nfe`, `criar_produto_com_estoque_inicial`, `ajustar_estoque_manual`, `ajustar_estoque_manual_seguro`, `fiscal_reprocessar_documento`. **A lista exata deve ser confirmada no M00 de IM-F01** (ver §5).
- **Bloqueio por linha:** `FOR UPDATE` já é usado em ajuste (`20261005224553`) e transferência (`20260828140000`). Não é uniforme.

### 4.2 Decisão de arquitetura proposta

**Um único ponto de escrita de saldo e custo.** Criar `internal.estoque_movimentar(...)` (SECURITY DEFINER, `search_path` fixo, sem `GRANT` para `authenticated`) que:

1. Adquire `FOR UPDATE` na linha de `estoque (loja_id, produto_id)`.
2. Recebe: `loja_id`, `produto_id`, `delta_quantidade`, `custo_unitario` (só em entradas), `tipo_movimento`, `origem_tipo`, `origem_id`, `ator`.
3. Calcula o novo saldo e o novo custo médio ponderado: `novo_medio = (saldo_antes × medio_antes + delta × custo) / (saldo_antes + delta)` para entradas. Em saídas, o custo unitário é o médio atual e o médio não muda.
4. Grava `estoque` (saldo e `custo_medio`) e registra em `movimentos_estoque_log` os campos novos: `custo_unitario`, `custo_medio_antes`, `custo_medio_depois`, `saldo_antes`, `saldo_depois`.
5. Não atualiza `produtos.preco_custo_medio`. Esse campo passa a ser lido de uma view (`produtos_custo_medio_v`) para compatibilidade (D2).

**Todos os escritores listados em 4.1 passam a chamar essa função** (migração por escritor, §5, IM-F01). Nenhuma atualização isolada na importação.

Regras de custo por tipo de movimento (proposta):

| Movimento | Custo da saída / entrada | Efeito no médio |
|---|---|---|
| Venda, baixa por venda | médio atual | nenhum |
| Cancelamento de venda | custo do item vendido (`custo_unitario_snap`) | reentrada, altera médio |
| Devolução / troca | custo do item vendido (`custo_unitario_snap`) | reentrada, altera médio |
| Entrada por NF-e / OC / remessa | custo final unitário (vProd + complementares − descontos, ver IM-F02) | altera médio |
| Transferência entre lojas da mesma empresa | médio do remetente sai; entra no destino com esse custo | altera médio do destino |
| Ajuste manual positivo | médio atual (ou custo informado, ver P8) | altera médio se custo informado |
| Ajuste manual negativo | médio atual | nenhum |
| Estorno de entrada | custo original da entrada (ver IM-F03) | reverte |
| Estoque inicial (criar produto) | custo informado | altera médio |
| Ajuste de custo posterior (NF-e chega após recebimento) | diferença de custo, quantidade zero | altera médio (ver P4) |

### 4.3 Concorrência e multi-loja

- Lock em `estoque (loja_id, produto_id)` dentro da mesma transação do movimento e do lançamento financeiro. Sem lock, duas entradas simultâneas calculam médios diferentes.
- Ordem de lock fixa para transferência: menor `(loja_id, produto_id)` primeiro, para evitar deadlock entre duas transferências cruzadas.
- Isolamento: a função recebe `loja_id` e valida `fp_pode_loja` antes de qualquer escrita. Multiempresa: `estoque` não tem `empresa_id` próprio; o isolamento vem de `loja_id → lojas.empresa_id`. A função deve validar a empresa da loja, não confiar no cliente.
- Saldo zero: `novo_medio` quando `saldo_antes + delta = 0` é o custo da entrada (sem divisão por zero); saldo negativo não é permitido (P5).

### 4.4 Histórico e reconstrução

- Com `custo_medio_antes/depois` no log, o médio de qualquer data pode ser reconstruído somando movimentos. Esse é o teste de integridade de IM-F01.
- **Data de corte e abertura (D1):** o médio inicial de cada `(loja, produto)` precisa de uma semente. Proposta: `preco_custo` atual como semente, marcada no log como `ORIGEM=ABERTURA_NAO_AUDITADA` até contagem física (P8).

### 4.5 Por que não atualizar só na importação

Se só `confirmar_importacao_nfe` calcular o médio, a venda reduz saldo sem tocar o custo, a transferência copia o custo antigo, e o ajuste manual altera saldo sem custo. O resultado é o mesmo produto com saldos e custos inconsistentes entre escritores. Por isso a função central é obrigatória antes do cálculo.

---

## 5. Sprints

Estimativas: dias-dev de um engenheiro com conhecimento do repositório. Premissa: uma migração de escritor de estoque ≈ 0,5 dia de código + 0,5 dia de teste. Faixa de incerteza ±30%.

### 5.1 Dependências entre sprints

```
S0 (decisões P1–P9)
  └── IM-F01 (precisão + custo médio + função central + migração dos escritores)
        ├── IM-F02 (complementares + rateio; alimenta o custo de entrada)
        ├── IM-F03 (AP idempotente; estorno usa custo médio de F01)
        └── IM-F04 (preço sugerido usa médio de F01; XML depende de P11)
              └── IM-F05 (homologação integral de tudo)
```

IM-F03 pode começar a parte de AP (chave única, reconciliação) em paralelo ao fim de IM-F01, porque toca tabelas diferentes. A parte de estorno só começa depois de F01 estar em homologação.

**Regra de exclusividade:** F01, F02 e a parte de estorno de F03 alteram as mesmas funções de escrita de estoque. Não podem rodar em paralelo na mesma função.

---

### IM-F01 — Precisão e custo médio

- **Escopo:** precisão de custo com seis casas (salvo decisão diferente em P1); função `internal.estoque_movimentar`; migração dos escritores de estoque; `preco_custo_medio` deixa de ser gravado; log com custo e saldo antes/depois; modo sombra (calcula o novo médio em paralelo e compara com o escritor antigo, sem persistir) antes da troca.
- **Dependências:** P1 (escala), P2 (semente), P8 (abertura). Inventário confirmado (M00).
- **Migrations propostas** (nomes indicativos):
  - `M00_inventario_escritores_estoque` — só consulta; gera lista no relatório.
  - `M01_custo_precisao_6_casas` — `ALTER` de `produtos.preco_custo`, `importacoes_nfe_itens.custo_unitario`, `itens_venda.custo_unitario_snap`, `nfe_conferencia` (se separado). Exige `DROP VIEW produtos_custos` e `DROP TRIGGER trg_produtos_margem_bu` antes e recriação depois, como no plano anterior (`13-PLANO`, Fase 2). Impacto: reescrita de `itens_venda` (medir lock em clone).
  - `M02_estoque_custo_medio_schema` — `estoque.custo_medio numeric(18,6) NOT NULL DEFAULT 0`, `estoque.saldo_custo` se necessário; ampliação do log `movimentos_estoque_log`.
  - `M03_internal_estoque_movimentar` — função central, revogada de `PUBLIC/anon/authenticated`, `GRANT` só a `service_role` e às funções internas.
  - `M04..M14` — uma migration por escritor (ver §4.1), cada uma com rollback. Os escritores de venda (`finalizar_venda_*`, `baixar_estoque_venda`, `decrementar_*`) são o caso de maior risco; devem ir primeiro em modo sombra.
  - `M15_produtos_custo_medio_view` — view de leitura de `preco_custo_medio` (compatibilidade, D2).
- **Testes:**
  - Unitário SQL: sequência de entradas com custos diferentes (média exata com 6 casas), saída não altera médio, saldo zero, transferência, cancelamento, devolução.
  - Reconstrução: soma dos movimentos reproduz o médio final em toda `(loja, produto)`.
  - Concorrência: `test-estoque-decremento-concurrency.mjs` e `estoque-ajuste-concorrente.test.mjs` estendidos para custo; duas entradas simultâneas.
  - Regressão: os 43+ scripts `backend/scripts/*.test.sql` sem mudança de status em relação ao baseline.
  - Sombra: diferença zero entre médio calculado e escritor antigo por N dias em homologação antes da troca.
- **Riscos:** mudança de margem percebida pelo PDV; reescrita de `itens_venda` com lock; escritores com `FOR UPDATE` diferente podem gerar deadlock após unificação.
- **Critérios de aceite:** toda `(loja, produto)` com `custo_medio` reconstruível pelo log; zero divergência em sombra; nenhum escritor de estoque sem chamar a função central; `preco_custo_medio` não recebe escrita.
- **Estimativa:** 20 dias-dev (M00 0,5; M01 2; M02 1; M03 3; M04–M14 em média 0,5 cada = 6; M15 0,5; testes e sombra 6; reserva 1).

### IM-F02 — Custos complementares e rateio

- **Escopo:** parser passa a ler `ICMSTot` (`vProd`, `vDesc`, `vFrete`, `vSeg`, `vOutro`, `vNF`) e `det/prod` (`vDesc`, `vFrete`, `vSeg`, `vOutro` por item); custo final unitário por item; rateio server-side com regra única; ajuste de custo posterior (NF-e chega após recebimento).
- **Dependências:** IM-F01 (usa `estoque_movimentar`); P2 (base de rateio), P3 (tributos no custo), P4 (ajuste posterior).
- **Migrations propostas:**
  - `F02_M01_importacoes_nfe_totais` — colunas `vprod`, `vdesc`, `vfrete`, `vseg`, `voutro`, `vnf` `numeric(18,6)` em `importacoes_nfe`; por item `vdesc_item`, `vfrete_item`, `vseg_item`, `voutro_item`, `custo_complementar_rateado`, `custo_final_unitario numeric(18,6)`.
  - `F02_M02_rateio_nfe` — função `internal.nfe_ratear_complementares(p_importacao_id)`, com `div`/`mod` (regra D-01 do plano antigo). Garantia: soma dos rateios = total exato (centavos residuais no maior item).
  - `F02_M03_confirmar_usa_custo_final` — `confirmar_importacao_nfe` passa `custo_final_unitario` para `estoque_movimentar`.
- **Testes:** rateio com resto de centavos (soma exata); desconto maior que custo rejeitado; frete em NF-e de item único; NF-e sem complementares (custo = vProd/fator, comportamento atual preservado); NF-e com ICMS recuperável (excluído conforme P3); fixture reaproveitado: `shared-core/src/import/rateio.spec.ts` e `docs/import-intelligence/fixtures/casos/04-*` e `05-*` (valor aduaneiro e peso), adaptados à NF-e.
- **Riscos:** tributação errada altera custo de todos os produtos; NF-e com `vDesc` no nível do item e do total exige regra explícita; NF-e de importação (com DI) não deve entrar nesse caminho.
- **Critérios de aceite:** custo final = vProd − vDesc + complementares, dentro de 1 centavo do total da nota; soma de rateio = total; ajuste posterior não duplica crédito de estoque (D12).
- **Estimativa:** 11 dias-dev (parser 2; migrations 2; rateio 3; ajuste posterior 2; testes 2).

### IM-F03 — Financeiro e estorno

- **Escopo:** (a) AP idempotente por duplicata; (b) reconciliação Σ duplicatas × valor da NF com tolerância R$ 0,01 (D3); (c) estorno seguro e auditável de NF-e confirmada.
- **Dependências:** P5 (saldo negativo), P6 (AP paga), P7 (quem estorna). Estorno depende de IM-F01 concluído.
- **Migrations propostas:**
  - `F03_M01_contas_pagar_chave_duplicata` — `contas_pagar.importacao_duplicata_id uuid NULL` com `UNIQUE` parcial (`WHERE importacao_duplicata_id IS NOT NULL`). Antes: checar duplicidade existente com consulta. Ligação por FK a `importacoes_nfe_duplicatas(id)`.
  - `F03_M02_reconciliacao_nfe` — função `internal.nfe_conciliar_duplicatas(p_importacao_id)`; `confirmar_importacao_nfe` passa a bloquear com `IMPORT_NFE_DIFERENCA_DUPLICATAS` quando |Σ − valor| > 0,01.
  - `F03_M03_estornos` — tabela `importacoes_nfe_estornos` (`id`, `empresa_id`, `loja_id`, `importacao_id` UNIQUE, `motivo`, `ator`, `criado_em`, `snapshot_antes jsonb`, `snapshot_depois jsonb`); `importacoes_nfe.status` ganha `ESTORNADA`.
  - `F03_M04_rpc_estornar_importacao_nfe` — RPC que: exige DONO (P7); bloqueia se alguma AP vinculada estiver paga (P6); bloqueia se o saldo atual de qualquer item for menor que a quantidade a estornar (P5); reverte cada item via `estoque_movimentar` com `tipo=ESTORNO_ENTRADA`; cancela AP `PENDENTE` vinculada; grava estorno. Idempotente por `UNIQUE (importacao_id)`.
- **Ponto técnico do estorno:** o médio após a entrada não pode ser "desfeito" tirando só a entrada, porque vendas posteriores já mudaram o saldo. A reversão calcula: `saldo_novo = saldo_atual − qtd`; `custo_medio_novo = (saldo_atual × medio_atual − qtd × custo_entrada) / saldo_novo` com `saldo_novo > 0`; se `saldo_novo = 0`, custo médio volta ao valor anterior à entrada. Este cálculo exige que as saídas posteriores não tenham consumido a quantidade (por isso P5 bloqueia).
- **Testes:** duplicata repetida (mesma duplicata, mesma NF) → segunda inserção rejeitada; soma de duplicatas com diferença de 0,01 aceita e 0,02 bloqueada; estorno com saldo suficiente reverte saldo e médio (reconstrução pelo log bate); estorno com venda posterior que consumiu a quantidade → bloqueado; estorno com AP paga → bloqueado; estorno duplicado → rejeitado; estorno concorrente com venda (lock) → um dos dois falha sem saldo negativo; permissão: GERENTE não estorna, DONO estorna, outra loja não estorna.
- **Riscos:** estorno contábil de AP paga fica fora do MVP; mudança de status `CONCLUIDA → ESTORNADA` afeta relatórios; `ON DELETE CASCADE` em `contas_pagar.importacao_nfe_id` (A-14 do plano antigo) deve ser trocado antes.
- **Critérios de aceite:** toda AP de NF-e tem chave única por duplicata; nenhuma NF-e confirmada sem reconciliação dentro da tolerância; estorno deixa estoque e AP consistentes com o log; cada estorno tem registro com antes/depois.
- **Estimativa:** 10 dias-dev (AP 2; reconciliação 2; estorno 4; testes 2).

### IM-F04 — Precificação e rastreabilidade

- **Escopo:** (a) remover a regra ×1,5 automática (D7); (b) sugestão de preço calculada com custo médio e margem alvo, aplicada só por ação explícita; (c) XML guardado com hash e acesso restrito; (d) trilha NF-e → movimento → AP.
- **Dependências:** IM-F01 (médio); P10 (margem alvo e fórmula); P11 (retenção de XML, DOC-01..05).
- **Migrations propostas:**
  - `F04_M01_preco_sugerido` — colunas `importacoes_nfe_itens.preco_sugerido numeric(14,2)` e `margem_resultante numeric(7,4)`; a sugestão é calculada, não gravada em `produtos`.
  - `F04_M02_remover_ajuste_automatico` — `importar_nfe_transacao` e `confirmar_importacao_nfe` deixam de alterar `preco_varejo`. Compatibilidade: produtos já alterados não são revertidos.
  - `F04_M03_xml_armazenado` — colunas `xml_storage_path text`, `xml_sha256 text` em `importacoes_nfe`; bucket privado com caminho `{empresa_id}/{loja_id}/{chave}.xml` (mesmo padrão de `import_documentos`, que já usa `empresa_id/operacao_id/...`). Imutável após confirmação.
  - `F04_M04_view_rastreio` — view `v_rastreio_entrada` ligando NF-e → movimento → AP.
- **Testes:** confirmar NF-e não altera `preco_varejo`; sugestão respeita margem mínima e gera aviso (D7); aplicar sugestão exige DONO ou GERENTE autorizado; XML: hash bate com o conteúdo; upload fora do caminho da empresa é negado; tentativa de sobrescrever XML confirmado é negada; view retorna cadeia completa.
- **Riscos:** XML tem dados pessoais (CPF em NF-e de pessoa física) — exige P11; produtos que hoje dependem da ×1,5 mudam de preço de venda no próximo cadastro.
- **Critérios de aceite:** nenhum caminho automático altera preço de venda; XML recuperável por hash; trilha completa para qualquer produto de uma entrada.
- **Estimativa:** 8 dias-dev sem XML; +3 com XML (após P11).

### IM-F05 — Homologação integral

- **Escopo:** execução de todas as suítes SQL e TS do bloco em homologação migrada; E2E ponta a ponta com auth real (`docs/import-intelligence/`, plano 1.4); drill de rollback; runbook de corte; aplicação em produção só com autorização.
- **Dependências:** IM-F01 a IM-F04 concluídos; alinhamento do Supabase local (PROXIMOS_PASSOS, 412 de 439 migrations).
- **Entregáveis:**
  - Roteiro E2E: importar XML → vincular → conferir → custo final → estoque (médio) → AP → preço sugerido → estorno.
  - Lista de suítes com status antes/depois. Não aceitar regressão sem registro.
  - Drill de rollback com `pg_dump --schema-only` idêntico.
  - Checklist de migration (`migration-sequence-guard`, `rpc-gate-guard`), label `deploy-prod:aprovado` quando for o caso.
- **Testes:** as suítes do §7.
- **Riscos:** homologação não reproduz produção (já ocorreu: parou em `20261019170000`); dados de produção não podem ser usados sem anonimização.
- **Critérios de aceite:** toda linha da matriz §2 em H=1, com evidência anexada; zero falha nova em regressão.
- **Estimativa:** 7 dias-dev de execução, sem contar a janela de aprovação e a aplicação em produção.

---

## 6. Estimativa total

| Sprint | Dias-dev |
|---|---|
| IM-F01 | 20 |
| IM-F02 | 11 |
| IM-F03 | 10 |
| IM-F04 | 8 (+3 com XML) |
| IM-F05 | 7 |
| **Total** | **56 (59 com XML)** ≈ **11–12 semanas-pessoa**, faixa ±30% (8–15 semanas) |

Ordem de execução: S0 → F01 → F02 → F03 (AP em paralelo a F01 tardio) → F04 → F05. Caminho crítico: S0 → F01 → F03 (estorno) → F05.

---

## 7. Matriz de rastreabilidade

Legenda: **Existe** = presente no repositório; **Novo** = a criar.

| Requisito | Função / tabela | Migration existente ou nova | Teste existente | Teste novo |
|---|---|---|---|---|
| Precisão 6 casas (custo) | `produtos.preco_custo`, `importacoes_nfe_itens.custo_unitario`, `itens_venda.custo_unitario_snap` | Existe `numeric(10,2)` (`001`, `296`, `235`); novo `F01_M01` | `pg.local.spec.ts` (não executado aqui) | Novo: caso 0,0045 sem perda |
| Custo médio ponderado | `estoque.custo_medio`, `internal.estoque_movimentar` | Novo `F01_M02`, `F01_M03` | `test-estoque-decremento-concurrency.mjs` (existe) | Novo: sequência e reconstrução |
| Escritores de estoque unificados | ~25 funções (ver §4.1) | Novo: migrações por escritor | `estoque-ajuste-concorrente.test.mjs`, `nfe-conferencia-margem-nao-bloqueia-estoque.test.sql` | Novo: um teste por escritor |
| Rateio de complementares | `importacoes_nfe_*`, `internal.nfe_ratear_complementares` | Novo `F02_M01`, `F02_M02` | `shared-core/src/import/rateio.spec.ts` (não ligado à NF-e) | Novo: soma exata |
| Ajuste de custo posterior | `confirmar_importacao_nfe` | Novo `F02_M03` | — | Novo |
| Idempotência de AP | `contas_pagar`, `importacoes_nfe_duplicatas` | Novo `F03_M01` | `nfe-duplicata-invalida-aborta.test.sql` (existe) | Novo: duplicata repetida |
| Reconciliação Σ duplicatas × valor | `internal.nfe_conciliar_duplicatas` | Novo `F03_M02`; base em `ssot_003` (existe) | — | Novo: tolerância 0,01 |
| Estorno seguro e auditável | `importacoes_nfe_estornos`, RPC `estornar_importacao_nfe` | Novo `F03_M03`, `F03_M04` | — | Novo: lista de §5 F03 |
| Precificação sugerida | `importacoes_nfe_itens.preco_sugerido` | Novo `F04_M01` | `nfe-conferencia-margem-nao-bloqueia-estoque.test.sql` (parcial) | Novo |
| Remoção da ×1,5 automática | `importar_nfe_transacao`, `confirmar_importacao_nfe` | Novo `F04_M02` | — | Novo: preço inalterado |
| XML seguro | `importacoes_nfe.xml_storage_path`, `xml_sha256`, bucket privado | Novo `F04_M03` | — | Novo: hash e escopo |
| Rastreabilidade | `v_rastreio_entrada` | Novo `F04_M04` | — | Novo |
| Isolamento multiempresa | `fp_pode_loja`, `lojas.empresa_id`, `import_*` (`empresa_id NOT NULL`) | Existe (`20261021130100`); tenant_guard pendente | `m1-multiempresa.test.sql` (não executado aqui) | Novo: loja A não lê NF-e nem estorna de loja B |
| Permissão por perfil | `usuario_perfil`, `fp_pode_loja` | Existe | `n1-preco-custo-authz-smoke.mjs` | Novo: GERENTE não estorna |
| Custo oculto ao OPERADOR | `produtos.preco_custo` (N1) | Existe (`20261009180000`, `20261009180001`) | `n1-preco-custo-authz-smoke.mjs` | — |
| Idempotência de entrada | `importacoes_nfe.chave_acesso UNIQUE` | Existe (`075:68`) | `nfe-manual-sem-cnpj.test.sql` | — |
| Crédito por recebimento físico (D12) | `confirmar_importacao_nfe` + S2 | Existe (`20261029160000`) | `ux04-oc-recebimento-parcial.test.sql` | Novo: custo usa mesma quantidade |

---

## 8. Riscos consolidados

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Custo médio divergir entre escritores durante migração | Alta | Alto | Função central obrigatória; modo sombra; zero divergência antes da troca |
| Reescrita de `itens_venda` travar o PDV | Média | Alto | Medir lock em clone; janela de manutenção; migração em duas fases |
| Tributação errada no custo | Média | Alto | P3 com validação contábil; fixture de regime |
| Estorno deixar AP e estoque inconsistentes | Média | Alto | Bloqueios P5/P6; transação única; teste de concorrência |
| XML com dados pessoais sem base legal | Média | Médio | P11 antes de F04 |
| Deadlock em transferência cruzada | Baixa | Médio | Ordem fixa de lock |
| Homologação não reproduz produção | Alta | Médio | Snapshot anonimizado; prova em banco antes do corte |

---

## 9. Pontos que exigem decisão do dono

**Decididos em 2026-10-29 (pelo dono):**

| # | Decisão |
|---|---|
| P1 | 6 casas decimais no custo, persistido e no cálculo. D1 deve ser atualizada por escrito (4 casas deixa de valer). |
| P2 | Rateio proporcional ao valor do produto (`vProd`). |
| P3 | Excluir ICMS recuperável; incluir IPI não recuperável. **Contador ainda precisa validar por regime** antes de IM-F02. |
| P4 | Ajuste de custo posterior (quantidade zero), sem reabrir recebimento. |
| P5 | Estorno bloqueado se o saldo atual for menor que a quantidade. Sem saldo negativo. |
| P6 | Estorno bloqueado no MVP quando houver AP paga. |
| P7 | Só DONO estorna. |
| P8 | `preco_custo` atual como semente, marcado como não auditado. Contagem física recomendada depois. |

P9 a P12 continuam abertos (CMV histórico, margem alvo, retenção de XML, importação internacional fora do MVP). P11 bloqueia IM-F04 (parte XML). Recomendação atual nas linhas abaixo.


| # | Ponto | Recomendação | Bloqueia |
|---|---|---|---|
| **P1** | Escala de precisão: D1 diz 4 casas internas; o requisito e a DECISÃO-06 dizem 6 casas | **6 casas persistidas e no cálculo.** D1 precisa ser atualizada ou a DECISÃO-06 revogada, por escrito | IM-F01 |
| **P2** | Base de rateio dos complementares | **Valor do produto (`vProd`)**, único dado disponível na NF-e sem cadastro adicional | IM-F02 |
| **P3** | Tributos no custo (ICMS recuperável, IPI, ST) | Excluir ICMS recuperável; incluir IPI não recuperável. **Contador valida por regime (Simples ou Lucro)** | IM-F02 |
| **P4** | NF-e que chega depois do recebimento físico | **Ajuste de custo posterior** (quantidade zero), sem reabrir movimento | IM-F02 |
| **P5** | Estorno com saldo já consumido por vendas | **Bloquear.** Saldo negativo só com decisão própria | IM-F03 |
| **P6** | Estorno com AP já paga | **Bloquear no MVP.** Estorno de pagamento fica para pós-MVP | IM-F03 |
| **P7** | Quem estorna | **DONO.** GERENTE não estorna | IM-F03 |
| **P8** | Semente do custo médio na abertura | **`preco_custo` atual**, marcada como não auditada, com contagem física recomendada | IM-F01 |
| **P9** | Ajuste de CMV de vendas passadas (D13) | Não reescrever venda; ajuste contábil em período corrente, com política contábil escrita | Pós-MVP |
| **P10** | Margem alvo e fórmula da sugestão de preço | Usar a margem já cadastrada em regras de preço da loja; sem fórmula nova | IM-F04 |
| **P11** | Retenção e dados pessoais do XML (DOC-01..05) | Decisão jurídica antes de armazenar | IM-F04 (parte XML) |
| **P12** | Importação internacional fora do MVP | Confirmar (D5 já aponta nessa direção) | Escopo IM-F05 |

**Nenhum sprint começa antes de P1, P2, P5, P6, P7 e P8.** P3 e P11 podem ser decididos durante F01, mas bloqueiam F02 e F04.

---

## 10. Ordem de execução recomendada

1. **S0 — decisões P1–P12** (dono e contador; sem código).
2. **IM-F01 M00** — inventário dos escritores (consulta somente; gera lista exata).
3. **IM-F01 M01–M03** — precisão, função central, log.
4. **IM-F01 sombra** — comparação em homologação, sem persistir.
5. **IM-F01 migração dos escritores**, do mais simples (`criar_produto_com_estoque_inicial`) ao mais complexo (`finalizar_venda_*`).
6. **IM-F02** — parser de totais, rateio, custo final.
7. **IM-F03** — AP por chave única e reconciliação (pode começar em paralelo ao item 5); estorno depois de F01 estar em homologação.
8. **IM-F04** — remover ×1,5; sugestão; XML após P11.
9. **IM-F05** — homologação integral e checklist de corte.

Cada item só começa com autorização explícita. Nenhuma migration é aplicada em produção sem autorização.

---

## 11. Pontos não verificados

- Lista exata dos escritores de estoque (§4.1) é aproximada: foi obtida por grep e pode incluir falsos positivos e deixar de incluir funções com nomes dinâmicos. O M00 de IM-F01 fecha isso.
- Suítes SQL e specs de `shared-core` não foram executadas (sem banco nesta sessão).
- As estimativas são de planejamento, sem medição de velocidade da equipe.
- Não foi verificado o estado de produção.
