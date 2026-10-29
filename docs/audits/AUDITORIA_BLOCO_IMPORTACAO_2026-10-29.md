# Auditoria de conclusão — Bloco de Importação (NF-e de entrada)

> **Revisão 2026-10-29 (pós-feedback):** o percentual de 45% deste relatório foi calculado sobre 10 de 13 linhas e com eixo único. Foi substituído por 49% (19/39, três eixos: implementada, testada, homologada) e a estimativa de sprints foi revista para 56 dias-dev. Correções completas e plano consolidado em [PLANO_CONSOLIDADO_IMPORTACAO_IM-F01_F05_2026-10-29.md](./PLANO_CONSOLIDADO_IMPORTACAO_IM-F01_F05_2026-10-29.md).

- **Data:** 2026-10-29
- **Base:** `origin/main` @ `02af24a0` (inclui #647 e #649); branch de trabalho `claude/jinlong-import-block-audit-6a5135` @ `ff76b326`
- **Modo:** somente leitura. Nenhum código, migration, commit, merge ou deploy. Nenhuma operação de escrita em produção.
- **Testes executados nesta auditoria:** Vitest em `pdv-importados` (`lib/nfe`, `lib/import/xml`, `app/gerente/estoque/importar-nfe`, `lib/import/hub`): **24 arquivos, 160 testes, todos passaram**.
- **Não executados:** suítes SQL (`backend/scripts/*.test.sql`, `pg.local.spec.ts`) e specs de `shared-core` (sem `node_modules` no worktree). Sem banco de homologação acessível nesta sessão. Logo, nenhuma linha da matriz recebe PASSOU por comprovação em banco.

---

## 1. Escopo e recorte

"Bloco de Importação" foi lido como **dois pipelines** que o código tem hoje:

| Pipeline | Entrada | Onde está | Estado |
|---|---|---|---|
| **A. NF-e de entrada** (compra de fornecedor) | XML de NF-e | `pdv-importados/app/gerente/estoque/importar-nfe/`, `lib/nfe/nfeParser.ts`, RPCs `importar_nfe_*`, `registrar_conferencia_nfe`, `confirmar_importacao_nfe` | Fluxo principal, em uso |
| **B. Importação internacional / landed cost** (Import Intelligence) | Operação de importação (DI/NF de importação, câmbio, despesas, tributos) | `pdv-importados/app/admin/importacoes/`, `lib/import/*`, `shared-core/src/import/*`, RPCs `import_*` | Módulo em DRAFT (#601), gated por `IMPORT_INTELLIGENCE` |

A matriz do pedido mistura os dois. O diagnóstico abaixo separa a origem de cada conclusão.

---

## 2. Fluxo ponta a ponta: o que de fato acontece

Fluxo pedido: **Importar NF-e → Conferir produtos → Calcular custos → Registrar recebimento → Atualizar estoque → Gerar contas a pagar → Atualizar preços.**

| Etapa | Implementação encontrada | Evidência | Situação |
|---|---|---|---|
| Importar NF-e | `nfeParser.ts` lê XML; `importar_nfe_transacao` (`20261005173427`) e `registrar_conferencia_nfe` (`296_nfe_conferencia`) gravam `importacoes_nfe` / `importacoes_nfe_itens`. `chave_acesso` é `UNIQUE` (`075_importacao_nfe_compra.sql:68`) | Teste de parser passa; `UNIQUE` na migration 075 | Existe. XML original **não** é persistido (nenhuma coluna/bucket para o XML em `importacoes_nfe`) |
| Conferir produtos / vincular | Vínculo fornecedor×produto (`211_vinculos_fornecedor_produto_depara`), `S1c` (vínculo na conferência), `G14` (produto equivalente, em `a29da7fc`) | Migrations presentes em `origin/main` | Existe; não comprovado em banco nesta auditoria |
| Calcular custos | NF-e: custo unitário = `vUnCom / fator` (`296`, `v_custo_unit := v_v_un / v_fator`). **Sem frete, seguro, outras despesas nem desconto.** Landed cost completo só existe no pipeline B | `296_nfe_conferencia.sql:319`; `shared-core/src/import/landedCost.ts` (com specs) | Pipeline A não calcula custos complementares. Pipeline B calcula, mas não se conecta ao A |
| Registrar recebimento | `registrar_conferencia_nfe` (quantidade conferida) + S1/S1c/S2 (recebimento físico × OC, crédito = `max(0, conferida − recebido físico)`) | `20261029140000_s1c`, `20261029160000_s2` (ambas em `origin/main`) | Existe. Fluxo de OC coberto por S2 |
| Atualizar estoque | `confirmar_importacao_nfe` (`internal`, `SSOT-003` em `20261007163100`) credita estoque pela quantidade conferida, com `FOR UPDATE` | Corpo da função | Existe. Transacional (função plpgsql única) |
| Gerar contas a pagar | Uma `contas_pagar` por duplicata (`SSOT-003`), status `PENDENTE`, com `nfe_importacao_id` | `20261007163100:165` | Existe. **Sem `UNIQUE (nfe_importacao_id, numero_duplicata)`** (S4 em aberto). **Sem reconciliação** Σduplicatas × valor da NF |
| Atualizar custo | `SET preco_custo = custo_unitario` (último custo, sobrescreve). Pulado quando `preco_varejo < custo` (guard de margem, `20260830110000`) | `20261007163100:143-149` | Parcial. **Não há custo médio** (ver §4) |
| Atualizar preço de venda | Na importação: `preco_varejo = GREATEST(custo × 1,5, 0,01)` (regra ×1,5, `20261005173427:174`) | Migration vigente | Parcial/risco. Regra ×1,5 ainda ativa (plano A-10/DECISÃO-09 pendente). Hub de precificação (`precificacao.ts`) **não** toca `produtos` |

**Conclusão do fluxo:** o caminho A (NF-e → conferência → estoque → contas a pagar) existe e é transacional no banco. Os pontos de custo (complementares, rateio, custo médio) e de preço (regra ×1,5) não estão no caminho operacional.

---

## 3. Integração entre os dois pipelines (ponto crítico)

- Nenhuma função `import_*` (pipeline B, 16 nomes distintos) escreve em `estoque`, `movimentacoes`, `contas_pagar` ou `produtos`. Verificado por grep no corpo de todas as migrations que definem essas funções.
- `import_aprovar_apuracao` é `GRANT` só para `service_role` (`20261021130100:832-833`), e grava apenas a apuração.
- O pipeline B **está isolado**: calcula e aprova uma apuração, mas o resultado não chega ao custo do produto, ao estoque nem ao financeiro.

**Consequência:** "Custos complementares", "Rateio" e "Entrada de estoque com custo landed" não têm caminho até o produto. Não se trata de bug de cálculo; trata-se de integração inexistente.

---

## 4. Matriz de conclusão

Critério de classificação: **PASSOU** (comportamento comprovado por teste de execução), **PARCIAL** (existe, mas falta requisito ou integração, ou não foi comprovado), **FALHOU** (defeito reproduzido), **NÃO IMPLEMENTADO**, **NÃO TESTADO**.

| Funcionalidade | Estado atual | Evidência | Pendência | Prioridade |
|---|---|---|---|---|
| Importação XML (NF-e) | PARCIAL | `lib/nfe/nfeParser.ts`, `nfeParser.test.ts` passa; `str()` preserva `cProd`/`cEAN` como texto (A-03 aparenta resolvido no parser); `num()` converte `vUnCom` em `Number` (float JS) | XML original não persistido (P9, depende de DOC-01..05). Sem teste SQL de rejeição de XML malformado nesta auditoria | P1 |
| Associação de produtos | PARCIAL | `211_vinculos…`, `S1c`, `G14`, `import_buscar_produtos` | Não comprovado em banco. Duplicidade de vínculo por fornecedor não verificada | P1 |
| Cadastro/identificação de fornecedores | PARCIAL | `294_fornecedores_multi_tenant`, `entrada_manual_fornecedor_sem_cnpj` (`20261005173427`) | Fornecedor sem CNPJ aceito (entrada manual), decisão de negócio pendente | P2 |
| Conferência | PARCIAL | `registrar_conferencia_nfe`, `S1c`, `S2` (D12) em `origin/main`; `nfe-conferencia-*.test.sql` existem | Testes SQL não executados aqui. Crédito parcial por recebimento físico depende de S2 em produção | P1 |
| Custos complementares (frete, seguro, despesas) | PARCIAL (calcula, não integra) | `landedCost.ts` + specs; `import_despesas` (`20261021130100`); NF-e ignora `vFrete/vSeg/vOutro/vDesc` | Ligar NF-e ao cálculo, ou decidir que MVP não os inclui | P0 para definir / P1 para implementar |
| Rateio de custos | PARCIAL (calcula, não integra) | `rateio.ts` + `rateio.spec.ts`; fixtures `04-rateio-*`, `05-rateio-*` | Nenhum rateio chega a `produtos`/`itens` do pipeline A | P1 |
| Custo médio | **NÃO IMPLEMENTADO** | `preco_custo_medio` existe (default 0) mas **nenhuma função grava nele** (grep em todas as migrations e no app). `preco_custo` guarda o último custo | Média ponderada móvel por loja (D1 / S3). Centralização dos escritores de estoque | P0 |
| Entrada de estoque | PARCIAL | `confirmar_importacao_nfe` (`SSOT-003`, `S2`), transacional | Sem estorno/compensação (ver §5). Quantidade via `fator` validada | P1 |
| Contas a pagar | PARCIAL | `contas_pagar` por duplicata (`SSOT-003`) | Sem `UNIQUE (nfe_importacao_id, numero_duplicata)` (S4). Sem reconciliação Σ duplicatas × valor (tolerância R$ 0,01 pendente) | P1 |
| Atualização de preços | PARCIAL (com risco) | Regra ×1,5 vigente (`20261005173427:174`); guard de margem (`20260830110000`); `atualizar_preco_varejo_produto_rpc` | Regra ×1,5 é arbitrária e não segue a precificação do hub. Decisão DECISÃO-09 pendente | P1 |
| Rastreabilidade | PARCIAL | `chave_acesso UNIQUE`; `import_auditoria` (hub); `N1` protege `preco_custo` do operador (em `origin/main`) | XML original não guardado (sem `sha256`). Ligação NF-e → movimentação de estoque → AP não comprovada | P1 |
| Tratamento de erros, duplicidade e reprocessamento | PARCIAL | `chave_acesso UNIQUE`; `IMPORT_NFE_DUPLICATA_INVALIDA` aborta importação inteira (`20260904120000`); `IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA` (`SSOT-003`) | Sem idempotência de AP por UNIQUE. Reprocessamento de NF-e cancelada/estornada inexistente | P1 |
| Rollback / compensação | **NÃO IMPLEMENTADO** | Nenhuma função de estorno/cancelamento de NF-e confirmada (grep `estorn|cancel|reverter` em NF-e: vazio) | Estorno que reverte estoque (kardex) e AP (somente se não paga) | P1 |

**Contagem (13 linhas: as 10 pedidas no roteiro + 3 extras de fornecedores, erros e rollback):**
- Sobre as 10 linhas pedidas: PASSOU **0** · PARCIAL **9** (XML, associação, conferência, custos complementares, rateio, entrada de estoque, contas a pagar, preços, rastreabilidade) · NÃO IMPLEMENTADO **1** (custo médio).
- Extras: fornecedores PARCIAL · tratamento de erros/duplicidade PARCIAL · rollback/compensação NÃO IMPLEMENTADO.
- FALHOU **0** (nenhum defeito reproduzido nesta auditoria). NÃO TESTADO: qualquer afirmação sobre comportamento em banco.

---

## 5. Defeitos e riscos (classificados)

| # | Risco | Evidência | Severidade |
|---|---|---|---|
| R1 | **Custo truncado a 2 casas.** `produtos.preco_custo` e `importacoes_nfe_itens.custo_unitario` são `numeric(10,2)`; `nfe_conferencia` também (`296:100`). Custo de R$ 0,0045 vira R$ 0,00 ou arredonda 100%. `ROUND(v_custo_unit, 2)` em `20261005173427:174,230` | Plano de correções P6/D-02/A-06 — **não aplicado** (nenhuma migration `numeric(14,6)` no repo) | **P0** |
| R2 | **Custo médio inexistente.** Last-cost sobrescreve; margem e relatório usam custo do último lote, não médio | §4 | **P0** para qualquer cliente com estoque de custos diferentes |
| R3 | **Estorno inexistente.** NF-e confirmada não tem caminho de reversão no sistema; erro de digitação ou devolução exige intervenção manual no banco | §4 | P1 |
| R4 | **AP sem UNIQUE.** Idempotência depende de status, não de chave de banco | `contas_pagar` sem índice único por `(nfe_importacao_id, numero_duplicata)` | P1 |
| R5 | **Regra ×1,5 aplicada automaticamente** ao `preco_varejo` no import | `20261005173427:174` | P1 |
| R6 | **XML não guardado** (sem prova documental para auditoria/fiscal) | Ausência de coluna/bucket em `importacoes_nfe` | P1 (depende de DOC-01..05) |
| R7 | **Pipeline B visível ao cliente sem decisão de módulo** (#601 DRAFT, S5 pendente) | `PROXIMOS_PASSOS.md` P0/P1 | P1 (oculto/gated por padrão no código, mas sem mapeamento plano→módulo) |
| R8 | **Autorização na aprovação do pipeline B é do servidor** (`import_aprovar_apuracao` só `service_role`) — correto para não expor, mas a checagem de papel fica na action | `20261021130100:832-833`; `requireModulo(..., { papeis: ['DONO','GERENTE'] })` em `importIntelligence.ts:55` | Baixo; revisar em teste de permissão |

**Isolamento multiempresa (verificado por leitura):**
- Tabelas `import_*` têm `empresa_id NOT NULL` e FK composta `(loja_importadora_id, empresa_id) → lojas(id, empresa_id)` (`20261021130100:33-46`). Bom.
- `PROXIMOS_PASSOS.md` registra que `import_*` ainda não tem `tenant_guard` (defesa em profundidade, sem vazamento encontrado). Pendência P1.
- RLS das tabelas `import_*` **não foi auditada linha a linha** nesta sessão. Marcar como NÃO TESTADO.
- Gate de módulo em todas as actions do hub (`requireModulo`). Bom.

**Integridade do custo e preço:** N1 (`20261009180000`, `20261009180001`) protege `produtos.preco_custo` do perfil OPERADOR (em `origin/main`). Bom.

---

## 6. PR #647 e #649

- **#647** (`56b959af`): mudou apenas `importar-nfe` (mensagem de bloqueio por falta de duplicatas, SSOT-003), i18n pt/zh, e `PROXIMOS_PASSOS.md`. **Não** resolve custo (R1), custo médio (R2), estorno (R3), AP sem UNIQUE (R4), ×1,5 (R5), XML (R6) nem a integração B↔A.
- **#649** (`02af24a0`, S2): fecha dupla creditação entre OC e NF-e vinculada (D12). Estava revertido em `a3f6331b` e reaplicado. Está em `origin/main`.
- **#648** (S1, S1b, S1c, G14): commit `a29da7fc` em `origin/main` (mergeado). `PROXIMOS_PASSOS.md` ainda diz que #648 está aberto e bloqueado por governança. **Divergência de documentação a corrigir.**

---

## 7. Itens que dependem de migrations, PRs ou decisões

| Item | Depende de | Situação |
|---|---|---|
| Custo com 6 casas (R1) | DECISÃO-06 + clone para medir lock em `itens_venda` | Não iniciado |
| Custo médio (R2) | D1 (média ponderada por loja), S1–S2 em produção | Não iniciado |
| UNIQUE em AP (R4) | Checar duplicidades existentes antes da migration | Não iniciado |
| XML persistido (R6) | DOC-01..05 (retenção, jurídico) | Bloqueado por decisão |
| Estorno (R3) | Regra de estorno com AP paga (decisão de negócio) | Não iniciado |
| Pipeline B em produção | S5 (plano→módulo) e D9 | Pendente |
| Migrations `20261021130*` (hub) | Já em `origin/main`; PROXIMOS_PASSOS cita aplicação em produção sem decisão | Validar |

---

## 8. Experiência do usuário (Bling / Odoo / SAP B1)

- **Bling:** o caminho NF-e → conferência → estoque é o mais próximo do Bling. Falta a velocidade: o fluxo exige passos manuais de vínculo e conferência; isso é desejável, mas precisa de atalhos para o caso comum (produto já vinculado).
- **Odoo:** rateio de frete e despesas por valor/peso e custo médio são o diferencial. Hoje existem no cálculo do pipeline B e **não chegam ao produto**. Esse é o maior gap de "ajustes".
- **SAP B1:** rastreabilidade documental exige guardar o XML (R6), o vínculo NF-e → movimento → AP com UNIQUE (R4) e estorno (R3). Hoje faltam os três.

**Simplificação recomendada (sem perder integridade):** para o primeiro cliente, custos complementares vêm **das próprias tags da NF-e** (`vFrete`, `vSeg`, `vOutro`, `vDesc`) e são rateados por valor do produto, em uma regra só. O pipeline B (DI, câmbio, II/IPI/PIS/COFINS, 27 UFs) fica para depois.

---

## 9. Sprints para concluir o MVP

Estimativas são de esforço de dev, em semanas-pessoa, sem evidência de velocidade real da equipe. Dependências de decisão ficam explícitas.

| Sprint | Escopo | Dependências | Prioridade | Esforço (estimado) | Critérios de aceite | Testes | Riscos |
|---|---|---|---|---|---|---|---|
| **S-0 Decisões** | DECISÃO-06 (6 casas), D1 (média ponderada), D3 (tolerância R$ 0,01), DECISÃO-09 (×1,5), custo complementar por NF-e (decisão de MVP) | Dono do produto | P0 | 0,5 (humano) | Decisões registradas em `docs/regras-negocio/` | — | Decisão tardia atrasa tudo |
| **S-A Precisão de custo** | `numeric(14,6)` em `preco_custo`, `custo_unitario` (itens NF-e e `nfe_conferencia`); remover `ROUND(…,2)` de custo; `preco_varejo` segue 2 casas | S-0 | P0 | 1,5 | Caso `0,0045` persistido sem perda; relatórios em 2 casas | Teste de precisão no SQL; `pg.local.spec.ts`; 43 scripts `*.test.sql` sem regressão | Reescrita de tabela; medir lock em clone |
| **S-B Custo médio** | Média ponderada móvel por loja em `confirmar_importacao_nfe`, gravada em `preco_custo_medio`; `preco_custo` passa a ser último custo, não média; centralizar escritores de estoque (S3) | S-A | P0 | 2,0 | Teste de sequência de entradas com preços diferentes; concorrência com `FOR UPDATE`; saldo zero não divide por zero | Novos testes SQL + `test-estoque-decremento-concurrency.mjs` | Mudança de margem exibida; regressão no PDV |
| **S-C Integridade financeira e documental** | UNIQUE `(nfe_importacao_id, numero_duplicata)`; reconciliação Σ duplicatas × valor; estorno de NF-e confirmada (estoque + AP não paga); guardar XML com `sha256` e bucket privado por loja | S-0 (DOC-01..05 para XML) | P1 | 2,0 (+0,5 se XML) | Mesma NF-e não gera duas APs; estorno reverte kardex e AP; XML recuperável por hash | Testes de idempotência e de estorno; checar duplicidades existentes antes da UNIQUE | Estorno com AP paga: definir regra |
| **S-D Preço** | Remover ×1,5 automático do import; preço de venda sugerido com margem alvo, aplicado por ação explícita | S-B | P1 | 1,0 | Import não altera `preco_varejo` sem ação do usuário; guard de margem preservado | Testes de preço e de margem | Mudança de comportamento de cadastro |
| **S-E Homologação e prova** | Rodar suítes SQL e `npm run test:financial` em homologação migrada; E2E XML → conferência → estoque → AP → preço; drill de rollback | S-A a S-D | P0 | 1,0 | Todas as linhas da matriz em PASSOU com evidência | Lista completa de testes da §10 | Homologação não reproduz produção (já ocorreu) |
| **Pós-MVP (não agora)** | Ligar pipeline B ao custo do produto; DI/II/IPI/PIS/COFINS; câmbio; apuração por UF | Decisão de módulo (S5) | P2 | 4+ | — | — | Complexidade desnecessária para o primeiro cliente |

**Ordem recomendada:** S-0 → S-A → S-B (com S-C em paralelo, arquivos diferentes) → S-D → S-E.

**Esforço total do MVP:** ~7,5 semanas-pessoa (S-0 a S-E), sem pós-MVP.

---

## 10. Testes necessários antes do GO

1. Suítes SQL do bloco: `nfe-conferencia-*.test.sql`, `nfe-duplicata-invalida-aborta.test.sql`, `nfe-manual-sem-cnpj.test.sql`, `ux04-oc-recebimento-parcial.test.sql`, `d0-remessa-conferencia-columns-drift.test.sql`.
2. Novos: precisão de custo (S-A); custo médio em sequência e concorrência (S-B); idempotência e reconciliação de AP (S-C); estorno (S-C); XML por hash (S-C); preço sem ação do usuário (S-D).
3. `test-nfe-conferencia-concurrency.mjs`, `test-estoque-decremento-concurrency.mjs`.
4. Matriz de isolamento: usuário da loja A não lê nem escreve NF-e, AP ou estoque da loja B (inclui `import_*`).
5. Permissão por perfil: OPERADOR não vê custo (`N1`); GERENTE/DONO conferem; apenas DONO estorna (decisão a confirmar).
6. Teste de rollback: `pg_dump --schema-only` idêntico antes e depois.

---

## 11. Respostas obrigatórias

1. **Percentual de conclusão:** **45%**. Critério: as 10 linhas pedidas no roteiro; PASSOU = 1, PARCIAL = 0,5, NÃO IMPLEMENTADO / FALHOU / NÃO TESTADO = 0. Resultado: 9 × 0,5 + 0 = 4,5 de 10. Ressalva: nenhuma linha tem prova em banco nesta auditoria; sem comprovação, o número é teto, não medição.
2. **Funcionalidades realmente prontas:** **0** comprovadas.
3. **Incompletas:** **10 de 10** das linhas pedidas (9 PARCIAL e custo médio NÃO IMPLEMENTADO). Somando as 3 linhas extras, são **13 de 13** incompletas (ver §4).
4. **Bloqueadores para produção:** R1 (custo a 2 casas), R2 (custo médio), R3 (estorno), R4 (AP sem UNIQUE), R5 (×1,5 automático). R6 (XML) é bloqueador documental se o cliente for auditado.
5. **Sprints para o MVP:** **4 sprints de execução** (S-A, S-B, S-C, S-D) mais S-0 (decisões) e S-E (homologação). Total ~7,5 semanas-pessoa.
6. **Integrações a construir:** (a) NF-e ↔ custo do produto (custo médio); (b) NF-e ↔ estorno de estoque/AP; (c) NF-e ↔ armazenamento de XML; (d) NF-e ↔ tags de frete/seguro/desconto (simplificação); (e) pipeline B ↔ produto (**pós-MVP**).
7. **O que pode ser simplificado sem perder integridade:** custos complementares via tags da NF-e com rateio por valor, em uma regra só; um único método de custo (média ponderada, sem FIFO); preço sem ×1,5 automático.
8. **O que não desenvolver agora:** pipeline B (DI, câmbio, II/IPI/PIS/COFINS, apuração por UF); integração de landed cost com produto; preço por tabela de atacado acoplado ao import; Focus NFC-e.
9. **Operação real do XML ao financeiro sem intervenção manual externa?** **Não.** O caminho A existe e é transacional, mas: o custo fica truncado (R1), não há custo médio (R2), não há estorno (R3), e o preço é alterado por regra fixa. Conferência e vínculo de produto são manuais por desenho, o que é aceitável. A operação não foi validada ponta a ponta em homologação.
10. **O que falta para GO:** S-0, S-A, S-B, S-C, S-D e S-E concluídos, com a matriz em PASSOU e evidência em homologação.

---

## 12. Recomendação

**NO-GO** para declarar o Bloco de Importação concluído para o primeiro cliente pagante.

Justificativa técnica:
- Custo a 2 casas (R1) e ausência de custo médio (R2) corrompem a margem e o valor de estoque em operação real.
- Não há estorno (R3). Um erro de NF-e exige correção manual no banco, o que viola a premissa de operação sem intervenção externa.
- AP sem UNIQUE (R4) deixa a idempotência financeira dependente de status.
- O pipeline de importação internacional (B) não integra com estoque, custo ou financeiro. Se for vendido como parte do bloco, o cliente receberá uma funcionalidade que não altera o produto.

**Caminho para GO CONDICIONAL:** escopo reduzido ("NF-e de entrada com custo médio e estorno"), após S-0 a S-E. O pipeline B permanece com o módulo desligado.

---

## 13. Pontos não verificados nesta auditoria

- Suítes SQL e specs de `shared-core` não foram executadas (sem banco e sem `node_modules` no worktree).
- RLS das tabelas `import_*` e das policies de `importacoes_nfe` não foi lida linha a linha.
- Não foi verificado o estado de produção (proibido nesta etapa). `PROXIMOS_PASSOS.md` afirma que migrations do hub (`20261021130*`) foram aplicadas; não foi confirmado.
- Decisões D1–D14 citadas em `PROXIMOS_PASSOS.md` não foram relidas.
