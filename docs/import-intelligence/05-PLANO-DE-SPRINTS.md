# 05 — Plano de sprints do Import Intelligence (revisado)

Revisão desta etapa: a antiga **Sprint 1** foi dividida em **S1a** (motor matemático isolado) e **S1b** (correções do parser e rótulo). São frentes independentes, com aprovação, PR e rollback próprios. **Nenhuma sprint inicia automaticamente.** Esforço relativo: P (até 3 dias de uma pessoa), M (1 a 2 semanas), G (mais de 2 semanas ou com dependência externa).

---

## 1. Visão de sequência

```
S0  Auditoria                                   concluída (00 a 05)
 │
 ▼  G0: aprovação dos documentos
S1a Motor matemático isolado                    shared-core/src/import/  · sem banco · sem parser
 │  ▲ bloqueado por DECISÃO-06 e DECISÃO-10 (ver 06 e 07 §6)
 │
S1b Parser e rótulo                             pdv-importados/  · PR separado · sem migration
 │  ▲ compatibilidade de vínculos (R-P1) antes
 ▼
G1 + G2
S2  Persistência do XML e schema aditivo         staging primeiro
 ▼  G3
S3  Processo, cálculo e guardas                  sem escrita em custo; módulo só após DECISÃO-14
 ▼  G4 + DECISÃO-01
S4  Publicação de custo e limpeza legada
 ▼  ESPEC etapas 1–8 (autorização separada)
S5  Pré-requisitos multiempresa
 ▼  G5 + DECISÃO-08
S6  Dados entre CNPJs
```

S1a e S1b podem ser feitas em qualquer ordem. S2 depende de **ambas**: o motor precisa existir para validar a persistência, e o parser precisa estar correto para o XML ser guardado com o dado certo.

---

## 2. Pré-requisitos gerais

| Item | Responsável (papel) | Obrigatório antes de |
|---|---|---|
| G0 aprovado (documentos 00 a 07) | Produto + arquitetura | S1a, S1b |
| **DECISÃO-06** (arredondamento, escalas, resíduo) | Arquitetura + contabilidade | S1a (valores de referência) |
| **DECISÃO-10** (representação decimal; recomendação: opção A) | Arquitetura | S1a |
| DECISÃO-02 (critério de rateio) | Produto + contabilidade | Preset de UI (não bloqueia S1a) |
| DECISÃO-04 (fontes de câmbio) | Produto + contabilidade | Só o enum (não bloqueia S1a) |
| DECISÃO-03 (tributos) | Contabilidade | S4 (publicação) |
| DECISÃO-12 (retenção do XML) | Jurídico + arquitetura | S2 |
| DECISÃO-13 (OC × NF-e sem vínculo) | Produto | S3 |
| DECISÃO-14 (contratação do módulo por cliente) | Produto + arquitetura | Qualquer rota, menu ou RPC do módulo (S3) |
| Relatório de compatibilidade de vínculos (R-P1) | Compras + operação | S1b |
| Amostra de XMLs reais, anonimizada | Operação de compras | S1b (G2) |
| Revisão independente de 5 fixtures | Contabilidade ou segunda pessoa de engenharia | S1a |
| Clone de staging | Operações | S2 |

---

## 3. Sprints

### S0 — Auditoria arquitetural (concluída)

| Campo | Conteúdo |
|---|---|
| **Escopo** | Documentos `00` a `05` em `docs/import-intelligence/` |
| **Dependências** | Nenhuma |
| **Esforço** | P |
| **Aceite** | Documentos revisados; decisões levadas a aprovação |
| **Rollback** | Remover a pasta |

---

### S1a — Motor matemático isolado

**Escopo**

1. `shared-core/src/import/` com a estrutura da seção 2 de `07-MOTOR-CONTRATO-MINIMO.md`: `types.ts`, `errorCodes.ts`, `decimal.ts`, `rateio.ts`, `landedCost.ts`, `canonico.ts`, `index.ts`.
2. Auxiliar decimal sobre `bigint` escalado (DECISÃO-10, opção A), com testes próprios da seção 7 do doc 07.
3. Motor `calcularLandedCost` conforme contrato (doc 07 §3), invariantes I-01 a I-12 (doc 07 §4).
4. Testes `*.spec.ts`: executar os **21 fixtures** de `docs/import-intelligence/fixtures/casos/` contra o motor, mais os testes de determinismo, precisão, conservação e rateio da matriz (`04`).
5. Teste estático de I-11: nenhum import de `pdv-importados`, `backend`, Supabase, `node:crypto`, `Date` ou `Math.random` em `shared-core/src/import/`.
6. Pré-requisitos do contrato fechados: P-01 (vigência de regra), P-02 (enum de arredondamento). P-03 e P-04 são tratados aqui também.

