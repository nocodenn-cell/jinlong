# 06 — Decisões 02, 04, 06 e 10: texto, opções, recomendação e consequências

Este documento detalha as quatro decisões pedidas para a implementação isolada do motor matemático. O resumo curto está em `01-ARQUITETURA.md` §10. Para cada decisão há: o que está sendo decidido, as opções, a recomendação, as consequências técnicas e se a decisão **bloqueia** o motor puro.

Nenhuma decisão foi tomada por este documento. Cada uma precisa de aprovação escrita do responsável indicado.

| Decisão | Tema | Responsável | Bloqueia o motor puro? |
|---|---|---|---|
| DECISÃO-02 | Critério de rateio | Produto + contabilidade | **Não** |
| DECISÃO-04 | Fonte e data do câmbio | Produto + contabilidade | **Não** (só o conjunto de fontes aceitas) |
| DECISÃO-06 | Arredondamento, escalas e resíduo | Arquitetura + contabilidade | **Sim** (fixa os valores de referência) |
| DECISÃO-10 | Representação decimal | Arquitetura | **Sim** (escolha de implementação) |

---

## DECISÃO-02 — Critério de rateio padrão por tipo de despesa

### Texto da decisão

> Para cada despesa de importação que deva ser distribuída entre itens, qual critério de rateio se aplica, quem o define, e existe um critério padrão associado ao tipo de despesa?

### Critérios em discussão

| Critério | Base | Quando faz sentido (a validar) |
|---|---|---|
| `VALOR_ADUANEIRO` | Valor aduaneiro do item em BRL | Despesas proporcionais ao valor da mercadoria |
| `PESO_LIQUIDO` | Peso líquido em kg | Despesas ligadas ao produto em si |
| `PESO_BRUTO` | Peso bruto em kg (inclui embalagem) | Frete cobrado por peso |
| `VOLUME` | m³ | Armazenagem, espaço ocupado |
| `QUANTIDADE_ESTOQUE` | Unidades de estoque (após fator) | Despesas por unidade vendável |
| `DIRETA` | Item específico | Despesa identificada com um item |

### Opções

| Opção | Descrição | Vantagem | Risco |
|---|---|---|---|
| **A** | Padrão fixo por tipo (ex.: frete → peso bruto) em tabela | Menos digitação | Aplica critério sem olhar o documento; a missão proíbe critério arbitrário |
| **B** | Sem padrão. Critério obrigatório em cada lançamento, com justificativa | Rastreável; nenhum critério é presumido | Mais trabalho para o operador |
| **C** | Padrão sugerido pelo sistema, confirmado em cada lançamento | Equilíbrio | Confirmação pode virar clique automático sem leitura |

### Recomendação

**Opção B**, sem padrão em nenhum lugar do código. A sugestão de padrão (opção C) pode ser discutida depois, quando houver regra documentada pela contabilidade para cada tipo de despesa.

### Consequências técnicas

1. O motor **exige** `atribuicao.criterio` e `atribuicao.justificativa` em toda despesa rateada. Ausência gera `LANDED_CRITERIO_INVALIDO` ou `LANDED_JUSTIFICATIVA_AUSENTE`. Nenhum valor default no código.
2. A lista de critérios é fechada (6 valores). Adicionar um critério é mudança de `schema_version`.
3. Trocar o critério de um lançamento gera **nova versão de cálculo**. A anterior fica intacta.
4. A UI (fase posterior) precisa tornar o campo obrigatório. Sem isso, o problema é só de interface, não do motor.
5. Testes obrigatórios: T-RAT-05 (direta), T-RAT-08 (sem justificativa). Fixture `08-justificativa-curta`.

### Bloqueia o motor?

**Não.** O motor já implementa B. A decisão só é necessária antes de existir qualquer **preset** de rateio na interface.

---

## DECISÃO-04 — Fonte e data do câmbio

### Texto da decisão

> De onde vem a taxa de câmbio usada para converter valores em moeda estrangeira para BRL, e quais fontes são aceitas como registro de auditoria?

### Opções

