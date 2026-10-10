# Fixtures do motor de landed cost

Casos de referência para a implementação do motor em `shared-core/src/import/` (Sprint S1a). **Não são código de aplicação.** Nada aqui é importado por `shared-core`, `pdv-importados` ou `backend`.

## Estrutura

```
fixtures/
  README.md                          este arquivo
  referencia/
    landed-cost-referencia.mjs       verificador de referência (Node puro, sem dependências)
  casos/
    NN-nome/
      input.json                     entrada do motor
      expected.json                  saída esperada (gerada pelo verificador)
```

## Como rodar

Da raiz do repositório:

```bash
node docs/import-intelligence/fixtures/referencia/landed-cost-referencia.mjs
```

Saída esperada: uma linha `PASS` por caso e `21/21 PASS`. Código de saída `1` se algum caso falhar.

Não precisa de `npm install`, banco, rede nem Supabase.

### Regenerar `expected.json`

```bash
node docs/import-intelligence/fixtures/referencia/landed-cost-referencia.mjs --gerar
```

**Use só com revisão.** Regenerar apaga a referência anterior. Antes de regenerar, confirme que a mudança é intencional e documente o motivo (ver `07-MOTOR-CONTRATO-MINIMO.md` §8 e §13, critério de parada).

## Relação com o motor

- O verificador **não é o motor**. É a referência contra a qual o motor será comparado.
- O motor real deve reproduzir cada `expected.json` **sem** o campo `input_hash`. Esse campo é calculado pelo adapter (ver doc 07 §3). O verificador o inclui porque calcula o hash no mesmo passo.
- Se o motor divergir de um `expected.json`, **o fixture não é ajustado para passar**. Volta-se à decisão de origem (doc 07, critério de parada).

## Casos

| Nº | Caso | O que cobre | Status esperado | Conferido à mão |
|---|---|---|---|---|
| 01 | `item-unico-brl` | Item só em BRL, sem despesa | OK | Trivial |
| 02 | `usd-taxa-10-casas` | Conversão USD com taxa de 10 casas | OK | Trivial |
| 03 | `fracao-caixa-a06` | **Empate HALF_UP** (`3,33333 ÷ 12`), correção do A-06 | OK, unitário `0.277778` | **Sim** |
| 04 | `rateio-valor-aduaneiro-3-itens` | Rateio por valor aduaneiro com **resto de 1 unidade de escala 10** | OK | **Sim** |
| 05 | `rateio-peso-bruto` | Rateio por peso bruto (20 e 60) | OK | Trivial |
| 06 | `base-zero` | Soma da base = 0 → erro, sem fallback | ERRO `LANDED_RATEIO_BASE_ZERO` | Trivial |
| 07 | `peso-ausente` | Base ausente → erro, não zero | ERRO `LANDED_DADO_AUSENTE` | Trivial |
| 08 | `justificativa-curta` | Justificativa < 10 caracteres | ERRO `LANDED_JUSTIFICATIVA_AUSENTE` | Trivial |
| 09 | `fator-inconsistente` | `comercial × fator ≠ estoque` | ERRO `LANDED_QTD_FATOR_INCONSISTENTE` | Trivial |
| 10 | `cambio-ausente` | Moeda sem taxa | ERRO `LANDED_CAMBIO_AUSENTE` | Trivial |
| 11 | `decisao-incorporavel-pendente` | DECISÃO-03 pendente: despesa fica fora do custo | BLOQUEADO `DECISAO_INCORPORAVEL_PENDENTE` | Trivial |
| 12 | `tributo-pendente` | Tributo `PENDENTE_VALIDACAO` não entra no custo | BLOQUEADO `TRIBUTO_PENDENTE` | Trivial |
| 13 | `tributo-nao-recuperavel-incorporado` | Tributo incorporado por regra | OK, `+25.5000` | Trivial |
| 14 | `desconto-processo-rateado` | Desconto de processo negativo rateado | OK, custo `6246.9150` | Trivial |
| 15 | `exemplo-doc-02` | **Exemplo do doc 02**: frete, armazenagem, desconto, resíduo unitário | BLOQUEADO (só `TRIBUTO_PENDENTE`), total `8056.5450`, unitário `5.594823`, resíduo `-0.0001200000` | **Sim** |
| 16 | `ordem-invertida` | Mesmo caso 15 com despesas em ordem invertida. **Saída idêntica à 15** (I-02) | BLOQUEADO, igual à 15 | **Sim** |
| 17 | `valor-aduaneiro-ausente` | Rateio por valor aduaneiro com item sem base: despesa excluída | BLOQUEADO `VALOR_ADUANEIRO_AUSENTE` | Não |
| 18 | `escala-excedida` | 7 casas em campo de 6 | ERRO `LANDED_DECIMAL_ESCALA_EXCEDIDA` | Trivial |
| 19 | `rateio-volume-quantidade` | Rateio por volume e por quantidade de estoque; resíduo de unitário | OK | **Sim** |
| 20 | `fracao-caixa-0-5` | Fração de unidade comercial (0,5 CX) | OK, unitário `1.666667` | **Sim** |
| 21 | `rateio-peso-liquido` | Rateio por peso líquido (2,5 e 7,5) | OK | **Sim** |

**"Trivial"** = resultado óbvio que não exige conta. **"Conferido à mão"** = cálculo refeito sem o verificador, com o resultado comparado. Os casos marcados como "Não" ainda precisam dessa revisão.

## Limitações

1. **Os `expected.json` foram gerados pelo verificador.** A conferência à mão cobre os casos marcados. Não é prova de que a regra de negócio está certa: só prova que a aritmética é a descrita.
2. **O arredondamento HALF_UP é proposta.** Enquanto DECISÃO-06 não for aprovada, qualquer caso com empate pode mudar. Casos afetados: 03, 04, 15, 19, 20, 21.
3. **Vigência de regra (T-FIS-04)** não tem fixture. Está coberta por testes adversariais em `shared-core/src/import/landedCost.adversarial.spec.ts` (P-01 resolvido).
4. **Glosa de crédito (T-FIS-06)** não tem fixture. Glosa com incorporação está coberta pelo código, mas não há teste de glosa dedicado.
5. **Não há caso com fração de unidade e rateio no mesmo item** (pendência P-03).

## Como acrescentar um caso

1. Criar `casos/NN-nome/input.json` com o contrato de `07-MOTOR-CONTRATO-MINIMO.md` §3.
2. Rodar o verificador com `--gerar`. Ele regrava **todos** os casos; conferir com `git diff` que só o novo `expected.json` apareceu (nenhum `expected.json` antigo deve mudar sem justificativa).
3. Conferir à mão o número principal e registrar na tabela acima.
4. Rodar sem `--gerar`: deve dar `PASS`.
