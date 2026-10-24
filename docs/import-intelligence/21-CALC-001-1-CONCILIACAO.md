# 21 — CALC-001.1: conciliação matemática independente (QA A06)

**Papel:** QA matemático independente (não participou das correções). **Data:** 2026-10-22.
**Branch:** `fix/aduaneiro-calc-001-1` (commits `37ec6fae..d9801885`, P1–P8).
**Método:** toda conta foi refeita fora do motor (Python `fractions`, frações exatas; HALF_UP e maior resto de Hamilton reimplementados à parte) e só depois comparada com o código. Testes com esperados literais: `shared-core/src/import/calc0011.conciliacao.spec.ts`.

> **156.360,01 é um valor OBSERVADO** (apuração v2 gravada). A recomputação independente abaixo **confirma a aritmética** desse valor a partir dos dados gravados. Isso **não é certificação fiscal**: incidência do AFRMM e do Siscomex na base do ICMS-PE, alíquota de 20,5 %, critério fiscal de rateio do VA (VALOR_FOB) e incorporação dos tributos ao custo continuam **pendentes de validação** (despachante/contador).

---

## 1. Regressão do motor

| Verificação | Comando | Saída real |
|---|---|---|
| Referência (CLI do README) | `node docs/import-intelligence/fixtures/referencia/landed-cost-referencia.mjs` | **`0/21 PASS`** — falso negativo: worktree Windows com `core.autocrlf=true` (`git ls-files --eol` → `i/lf w/crlf`); o CLI compara byte a byte com `\n`. |
| Referência, comparação normalizada para LF | script do QA (`executarCaso` da referência × `expected.json` com `\r\n→\n`) | **`21/21 PASS`** (status/erros idênticos aos do README) |
| Fixtures no motor | `npx vitest run src/import/fixtures.spec.ts` (shared-core) | **22 passed** |
| Suíte `src/import` (antes do spec do QA) | `npx vitest run src/import` | **14 files passed, 1 skipped; 186 passed, 5 skipped** |
| Suíte `src/import` (com o spec do QA) | idem | **15 files passed, 1 skipped; 203 passed, 5 skipped** (skip = `pg.local.spec.ts`) |
| `landedCost.ts` antes × depois | `git show 37ec6fae:…/landedCost.ts` executado lado a lado com o atual (tsx) | **21/21 saídas idênticas** nos fixtures; **7/7** mutações de `qtd × fator` (inclui 2×12=23,999; 0,5×3=1,501; 3×0,333333=0,999/1) com resultado idêntico |
| Testes do hub tocados pela sprint (pdv-importados) | `npx vitest run` em 7 arquivos (`inteligenciaVa`, `inteligencia`, `actions-valor-aduaneiro`, `actions.qtdFator`, `autoria`, `formImportacao`, `mensagensMotor`) | **7 files, 34 passed** |
| Typecheck shared-core | `npx tsc --noEmit -p tsconfig.json` | 0 erros |

Diff de `landedCost.ts`: só extrai `estoqueConfere(q, f, e) = q×f === e×10^6` (mesma expressão) e exporta `quantidadeEstoqueConsistente` (nunca lança). Comportamento inalterado.

## 2. P6 — margem efetiva (independente)

Fórmulas: MARKUP `P = C×(1+mk)/(1−dv)`; MARGEM `P = C/(1−m−dv)`; HALF_UP a centavos; arredonda **para cima** até o final ,90. `L = P_arred − C₂` (C₂ = custo HALF_UP a centavos). Margem `L/P`, markup `L/C₂`, líquida `(L − dv×P)/P`, HALF_UP 2.