**Não faz:** parser; banco; migration; RPC; tela; hash criptográfico (fica no adapter); alteração de `package.json`; alteração de qualquer outro arquivo de `shared-core`.

**Dependências:** G0; DECISÃO-06 e DECISÃO-10 aprovadas; P-01 e P-02 resolvidos no contrato; revisão de fixtures.

**Esforço:** M

**Critérios de aceite (G1)**

- `npm test` em `shared-core` (Vitest) verde, incluindo os 21 fixtures.
- `npm run typecheck` (`tsc --noEmit`, strict) verde.
- Nenhum valor monetário com `number` no código do motor (busca estática e revisão).
- Nenhuma dependência nova.
- Fixtures reproduzidos byte a byte pelo motor (sem o campo `input_hash`, que é do adapter).
- Qualquer diferença entre motor e fixture: o fixture **não** é ajustado para passar. Volta-se à decisão (doc 07, critério de parada).

**Rollback:** remover `shared-core/src/import/` e reverter eventuais alterações de exports. Nada de dado é afetado.

**Evidências para aprovação**

- Saída do `vitest run` e do `tsc --noEmit`.
- Relatório de cobertura de `shared-core/src/import/`.
- Lista dos 21 fixtures com status.
- Registro da revisão independente de 5 fixtures (03, 04, 15, 19, 21 sugeridos).

---

### S1b — Correções do parser de NF-e e do rótulo

**Escopo**

1. `pdv-importados/lib/nfe/nfeParser.ts`:
   - preservar como texto `cProd`, `cEAN`, `cEANTrib`, `NCM`, `CNPJ`, `CPF`, `nNF` (corrige **A-03**, probe confirmado: `"0012"` → `12`);
   - ler `vUnCom` e `qCom` como string decimal, sem conversão para `number` (corrige perda de casas em A-06 na origem);
   - **somente leitura** de totais (`ICMSTot`: `vProd`, `vFrete`, `vSeg`, `vOutro`, `vDesc`, `vNF`) e de tributos por item (`det/imposto`). Não persiste nada nesta sprint (A-11).
2. Testes: T-PARSE-01 a T-PARSE-07 em `nfeParser.test.ts`, mais um caso com XML real anonimizado (T-PARSE-08).
3. `pdv-importados/lib/format/vendaLabels.ts:76`: rótulo `ENTRADA_REMESSA_LOJA` → `ENTRADA_REMessa_LOJA` (corrige **A-12**), com ajuste em `vendaLabels.enums.test.ts`.
4. **Compatibilidade de vínculos (R-P1):** relatório, em clone, dos `cProd` numéricos com zero à esquerda já gravados em `vinculos_fornecedor_produto_depara` (`20260621000700_211`) e quantos mudariam de resultado. **Decisão de migração desses vínculos com Compras antes do merge.**

**Não faz:** persistência do XML (S2); alteração de `importar_nfe_transacao`; alteração de `confirmar_importacao_nfe`; migration; motor; `preco_custo`.

**Dependências:** G0. Independe de S1a. Relatório R-P1 e amostra de XMLs antes do merge.

**Esforço:** M

**Critérios de aceite (G2)**

- T-PARSE-01 e 02 passam (hoje falham, confirmado por probe).
- Suíte de `nfeParser.test.ts`, `notaManual.financeiro.test.ts`, `actions.validation.test.ts` e `vendaLabels.enums.test.ts` sem regressão.
- Relatório R-P1 entregue; zero vínculo quebrado sem decisão registrada.
- Nenhuma escrita no banco durante os testes.

**Rollback:** reverter o arquivo do parser. Atenção: se algum vínculo tiver sido migrado após o merge, reverter o parser sem reverter os vínculos recria a quebra. Por isso a migração de vínculos é etapa separada, com script de volta.

**Evidências para aprovação**

- Diff do parser e da tabela de rótulos.
- Saída dos testes T-PARSE.
- Relatório R-P1 com contagem de vínculos afetados.
- Lista de XMLs de referência, com hash e origem anonimizada.

---

### S2 — Persistência do XML e schema aditivo

**Escopo**

