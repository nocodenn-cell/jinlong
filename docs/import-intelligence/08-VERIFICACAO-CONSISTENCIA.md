# 08 — Verificação de consistência dos documentos (revisão pós-Sprint 0)

Registro de uma revisão feita após a aprovação da direção arquitetural. Objetivo: confirmar que os documentos `00` a `07`, os fixtures e o README são completos e internamente consistentes, e registrar o que foi corrigido.

Método: leitura cruzada de referências entre documentos, conferência de números contra o verificador de referência, e busca por afirmações sem evidência.

---

## 1. Achados corrigidos

| # | Documento | Problema | Correção |
|---|---|---|---|
| C-01 | `01` §6.1, passo 9 | Fórmula de conservação não incluía descontos. Não batia com `02` nem com `04` (T-CONS-01) | Fórmula com `− Σ|descontos|` e escala 10 |
| C-02 | `01` §6.3 | Rateio descrito "na escala de centavos", mas o motor rateia na escala 10 e não há resíduo de rateio | Texto reescrito: rateio exato na escala 10; resíduo só na persistência |
| C-03 | `02` §2 e §3 | Exemplo não correspondia ao fixture: despesa com `"DECISAO_03"` mas saída assumia incorporada; `valor_aduaneiro_brl` nulo gerava divergência não mostrada; tributo com campos `status`/`regra_id` diferentes do contrato; resíduo com 6 casas | Reescrito a partir do fixture `15-exemplo-doc-02`, com conferência à mão (§3.1 do doc 02) |
| C-04 | `02` §2.1 | Faltavam códigos de erro usados pelos fixtures (`LANDED_DECIMAL_FORMATO`, `LANDED_DECIMAL_ESCALA_EXCEDIDA`, `LANDED_ITEM_INEXISTENTE`, `LANDED_TRIBUTO_ALOCACAO_AUSENTE`, `LANDED_CUSTO_NEGATIVO`, `LANDED_CONSERVACAO_FALHOU`, `LANDED_CRITERIO_INVALIDO`) | Adicionados ao §2.1 e ao catálogo de `07` §5 |
| C-05 | `04` T-RND-02 e T-DET-03 | Resíduo escrito `−0,000120`; o motor grava escala 10 (`−0.0001200000`) | Notação corrigida |
| C-06 | `04` §6 | Contagens de status aproximadas ("~25", "~60") | Contagem exata por linha |
| C-07 | `04` §6 | Afirmava que o fixture cobria T-FIS-05, sem caso correspondente | Lista corrigida; T-FIS-05 marcado como sem fixture |
| C-08 | `04` T-PARSE-04 | Dizia "perde casas além da precisão do double", afirmação mais forte que o probe confirmou | Texto ajustado ao que foi observado |
| C-09 | `05` Sprint 1 | Misturava motor matemático e correção do parser na mesma sprint | Dividida em **S1a** (motor isolado) e **S1b** (parser e rótulo), com aprovação e rollback próprios |
| C-10 | `01` §11 | Parser listado na Sprint 1 | Movido para Sprint 1b |
| C-11 | `01` §10 | Faltava a decisão de módulo por cliente (requisito de produto) | DECISÃO-14 adicionada |
| C-12 | `fixtures/casos` | Numeração pulava o 17 | Renumerados: 17 (valor aduaneiro ausente), 18 (escala); acrescidos 19, 20, 21 (volume e quantidade, fração de caixa, peso líquido) |
| C-13 | `02` §3 (Sprint 0) | Unitário `5,594753` escrito na Sprint 0 estava errado. O correto é `5,594823` | Corrigido na Sprint 0 e reconferido nesta revisão |

## 2. Afirmações conferidas e mantidas

| Afirmação | Verificação |
|---|---|
| Vigente `confirmar_importacao_nfe` é SSOT-003 (`20261007163100`) | Leitura direta do arquivo |
| `ENTRADA_REMessa_LOJA` é o código do catálogo | `034:14` e uso em `20260918100000:834` |
| Não existe `usuario_vinculos`, `fp_*`, `empresa_id` no repositório | Busca em `backend/supabase/migrations` |
| `feature_flags` é global, sem escopo por cliente | `073_feature_flags.sql` |
| Nenhum componente de interface consome feature flag | Busca em `pdv-importados/lib`, `components`, `app` (não-teste) |
| Não existe tabela de contratação ou licença por cliente | Busca por `modulo`, `assinatura`, `licenca`, `entitlement`, `plano` |
| Parser converte `cProd "0012"` em número `12` | Probe com `fast-xml-parser` do projeto, em script temporário fora do repositório |
| `shared-core` tem Vitest, TypeScript strict e `target: ES2022` | `shared-core/package.json`, `vitest.config.ts`, `tsconfig.json` |
| Não há biblioteca decimal no `shared-core` | `shared-core/package.json` (só `zustand`) |
| 23 ocorrências de `?? LOJA_MATRIZ_ID` em código de aplicação | Busca em `pdv-importados` e `shared-core`, excluindo testes |
| Fixtures 03, 04, 15, 16, 19, 20, 21 conferidos à mão | Ver `fixtures/README.md` |

## 3. Pendências abertas (não corrigidas nesta revisão)

| ID | Pendência | Por que não foi corrigida agora |
|---|---|---|
| P-01 | Regra de tributo sem vigência no contrato do motor | Mudança de contrato. Exige revisão junto com S1a |
| P-02 | `arredondamento` aceita só `HALF_UP` no input, sem ligar a enum aprovado | Depende de DECISÃO-06 |
| P-03 | Sem caso de fração de unidade combinada com rateio no mesmo item | Caso novo; pode ser feito sem bloquear |
| P-04 | Hash canônico: separação motor × adapter documentada, mas o verificador ainda calcula o hash junto | Aceitável para referência; o motor não deve calcular hash |
| P-05 | 14 dos 21 casos não têm conferência manual registrada (ver tabela do `fixtures/README.md`) | Revisão independente de pelo menos 5 antes do GO de S1a (doc 07 §13, condição 4) |
| P-06 | `round()` do Postgres em empates não validado | Teste em clone (T-RND-03), antes de S2 |
| P-07 | `preco_custo_medio` em produção pode diferir do repositório | Verificação em produção, sem escrita |

## 4. Itens que este pacote **não** afirma

- Que a regra de arredondamento HALF_UP é a adotada pela contabilidade.
- Que a taxa de câmbio, o critério de rateio e a classificação de tributos estão corretos para a operação real. São decisões de negócio e contabilidade (`06`).
- Que produção é igual ao repositório (drift conhecido, ESPEC Anexo B).
- Que o módulo Import Intelligence está protegido contra exposição nas lojas comuns. Hoje **não está**: a infraestrutura não existe (`07` §12).

## 5. Resultado da revisão

- **Completude:** os oito documentos (`00` a `07`) e o README dos fixtures estão presentes. Este documento (`08`) registra a revisão.
- **Consistência:** as 13 inconsistências encontradas foram corrigidas (seção 1). Nenhuma afirmação foi removida sem substituição por evidência.
- **Limites:** 7 pendências abertas (seção 3), todas com ação definida e nenhuma delas bloqueia o trabalho de escrita de contrato; P-01, P-02 e P-05 bloqueiam o GO do motor.