| Opção | Descrição | Vantagem | Risco |
|---|---|---|---|
| **A** | Taxa digitada pelo usuário, sem fonte | Simples | Sem auditoria; não atende Etapa C.3 |
| **B** | Taxa declarada no documento de importação (DI/DUIMP) | Vinculada ao documento | Depende de o documento estar disponível e de ser a taxa adotada pela contabilidade (NÃO VALIDADO) |
| **C** | Cotação do Banco Central (PTAX) buscada por API na data | Referência pública | **Chamada externa**: o motor não pode fazer I/O; exigiria adapter e tratamento de falha |
| **D** | Fonte enumerada: `DECLARADA_DI`, `MANUAL`, `OUTRA`, com data obrigatória | Auditável, sem I/O | Ainda depende de quem digita |

### Recomendação

**Opção D** para a fase isolada. A opção C fica fora desta fase, porque o motor é puro e a missão proíbe APIs externas nesta etapa. Se a contabilidade adotar uma regra de taxa (B ou C), ela entra como regra de validação na camada de aplicação, não no motor.

### Consequências técnicas

1. Cada câmbio tem `moeda`, `taxa` (string decimal, 10 casas), `fonte` (enum fechado de 3 valores) e `data` (YYYY-MM-DD).
2. O motor usa a taxa; `fonte` e `data` só entram na saída de auditoria, não alteram o cálculo.
3. Moeda sem câmbio gera `LANDED_CAMBIO_AUSENTE`. Não existe taxa padrão.
4. Taxa ≤ 0 gera `LANDED_CAMBIO_INVALIDO`.
5. Mudança de taxa após cálculo gera nova versão (T-RET-03).
6. Testes: fixture `02-usd-taxa-10-casas`, fixture `10-cambio-ausente`.

### Bloqueia o motor?

**Não**, exceto pelo conjunto de valores aceitos em `fonte`, que é trivial e pode ser ajustado sem reescrever o motor. Qual taxa a contabilidade adota é **NÃO VALIDADO**.

---

## DECISÃO-06 — Arredondamento, escalas e tratamento de resíduo

### Texto da decisão

> Qual modo de arredondamento é usado nos cálculos e na persistência, em quais escalas cada grandeza é calculada e guardada, e como o resíduo de arredondamento é distribuído?

### Componentes da decisão

| Item | Opções | Proposta |
|---|---|---|
| (a) Modo de arredondamento | HALF_UP (empate para longe de zero), HALF_EVEN (empate para o par), TRUNCAR | **HALF_UP** |
| (b) Escala intermediária | 6, 8, 10 casas | **10 casas** |
| (c) Escala de persistência do total do item | 2, 4 | **4 casas** |
| (d) Escala de persistência do unitário | 4, 6 | **6 casas** |
| (e) Escala de taxa de câmbio | 6, 8, 10 | **10 casas** |
| (f) Rateio | Feito na escala intermediária, com resto pelo maior resto (desempate por `id` ascendente) | **Sim** |
| (g) Resíduo | Registrado como valor, nunca descartado | **Sim** |

### Por que essa proposta

- **Escala 10 no intermediário** faz o rateio fechar exatamente: qualquer soma de valores com até 6 casas e taxa de 10 casas cabe sem arredondamento. Por isso o resíduo do rateio é sempre zero; o resíduo só aparece na persistência.
- **Maior resto** é o método usual de Hamilton para distribuir sobras de forma determinística.
- **HALF_UP** é o arredondamento que a maioria das pessoas espera em contexto comercial. **A adequação para a contabilidade é NÃO VALIDADA.** Se a contabilidade pedir HALF_EVEN, o motor não muda de estrutura; muda só a função de arredondamento, e todos os valores de referência mudam.

### Consequências técnicas