1. Persistência do XML original com `sha256` por NF-e (A-04). Retenção conforme DECISÃO-12. Coluna ou tabela nova; nunca sobrescrever.
2. Ampliação de escala (DECISÃO-06):
   - `importacoes_nfe_itens.custo_unitario` (`296:100`, hoje `numeric(10,2)`);
   - `importar_nfe_transacao`: remover `ROUND(…, 2)` do custo intermediário (`20261005173427:134,174,230`).
   - **Não** alterar `produtos.preco_custo` nesta sprint.
3. Tabelas aditivas: `import_processo`, `import_documento`, `import_despesa`, `import_rateio_memoria`, `tributo_catalogo`, `tributo_regra`, `tributo_lancamento`, `custo_versao`, `custo_item`. Todas com `loja_id NOT NULL`, `empresa_id` nullable, RLS por loja, sem escrita direta.
4. Remover o risco de cascata de A-14: proibir `DELETE` em `importacoes_nfe` e trocar a FK de `contas_pagar.nfe_importacao_id` (`108:16`).
5. Testes SQL de integridade e RLS.

**Dependências:** G1 e G2; DECISÃO-06 e DECISÃO-12; clone de staging.

**Esforço:** M

**Critérios de aceite (G3)**

- Migration aplicada em clone, com contagens e somatórios idênticos antes e depois (ESPEC §14).
- Ampliação de escala: valores preservados.
- Rollback testado em clone: tabelas novas removidas. A ampliação de escala **não** é revertida, porque reduzir escala perde dado.
- T-ISO-01 e T-ISO-02 verdes para as tabelas novas.

**Rollback:** tabelas novas com `DROP` (vazias nesta fase); coluna de XML com `DROP COLUMN` (sem uso por função existente); escala é **forward only**.

**Evidências para aprovação:** relatório de clone; log da migration; script de rollback testado; matriz de RLS.

---

### S3 — Processo, cálculo e guardas

**Escopo**

1. Adapters de leitura: `NfeEntradaReader`, `EntradaEstoqueReader`, `ObrigacaoReader`.
2. RPCs `import_*` (doc 02 §6), com autorização por perfil e loja (DECISÃO-07), idempotência por chave e `payload_hash`.
3. `import_calcular_custo`: gera `custo_versao` e `custo_item` chamando o motor (S1a). **Não** escreve em `preco_custo`.
4. Tela de processo para DONO e GERENTE, com os estados de `01-ARQUITETURA.md` §5.
5. Guardas de integridade (mudam fluxo existente, com flag):
   - **G-A02:** `confirmar_importacao_nfe` compara `Σ duplicatas` com `Σ(qtd × custo)` dentro da tolerância da DECISÃO-05. Fora dela, `NFE_TOTAL_NAO_CONCILIADO`.
   - **G-A05:** `confirmar_importacao_nfe` bloqueia NF-e sem vínculo quando a OC já tem saldo recebido nos mesmos produtos (DECISÃO-13).
6. **Módulo opcional por cliente (DECISÃO-14):** toda rota, menu, server action e RPC do módulo verifica o contrato do cliente **no servidor**. Loja sem contrato não enxerga nada do módulo. Teste de negação em cada camada.

**Não faz:** publicação de custo; alteração de `preco_custo`; compartilhamento entre CNPJs.

**Dependências:** S2 aprovada em produção; DECISÃO-05, DECISÃO-07, DECISÃO-13 e **DECISÃO-14**. Sem DECISÃO-14, S3 não expõe nada: fica atrás de flag desligada e sem rota.

**Esforço:** G

**Critérios de aceite (G4)**

- T-IDEM-06 e 07, T-PARC-05 e 06, T-RET-02 a 04, T-FALHA-03 e 04 verdes.
- Confirmação com diferença fora da tolerância falha sem efeito: nenhuma linha em `estoque`, `movimentos_estoque_log` ou `contas_pagar`.
- Nenhuma escrita em `preco_custo` durante a sprint (teste e `historico_precos_produto` sem linhas novas).
- Flag desligada reproduz o comportamento atual (teste de equivalência).
- Usuário de cliente sem contrato: negado em rota, menu, action e RPC (T-ISO novo).

**Observação sobre flags:** `feature_flags` é global (`073_feature_flags.sql`). **Não serve** como controle por cliente. A flag de S3 só protege a sprint como um todo; o controle por cliente exige DECISÃO-14.

**Rollback:** flag desligada; `REVOKE EXECUTE` das RPCs novas; corpo anterior de `ssot_003` (`20261007163100`) guardado para restauração.