| Caso | P | P arred. | Lucro | Margem | Markup | Líquida | Motor |
|---|---|---|---|---|---|---|---|
| 4,50; MK 30; dv 10 | 6,50 | 6,90 | 2,40 | 34,78 | 53,33 | 24,78 | = |
| 4,50; MK 20; dv 10 | 6,00 | 6,90 | 2,40 | 34,78 | 53,33 | 24,78 | = |
| 5,00; MK 30; sem dv | 6,50 | 6,90 | 1,90 | 27,54 | 38,00 | 27,54 | = |
| Extremo: 5,52; MK 12,5; dv 10 (P já é ,90) | 6,90 | 6,90 | 1,38 | 20,00 | 25,00 | 10,00 | = |
| Extremo: 4,123457 (6 casas); MK 30 | 5,36 | 5,90 | 1,78 | 30,17 | 43,20 | 30,17 | = |
| Extremo: 4,50; MK 30; dv **"0"** | 5,85 | 5,90 | 1,40 | 23,73 | 31,11 | 23,73 | = |
| 4,50; MARGEM 30; dv 10 | 7,50 | 7,90 | 3,40 | 43,04 | 75,56 | 33,04 | = |

Observação: com custo de 6 casas, o lucro usa o custo **em centavos** (4,12). Com o custo exato a margem seria 30,11 % (≠ 30,17 %). Convenção herdada de `simularPreco`, coerente entre margem-alvo e efetiva; registrada como ressalva menor.

## 3. P1/P3 — valor aduaneiro (independente)

Entradas: câmbio 5,0277; FOB USD 2.000 / 9.000 / 3.200; frete USD 2.500; seguro USD 150.
FOB BRL = 10.055,40 / 45.249,30 / 16.088,64 (Σ 71.393,34). Frete 12.569,25. Seguro 754,155.
Rateio pelo FOB em µR$ (escala 6), maior resto com desempate por id:

| Item | Quota exata frete | Restos (×S) | Frete µ | Quota exata seguro | Seguro µ | VA (6) | VA (2) |
|---|---|---|---|---|---|---|---|
| i1 | 1.770,31690141 | 29.160.660.000 (maior → +1 µ) | 1.770,316902 | 106,21901408 | 106,219014 | 11.931,935916 | **11.931,94** |
| i2 | 7.966,42605634 | 24.132.960.000 | 7.966,426056 | 477,98556338 | 477,985563 | 53.693,711619 | **53.693,71** |
| i3 | 2.832,50704225 | 18.099.720.000 | 2.832,507042 | 169,95042254 (maior resto seguro → +1 µ) | 169,950423 | 19.091,097465 | **19.091,10** |
| Σ | | | 12.569,250000 | | 754,155000 | **84.716,745000** | 84.716,75 (exibição) |

`comporValorAduaneiro` = idêntico. Extremos (todos conferem): item sem câmbio → `semBase` + `RATEIO_PARCIAL`, frete só entre i2/i3 (9.272,397541 / 3.296,852459); base zero → `BASE_RATEIO_ZERO`, frete 0; item único → 23.378,805; PESO_LIQUIDO com peso nulo → `PESO_AUSENTE`, nada rateado; empate (10,00 em 3 pesos iguais, ordem c,a,b) → "a" leva 3,333334; 2 µ → "a" e "b".

## 4. P2 — AFRMM e Siscomex

AFRMM = 8 % × 12.569,25 = 1.005,54 (exato 50.277/50). Siscomex = 115,67. Soma **1.121,21**.
`conciliarEncargosAduaneiros` executado contra a função real (script do QA via tsx, cenário com frete/seguro USD):

| Cenário | afrmm_icms | siscomex_icms | lançados | ausente_no_custo | duplicado |
|---|---|---|---|---|---|
| sem lançamento | 1005.54 | 115.67 | 0 / 0 | **1121.21** | false |
| lançados 1× | 1005.54 | 115.67 | 1005.54 / 115.67 | 0.00 | false |
| AFRMM 2× | **2011.08** | 115.67 | 2011.08 / 115.67 | 0.00 | **true** |
| Siscomex 2× | 1005.54 | 231.34 | 0 / 231.34 | 1005.54 | true |
| não marítimo | 0.00 | 115.67 | 0 / 0 | 115.67 | false |