1. Os valores de referência dos fixtures dependem diretamente desta decisão. Mudar o modo **invalida** todos os `expected.json` que tenham empate. Caso relevante: fixture `03-fracao-caixa-a06` (empate em 0,2777775).
2. A lógica de arredondamento precisa ser idêntica em TypeScript (motor) e em SQL (`ROUND` do Postgres). **Comportamento de `round()` do Postgres em empates precisa ser validado** antes de qualquer migration (NÃO VALIDADO).
3. Ampliar a escala de `importacoes_nfe_itens.custo_unitario` ou `produtos.preco_custo` é mudança de banco. Reduzir escala perde dado (ver `05-PLANO-DE-SPRINTS.md`, S2).
4. Três valores diferentes hoje coexistem: `ROUND(…,2)` no RPC de importação (A-06), `numeric(10,2)` e a regra de resíduo inexistente. A decisão troca os três por um único conjunto.
5. Testes obrigatórios: T-RND-01 (empate), T-RND-02 (resíduo), T-RND-03 (TS igual ao SQL). Fixtures `03`, `04`, `15`.

### Bloqueia o motor?

**Sim.** Sem os valores (a) a (g) fixados, o motor não tem comportamento padrão definido, e os valores de referência não podem ser aprovados. A implementação pode receber estes parâmetros via `politica`, mas os fixtures e a suíte de regressão só são válidos depois da aprovação.

**Sub-decisão necessária:** confirmar que o resíduo de unitário (diferença entre `Σ` dos unitários e o total) é registrado, e não absorvido no último item.

---

## DECISÃO-10 — Representação decimal no motor

### Texto da decisão

> Qual solução de aritmética decimal o motor usa, sem `number` de ponto flutuante, e qual é o contrato de entrada e saída de valores?

### Opções

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A** | Inteiros `bigint` com escala explícita, auxiliar próprio (`decimal.ts`), sem dependência | Zero dependência nova; exato; tamanho pequeno; tudo testável | Precisa de testes próprios e de disciplina de escala |
| **B** | Biblioteca `decimal.js` | Pronta, arbitrária, com modos de arredondamento | Nova dependência em `shared-core`, que hoje só tem `zustand`; exige revisão de licença e de bundle |
| **C** | `number` com `Math.round` | Nenhuma | **Proibido**: erro de representação (ex.: 0,1 + 0,2) |
| **D** | Strings sem aritmética, arredondamento só na borda | Simples | Não atende o motor; qualquer cálculo volta a usar `number` |

### Recomendação

**Opção A.** O motor precisa apenas de: soma, subtração, multiplicação, divisão com arredondamento explícito, comparação e formatação de/para string. Isso cabe em uma implementação pequena sobre `bigint`, que é suportado pelo `target: ES2022` do `shared-core/tsconfig.json` (CONFIRMADO).

### Consequências técnicas

1. Representação interna: `{ v: bigint, s: number }` ou, mais simples, `bigint` com escala conhecida por contexto. A escolha exata é de implementação; o contrato externo é string decimal.
2. Entrada e saída são **strings decimais** com número fixo de casas (`"123.450000"`). Nunca número JSON.
3. Funções mínimas: `parseDecimal(str, escala)`, `add`, `sub`, `mulRescale`, `divRound(a, b, escala, modo)`, `cmp`, `formatDecimal(v, escala)`. Cada uma com teste próprio.
4. Qualquer operação que mude de escala passa por função explícita. Não há conversão implícita.
5. Sem nova dependência. Nenhuma alteração em `package.json`.
6. No banco, `numeric(p, s)` do Postgres já é decimal exato. A escala de `numeric` deve bater com a escala da política (DECISÃO-06).

### Por que não B

`decimal.js` resolve o problema, mas adiciona uma dependência de runtime a um pacote compartilhado usado pelo front-end, e a parte de que precisamos é pequena. Se a equipe preferir B, a troca não altera contratos, porque o contrato é string.

### Bloqueia o motor?

**Sim**, no sentido de que a implementação só começa depois da escolha. A recomendação (A) é independente de aprovação de negócio e pode ser aprovada na mesma reunião da DECISÃO-06.

---

## Resumo de aprovação necessária

| Decisão | Aprovação necessária para o motor isolado? | O que precisa ser escrito |
|---|---|---|
| DECISÃO-02 | Não | Confirmar que não haverá padrão automático na fase |
| DECISÃO-04 | Não (apenas enum) | Confirmar as 3 fontes aceitas |
| DECISÃO-06 | **Sim** | Aprovar (a) a (g) ou substituir por valores da contabilidade |
| DECISÃO-10 | **Sim** | Aprovar a opção A |