**Evidências para aprovação:** logs de T-IDEM e T-FALHA; teste de equivalência com flag desligada; diff de `confirmar_importacao_nfe`; teste de negação do módulo; relatório de ausência de escrita em custo.

---

### S4 — Publicação de custo e limpeza legada

**Escopo**

1. `custo_importacao_publicado`, referenciando `custo_versao` aprovada (DECISÃO-01: proposta aceita pelo gerente, sem sobrescrita automática).
2. Aceite de proposta grava em `produtos.preco_custo` pelo caminho auditado (`historico_precos_produto`).
3. Remover a regra `preço = custo × 1,5` da criação de produto importado (A-10, DECISÃO-09). Legado mantido até decisão.
4. Revogar `EXECUTE` de `confirmar_remessa_entrada(uuid)` após verificar em produção que não há chamador (A-13). Remover o wrapper `confirmRemessaEntrada` depois.
5. Relatório de margem: usar snapshot quando existir, sinalizar fallback (A-18; T-COMP-06).
6. Decidir o tratamento de `preco_custo_medio` (A-07): calcular, ou exibir como não calculado.

**Dependências:** S3 aprovada (G4); DECISÃO-01 e DECISÃO-09; DECISÃO-03 concluída para os tributos incorporados.

**Esforço:** M

**Critérios de aceite (G6)**

- Atas de DECISÃO-01 e DECISÃO-09.
- Comparativo de margem antes e depois, por produto, em clone.
- Proposta rejeitada não altera `preco_custo`.
- Publicação registra `preco_custo_anterior` e `preco_custo_novo` em `historico_precos_produto`.
- Verificação em produção de que `confirmar_remessa_entrada(uuid)` não tem chamador (**NÃO VALIDADO** até feito).

**Rollback:** publicação é novo registro; reverter é publicar a versão anterior, cujo valor está no histórico. Regra ×1,5: flag. Revogação: script de `GRANT` pronto antes da execução.

**Evidências para aprovação:** atas; comparativo de margem; logs em staging; resultado da verificação de chamadores.

---

### S5 — Pré-requisitos de multiempresa

**Escopo (ESPEC v1, etapas 1 a 5, 8 e 9)**

1. `empresas`, `usuario_vinculos`, `plataforma_admins` (vazia), `lojas.empresa_id` (ESPEC §2 a §5).
2. Backfill: Empresa 1; vínculos a partir de `usuarios`.
3. Helpers `fp_*` com modo de compatibilidade.
4. RPCs de entrada e de import passam a `fp_pode_loja` (A-08; ESPEC §8).
5. Remover fallback `?? LOJA_MATRIZ_ID` em código de importação (A-19), primeiro instrumentando, depois falhando fechado.
6. Guardas RESTRICTIVE nas tabelas de import (ESPEC §7.3).
7. **Tabela `modulos_contratados`** e helper `fp_modulo_ativo(empresa, modulo)` (DECISÃO-14, opção A). Essa é a base do controle por cliente da S3.

**Não faz:** seletor de empresa; licença; suporte cross-tenant; cliente 2.

**Dependências:** ESPEC aprovada para execução (hoje "execução não autorizada"); S3 concluída; DECISÃO-14 registrada; D9 para o corte de ADMIN.

**Esforço:** G

**Critérios de aceite (G5 parcial)**

- Equivalência da Empresa 1: mesmos resultados antes e depois, para os 11 usuários reais, em clone (ESPEC §14).
- T-ISO-03, T-ISO-04 e T-ISO-08 verdes.
- Zero ocorrências de fallback `LOJA_MATRIZ_ID` no período de instrumentação.

**Rollback:** por etapa, conforme ESPEC §12. Helpers com corpo anterior guardado. Guardas: `DROP POLICY tenant_guard`.

**Evidências para aprovação:** relatório de equivalência; matriz A × B (ESPEC §14); contagem de fallbacks.

---

### S6 — Dados de custo entre CNPJs

**Escopo:** compartilhamento de custo landed entre empresas do mesmo grupo (DECISÃO-08).

**Dependências:** S5; DECISÃO-08; ESPEC completa; teste A × B completo, obrigatório antes do cliente 2.

**Esforço:** G

**Critérios de aceite (G5 completo):** T-ISO-01 a 08 verdes; cliente atacadista independente sem acesso a custo; auditoria de cada leitura cross-CNPJ.