`composicaoValorAduaneiro` com "AFRMM (8% do frete)", "Taxa Siscomex (frete DI)" e "Frete nacional rodoviário" lançados: frete do VA = 12.569,25, VA = 84.716,745 (nenhum dos três entra). Encargos na base do ICMS por VA: 157,916902 / 710,626056 / 252,667042.

## 5. P1 no motor (sintético, sem banco)

Entrada com os números da operação (ids `item-a/b/c`, 7 despesas, 15 tributos):
- VA nulo → `BLOQUEADO`, 3× `VALOR_ADUANEIRO_AUSENTE` (seguro, Siscomex, despachante).
- VA = `comporValorAduaneiro` (6 casas) → `OK`; custos 23.388,7306 / 93.038,9168 / 39.932,3577; conservação 156.360,0050 = 156.360,0050; 21 linhas de rateio (7 origens × 3), AFRMM com uma origem só (226,2465 / 251,3850 / 527,9085).
- VA = valores gravados em centavos → 23.388,7307 / 93.038,9166 / 39.932,3577 (= v2 gravada).

## 6. Cenário real — operação `5df8d46b` (SELECT somente leitura)

Dados: status RASCUNHO, versao_dados 37; câmbio USD 5,0277 (MANUAL, 2026-10-21); itens `5f28b850` (NCM 39269090, 2.000 USD, 5.000 UN, PB 180, vol 0,8, VA 11.931,94), `8d60e6b6` (85183000, 9.000 USD, 2.000 UN, PB 200, vol 1,2, VA 53.693,71), `b836139b` (96170010, 3.200 USD, 1.000 UN, PB 420, vol 2,5, VA 19.091,10). Fator 1 em todos.
Despesas (todas `incorporavel=SIM`, RATEIO): rodoviário 900 BRL PESO_BRUTO; seguro 150 USD VALOR_ADUANEIRO; armazenagem 2.200 BRL VOLUME; frete internacional 2.500 USD PESO_BRUTO; Siscomex 115,67 BRL VALOR_ADUANEIRO; AFRMM 1.005,54 BRL PESO_BRUTO; despachante 1.800 BRL VALOR_ADUANEIRO.
Apurações: v1 (vd 32) **BLOQUEADO**; v2 (vd 37) **OK**, conservação ok.

Recomputação independente (rateio em escala 10 por critério de cada despesa, maior resto, total HALF_UP 4, unitário HALF_UP 6):

| Item | FOB BRL | Frete int. | Seguro | Demais desp.¹ | Tributos | Custo total | Unitário | Gravado v2 |
|---|---|---|---|---|---|---|---|---|
| 5f28b850 | 10.055,40 | 2.828,0813 | 106,2190 | 1.089,6704 | 9.309,36 | **23.388,7307** | 4,677746 | = |
| 8d60e6b6 | 45.249,30 | 3.142,3125 | 477,9855 | 2.277,2086 | 41.892,11 | **93.038,9166** | 46,519458 | = |
| b836139b | 16.088,64 | 6.598,8563 | 169,9504 | 2.654,3310 | 14.420,58 | **39.932,3577** | 39,932358 | = |
| **Total** | 71.393,34 | 12.569,25 | 754,155 | 6.021,21 | 65.622,05 | **156.360,005 → 156.360,01** | | = |

¹ rodoviário + armazenagem + Siscomex + AFRMM + despachante.

**Encargos (sem duplicidade: 1 lançamento de AFRMM e 1 de Siscomex na tabela e na entrada da v2):**

| Encargo | Valor | No custo (critério da despesa) | Na base do ICMS (rateio por VA) |
|---|---|---|---|
| AFRMM | 1.005,54 | PESO_BRUTO: 226,2465 / 251,3850 / 527,9085 | sim (hub) |
| Siscomex | 115,67 | VALOR_ADUANEIRO: 16,2916 / 73,3120 / 26,0665 | sim (hub) |
| Soma na base do ICMS por item | 1.121,21 | | 157,92 / 710,63 / 252,67 |