**Rollback:** flag de leitura cross-CNPJ desligada.

---

## 4. Riscos P0 / P1 / P2

Referências `A-xx` em `00-AUDITORIA.md` §4.

| ID | Sev. | Risco | Mitigação | Sprint |
|---|---|---|---|---|
| **R-01** | P0 | Custo de importado subestimado (A-01) | Motor com componentes; proposta antes de publicar | S1a, S4 |
| **R-02** | P0 | AP diverge do valor econômico (A-02) | Conciliação em S3, tolerância DECISÃO-05 | S3 |
| **R-03** | P0 | Parser perde zeros em `cProd`/`cEAN` (A-03) | Correção em S1b com relatório R-P1 | S1b |
| **R-04** | P0 | XML não persistido (A-04) | Persistência com hash | S2 |
| **R-05** | P0 | Estoque em dobro com NF-e sem vínculo (A-05) | G-A05 (DECISÃO-13) | S3 |
| **R-06** | P0 | Multiempresa inexistente (A-19) | S5; nenhum dado entre CNPJs antes de S6 | S5, S6 |
| **R-07** | P0 | Módulo visível para lojas sem contrato (requisito de produto, §12 de 07) | DECISÃO-14; controle no servidor; nenhuma rota antes | S3, S5 |
| **R-08** | P1 | Precisão de custo a 2 casas (A-06) | Escala em S2; forward only | S2 |
| **R-09** | P1 | `preco_custo_medio` sem produtor (A-07) | Decidir em S4 | S4 |
| **R-10** | P1 | Autorização global DONO/ADMIN (A-08) | `fp_pode_loja` em S5 | S5 |
| **R-11** | P1 | Kardex sem vínculo estruturado (A-09) | Usar `ordens_compra_recebimentos` e tabelas novas; kardex intocado | S2, S3 |
| **R-12** | P1 | Regra ×1,5 não documentada (A-10) | DECISÃO-09; S4 com flag | S4 |
| **R-13** | P1 | Parser sem totais e tributos (A-11) | S1b lê; S2 persiste | S1b, S2 |
| **R-14** | P1 | Sem moeda nem câmbio (A-21) | Modelo de `CambioRef` em S1a (contrato) e S2 | S1a, S2 |
| **R-15** | P1 | "Segundo financeiro" via `financeiro_comando_operacional` (A-20) | Proibição em gate | G0 |
| **R-16** | P1 | Correção do parser quebra vínculos existentes (novo, R-P1) | Relatório em clone; migração separada com script de volta | S1b |
| **R-17** | P2 | Rótulo divergente (A-12) | S1b | S1b |
| **R-18** | P2 | RPC legada com `EXECUTE` (A-13) | Revogação em S4 | S4 |
| **R-19** | P2 | Exclusão de NF-e com cascata para AP (A-14) | Proibir DELETE; trocar FK | S2 |
| **R-20** | P2 | Fornecedor por loja (A-15) | Avaliar em S5 | S5 |
| **R-21** | P2 | Vínculo remessa-OC textual (A-16) | Usar `ordens_compra_recebimentos` | S3 |
| **R-22** | P2 | Margem histórica com custo atual (A-18) | Snapshot e sinalização em S4 | S4 |

**Detalhe de R-16 (correção do parser):** hoje `cProd` vira número. Se um fornecedor usava `"12"` e o vínculo foi gravado como `"12"`, a correção para `"0012"` pode deixar de casar. Quem usava `"0012"` hoje casa com `"12"`, e a correção separa os dois. O relatório em clone mede quantos vínculos mudam, antes de qualquer merge.

---

## 5. Estratégia de rollback geral

| Camada | Rollback |
|---|---|
| Documentação | Remover pasta |
| Motor (S1a) | Remover `shared-core/src/import/`; sem dado afetado |
| Parser e rótulo (S1b) | Reverter arquivo **e** vínculos migrados, se houver, pelo script de volta |
| Schema aditivo (S2) | `DROP` das tabelas novas; escala forward only |
| Guardas e módulo (S3) | Flag; `REVOKE EXECUTE`; corpo anterior de `ssot_003` |
| Publicação de custo (S4) | Publicar versão anterior; histórico preserva |
| Multiempresa (S5) | Por etapa da ESPEC §12 |
| Dados entre CNPJs (S6) | Flag |

**Regra geral:** nenhum rollback apaga dado de produção. Correções são sempre novo registro.

---

## 6. Mudanças mínimas necessárias (consolidado)