**Tributos por tipo** (15 lançamentos NAO_RECUPERAVEL, incorporados, conferência PENDENTE): II 14.905,38 · IPI 9.713,16 · PIS 1.779,05 · COFINS 8.175,16 · ICMS 31.049,30 · **Σ 65.622,05**. Coerência: II = 18 % / 18 % / 16,2 % do VA gravado; ICMS bate com 20,5 % "por dentro" sobre (VA + II + IPI + PIS + COFINS + 1.121,21 rateado por VA), diferença < 0,003 por item.

**Custo anterior × recalculado:**

| | v1 (bloqueada) | v2 / QA | Diferença |
|---|---|---|---|
| Total | 152.684,64 | 156.360,005 | **+3.675,365** |
| Explicação | sem VA: seguro (754,155) e despachante (1.800) excluídos; AFRMM/Siscomex não lançados | VA preenchido; encargos lançados | 754,155 + 1.800 + 1.005,54 (AFRMM) + 115,67 (Siscomex) = 3.675,365 |

Com o VA canônico de 6 casas (o que a ação P1 gravaria) em vez do VA digitado em centavos: 23.388,7306 / 93.038,9168 / 39.932,3577 — **mesmo total em centavos (156.360,01)**; diferenças de ±0,0002 por item vêm só da base de rateio 84.716,745 × 84.716,75.

## 7. Divergências e ressalvas

1. **Ferramenta (não é bug do motor):** o CLI de referência dá `0/21` em worktree Windows (CRLF). Sugestão: `.gitattributes` com `eol=lf` para `docs/import-intelligence/fixtures/**` ou normalizar `\r\n` no comparador.
2. **AFRMM duplicado:** a conciliação marca `duplicado=true`, mas a base do ICMS usa a **soma** lançada (2.011,08) e `ausente_no_custo` = 0. O alerta depende de o usuário agir. Reprodução: `conciliarEncargosAduaneiros([frete, seguro, 'AFRMM (8% do frete)' 1005.54, 'AFRMM' 1005.54], câmbio, true)`.
3. **Classificação por texto (regex)** de frete/seguro/AFRMM/Siscomex é frágil (reconhecido no código).
4. **Rateio diferente do mesmo encargo:** AFRMM entra no custo por PESO_BRUTO e na base do ICMS por VA. O total é o mesmo, mas a distribuição por item muda. Decisão fiscal.
5. **Margem com custo de 6 casas** usa o custo em centavos (30,17 % × 30,11 % exato).
6. **Ação P1** grava item a item sem transação. Se o RPC falhar no meio, o preenchimento fica parcial (o retorno informa `n/total`).
7. Regras fiscais (AFRMM/ICMS-PE, 20,5 %, critério VALOR_FOB do VA, incorporação dos tributos) **pendentes de validação**.

## 8. Não executado

- `shared-core/src/import/pg.local.spec.ts` (5 testes skipped) e `backend/scripts/*.test.sql`: **não executados**. Não há Postgres local nem Docker, e a homologação não tem o módulo.
- Nenhuma escrita em produção: só SELECTs no projeto `kbabmewnahysfvlybiak`.

## 9. Parecer

**APROVADO COM RESSALVAS.** A aritmética de P1, P2, P3 e P6 confere com cálculos independentes. Todos os casos extremos conferem. O refactor de P5 não muda o comportamento do motor (21/21 + 7/7). A apuração real v2 (156.360,01) é reproduzida ao décimo de milésimo. As diferenças para a v1 estão explicadas integralmente. As ressalvas 2, 4 e 7 dependem de decisão fiscal ou de produto. Nenhuma delas é erro de cálculo.