| # | Mudança | Arquivo ou objeto | Sprint |
|---|---|---|---|
| 1 | Motor, tipos, erros, auxiliar decimal, rateio | `shared-core/src/import/` (novo) | S1a |
| 2 | Parser: campos textuais preservados; leitura de totais e tributos | `pdv-importados/lib/nfe/nfeParser.ts` | S1b |
| 3 | Rótulo de movimento | `pdv-importados/lib/format/vendaLabels.ts:76` | S1b |
| 4 | Migração de vínculos (somente se aprovada) | Script com volta | S1b, após R-P1 |
| 5 | Persistência de XML com hash | Migration nova | S2 |
| 6 | Escala de custo | `importacoes_nfe_itens.custo_unitario` (`296:100`) | S2 |
| 7 | Remover `ROUND(…,2)` do custo intermediário | `importar_nfe_transacao` (`20261005173427:134,174,230`) | S2 |
| 8 | Tabelas aditivas de import e tributo | Migration nova | S2 |
| 9 | Proibir DELETE em `importacoes_nfe`; trocar FK | Migration nova (`108:16`) | S2 |
| 10 | Conciliação duplicatas × valor | `confirmar_importacao_nfe` (`ssot_003:88-106`) | S3 |
| 11 | Guarda OC × NF-e sem vínculo | `confirmar_importacao_nfe` | S3 |
| 12 | RPCs `import_*` | Migration nova | S3 |
| 13 | Controle do módulo por cliente (servidor) | Rotas, actions, RPCs do módulo | S3 |
| 14 | Tabela de custo publicado; proposta de `preco_custo` | Migration nova | S4 |
| 15 | Remover regra ×1,5 da criação por NF-e | `importar_nfe_transacao` | S4 |
| 16 | Revogar `confirmar_remessa_entrada(uuid)` | Migration nova | S4 |
| 17 | Empresas, vínculos, helpers `fp_*`, `modulos_contratados` | ESPEC etapas 1–3; DECISÃO-14 | S5 |
| 18 | `fp_pode_loja` nas RPCs de entrada | ESPEC etapa 8 | S5 |
| 19 | Remover fallback `LOJA_MATRIZ_ID` de importação | Código de app | S5 |

---

## 7. Evidências por gate

| Gate | Evidências |
|---|---|
| G0 | Documentos 00 a 07; registro de DECISÃO-01 a 14 com responsável |
| G1 | `vitest` e `tsc` verdes em `shared-core`; 21 fixtures reproduzidos; revisão de 5 fixtures; lint de I-11 |
| G2 | T-PARSE-01 a 08; relatório R-P1; lista de XMLs de referência |
| G3 | Relatório de clone; log de migration; rollback testado |
| G4 | Logs de T-IDEM, T-RET, T-PARC, T-FALHA; equivalência com flag desligada; teste de negação do módulo |
| G5 | Matriz de isolamento A × B por perfil e tabela |
| G6 | Atas de DECISÃO-01 e DECISÃO-09; comparativo de margem |

---

## 8. Decisão de Sprint 1 — GO / NO-GO (revisada)

Esta seção responde à pergunta da etapa: **GO ou NO-GO para a implementação isolada do motor matemático**. A resposta completa, com condições, está em `07-MOTOR-CONTRATO-MINIMO.md` §13.

### Motor matemático isolado (S1a): **GO CONDICIONADO**

Condições: DECISÃO-06 e DECISÃO-10 aprovadas; P-01 e P-02 resolvidas no contrato; revisão de 5 fixtures; escopo restrito a `shared-core/src/import/`.

### Parser e rótulo (S1b): **GO em PR separado, depois de S1a ou em paralelo**

Condições: relatório R-P1 em clone; amostra de XMLs reais; decisão de migração de vínculos com Compras antes do merge. Não depende de DECISÃO-06 nem de DECISÃO-10.

### S2 em diante: **NO-GO** até:

- DECISÃO-06 aprovada e S1a verde (a migration de escala depende dela);
- DECISÃO-12 aprovada (retenção do XML);
- clone de staging disponível;
- DECISÃO-01 registrada, para qualquer alteração de `preco_custo`;
- DECISÃO-14 registrada, antes de qualquer rota ou menu do módulo;
- ESPEC autorizada, para qualquer ação de multiempresa.

**Não iniciar nenhuma sprint automaticamente.** A execução de S1a depende de aprovação explícita de G0 e das duas decisões de bloqueio.
