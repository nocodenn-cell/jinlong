# 07 — Motor matemático de landed cost: contrato mínimo, separação e GO/NO-GO

Escopo desta etapa: **documentação, contratos e fixtures**. Nenhum código de aplicação foi alterado, nenhuma migration foi aplicada, nenhum dado de produção foi lido ou escrito, e o parser de NF-e não foi corrigido.

---

## 1. Escopo do motor

**Dentro do motor:**

- Conversão de moeda com taxa explícita.
- Composição do custo por item (mercadoria, despesas incorporadas, tributos não recuperáveis incorporados, descontos).
- Rateio por critério explícito, com resto determinístico.
- Custo unitário e resíduos de arredondamento.
- Conservação de valores.
- Lista de divergências.

**Fora do motor:** banco de dados, parser de XML, persistência, hash criptográfico (fica no adapter), chamadas de rede, relógio do sistema, cotação de câmbio, classificação de tributo, recuperabilidade de crédito, autorização, tenant.

---

## 2. Localização e convenções (observadas no repositório)

Convenções confirmadas em `shared-core/`:

| Convenção | Evidência |
|---|---|
| Códigos de erro como `const` objeto + tipo derivado | `shared-core/src/inventory/errorCodes.ts` (`INVENTORY_ERROR_CODES as const`) |
| Barrel `index.ts` com `export type` e `export` | `shared-core/src/inventory/index.ts` |
| Testes `*.spec.ts` ao lado do código | `shared-core/src/inventory/inventory.spec.ts`, `financial.spec.ts` |
| Policies em subpasta | `shared-core/src/inventory/policies/validateAdjustInventory.ts` |
| Vitest, `environment: node`, inclui `src/**/*.spec.ts` | `shared-core/vitest.config.ts` |
| TypeScript estrito, `target: ES2022` (suporta `bigint`) | `shared-core/tsconfig.json` |
| Sem dependência de I/O nos domínios puros | `shared-core/src/inventory/contracts.ts` (cabeçalho: "Implementações de I/O ficam no adapter da app") |

Estrutura proposta (a criar na etapa de implementação, não agora):

```
shared-core/src/import/
  index.ts                  barrel público
  types.ts                  contratos de entrada e saída (seção 3)
  errorCodes.ts             LANDED_ERROR_CODES (seção 5)
  decimal.ts                aritmética em bigint escalado (seção 7)
  rateio.ts                 ratear(total, bases) — resto pelo maior resto
  landedCost.ts             calcularLandedCost(input)
  canonico.ts               serialização canônica (sem hash; hash é do adapter)
  decimal.spec.ts
  rateio.spec.ts
  landedCost.spec.ts        executa os fixtures de docs/import-intelligence/fixtures/casos
```

Dependências: **nenhuma nova**. Nenhuma alteração em `package.json`.

---

## 3. Contrato TypeScript proposto

Este bloco é a referência para a implementação. Não é código de aplicação.

```ts
// Strings decimais. Nunca number.
export type Decimal = string

export type Moeda = 'BRL' | 'USD' | 'CNY' | 'EUR' | (string & {}) // moeda original: qualquer código ISO
export type FonteCambio = 'DECLARADA_DI' | 'MANUAL' | 'OUTRA'      // DECISÃO-04 (proposta)

export type CriterioRateio =
  | 'VALOR_ADUANEIRO' | 'PESO_LIQUIDO' | 'PESO_BRUTO' | 'VOLUME' | 'QUANTIDADE_ESTOQUE'

export type StatusRecuperabilidade =
  | 'PENDENTE_VALIDACAO' | 'NAO_RECUPERAVEL' | 'RECUPERAVEL_POTENCIAL'
  | 'RECUPERAVEL_RECONHECIDO' | 'GLOSADO' | 'NAO_APLICAVEL'

export interface PoliticaCalculo {
  escala_intermediaria: 10            // DECISÃO-06 (proposta)
  escala_persistencia: 4              // total do item
  escala_unitario: 6
  arredondamento: 'HALF_UP'           // DECISÃO-06 (proposta)
  ordem_residuo: 'MAIOR_RESTO_ITEM_ID_ASC'
}

export interface Cambio { moeda: Moeda; taxa: Decimal; fonte: FonteCambio; data: string }

export interface ItemEntrada {
  id: string
  produto_id: string | null
  moeda: Moeda
  valor_mercadoria_moeda: Decimal      // até 6 casas
  valor_aduaneiro_brl: Decimal | null  // base documentada; null = não informada
  quantidade_comercial: Decimal        // 3 casas
  unidade_comercial: string
  fator_para_estoque: Decimal          // 6 casas, > 0
  quantidade_estoque: Decimal          // 3 casas; deve ser igual a comercial × fator
  peso_liquido_kg: Decimal | null
  peso_bruto_kg: Decimal | null
  volume_m3: Decimal | null
}

export type Atribuicao =
  | { modo: 'DIRETA'; item_id: string; justificativa: string }
  | { modo: 'RATEIO'; criterio: CriterioRateio; justificativa: string }

export interface DespesaEntrada {
  id: string
  tipo: string
  moeda: Moeda
  valor: Decimal                       // até 6 casas
  incorporavel: true | false | 'DECISAO_03'   // 'DECISAO_03' = pendente → divergência
  atribuicao: Atribuicao
}

export interface DescontoEntrada {
  id: string
  escopo: 'ITEM' | 'PROCESSO'
  moeda: Moeda
  valor: Decimal
  item_id?: string                     // obrigatório se escopo = ITEM
  criterio?: CriterioRateio            // obrigatório se escopo = PROCESSO
  justificativa: string
}

export interface TributoEntrada {
  id: string
  tributo_codigo: string
  status_recuperabilidade: StatusRecuperabilidade
  valor_apurado_brl: Decimal           // 2 casas
  item_id: string | null
  regra: { id: string; incorpora_custo: boolean } | null
}

export interface LandedCostInput {
  schema_version: '1'
  processo: { id: string; loja_importadora_id: string; moeda_base: 'BRL' }
  politica: PoliticaCalculo
  cambios: Cambio[]
  itens: ItemEntrada[]
  despesas: DespesaEntrada[]
  descontos: DescontoEntrada[]
  tributos: TributoEntrada[]
}

export type Severidade = 'BLOQUEANTE' | 'AVISO'
export interface Divergencia { codigo: LandedDivergenciaCodigo; severidade: Severidade; referencia: string; mensagem: string }

export interface ItemSaida {
  item_id: string
  produto_id: string | null
  quantidade_estoque: Decimal
  componentes_brl: {
    mercadoria: Decimal
    despesas_incorporadas: Decimal
    tributos_nao_recuperaveis: Decimal
    descontos: Decimal                 // negativo
  }
  custo_total_brl: Decimal             // escala_persistencia
  custo_unitario_brl: Decimal          // escala_unitario
  residuo_unitario_brl: Decimal        // escala 10, = total_exato − unitario × qtd
  residuo_total_brl: Decimal           // escala 10, = total_exato − total_persistido
}

export interface RateioSaida {
  origem_id: string
  componente: 'despesas' | 'descontos' | 'tributos'
  criterio: CriterioRateio
  base_total: Decimal
  item_id: string
  base_item: Decimal
  valor_alocado_brl: Decimal           // escala 10, exato
  justificativa: string
}

export interface LandedCostOutput {
  schema_version: '1'
  engine_version: string               // 'landed-cost/MAJOR.MINOR.PATCH'
  status: 'OK' | 'BLOQUEADO'           // ERRO é retorno de erro, não status de saída
  divergencias: Divergencia[]
  itens: ItemSaida[]                   // ordenado por id
  rateios: RateioSaida[]               // ordenado por origem_id, item_id
  despesas_nao_incorporadas: string[]
  conservacao: {
    entradas_brl: Decimal; descontos_brl: Decimal; saidas_brl: Decimal
    diferenca_brl: Decimal; ok: boolean
  }
}

export type LandedResult =
  | { ok: true; value: LandedCostOutput }
  | { ok: false; error: { codigo: LandedErroCodigo; detalhe: string | null } }

export declare function calcularLandedCost(input: LandedCostInput): LandedResult
```

**Observações de contrato**

- `input_hash` **não** faz parte da saída do motor. O adapter calcula `sha256` sobre `serializarCanonico(input)` e anexa o campo. Os `expected.json` dos fixtures incluem `input_hash` porque foram gerados com o verificador de referência; o teste de implementação deve comparar a saída do motor sem esse campo, ou acrescentá-lo do mesmo jeito.
- `status` de saída só admite `OK` e `BLOQUEADO`. Erro de validação não gera saída: retorna `ok: false`.
- `engine_version` deve ser alterado quando qualquer valor de referência mudar.

---

## 4. Invariantes (devem ser testados)

| ID | Invariante |
|---|---|
| **I-01** | Nenhum cálculo usa `number` para valores monetários; `Number()` só aparece na fronteira de erro, se existir |
| **I-02** | Mesma entrada, em qualquer ordem de listas, gera saída idêntica (ordenação por `id` antes do cálculo) |
| **I-03** | `Σ alocado = total` exatamente, em todo rateio (escala 10) |
| **I-04** | Resto de rateio é distribuído uma unidade de escala 10 por vez, pelo maior resto, desempate por `id` ascendente |
| **I-05** | `entradas − descontos = saídas` em escala 10; falha gera erro `LANDED_CONSERVACAO_FALHOU`, nunca saída parcial |
| **I-06** | `quantidade_estoque = quantidade_comercial × fator` exatamente, ou erro |
| **I-07** | Despesa com `incorporavel` pendente não entra no custo e gera divergência `DECISAO_INCORPORAVEL_PENDENTE` |
| **I-08** | Tributo `PENDENTE_VALIDACAO` não entra no custo e gera `TRIBUTO_PENDENTE` (bloqueante) |
| **I-09** | Base de rateio ausente nunca vira zero: gera divergência (`VALOR_ADUANEIRO_AUSENTE`) ou erro (`LANDED_DADO_AUSENTE`) |
| **I-10** | Soma de base zero nunca cai para outro critério: gera `LANDED_RATEIO_BASE_ZERO` |
| **I-11** | Sem I/O, sem `Date`, sem `Math.random`, sem `crypto` (verificável por teste estático, ver §9) |
| **I-12** | Erros de entrada são determinísticos: o mesmo input inválido gera sempre o mesmo código |

---

## 5. Catálogo de erros (proposta)

Códigos já previstos em `02-CONTRATOS.md` §2.1, mais os que o verificador de referência já usa e que faltavam no documento anterior:

| Código | Origem | Caso de fixture |
|---|---|---|
| `LANDED_SCHEMA_VERSAO` | Versão diferente de `"1"` | — |
| `LANDED_MOEDA_BASE` | `moeda_base` ≠ BRL | — |
| `LANDED_DECIMAL_FORMATO` | String não numérica | — |
| `LANDED_DECIMAL_ESCALA_EXCEDIDA` | Mais casas que a escala do campo | 18 |
| `LANDED_DADO_AUSENTE` | Campo obrigatório nulo | 07 |
| `LANDED_VALOR_NEGATIVO` | Mercadoria negativa | — |
| `LANDED_CAMBIO_INVALIDO` | Taxa ≤ 0 | — |
| `LANDED_CAMBIO_AUSENTE` | Moeda sem taxa | 10 |
| `LANDED_QTD_INVALIDA` | Quantidade ≤ 0 | — |
| `LANDED_FATOR_INVALIDO` | Fator ≤ 0 | — |
| `LANDED_QTD_FATOR_INCONSISTENTE` | `comercial × fator ≠ estoque` | 09 |
| `LANDED_ITEM_INEXISTENTE` | Atribuição a item inexistente | — |
| `LANDED_CRITERIO_INVALIDO` | Critério fora dos 5 | — |
| `LANDED_JUSTIFICATIVA_AUSENTE` | Justificativa < 10 caracteres | 08 |
| `LANDED_RATEIO_BASE_ZERO` | Soma da base = 0 | 06 |
| `LANDED_TRIBUTO_ALOCACAO_AUSENTE` | Tributo incorporado sem item | — |
| `LANDED_CUSTO_NEGATIVO` | Custo de item negativo | — |
| `LANDED_CONSERVACAO_FALHOU` | Invariante I-05 violada | — |

Divergências (não são erros; geram `status: BLOQUEADO`): `DECISAO_INCORPORAVEL_PENDENTE` (11), `TRIBUTO_PENDENTE` (12), `VALOR_ADUANEIRO_AUSENTE` (17).

---

## 6. Quais decisões bloqueiam especificamente o motor puro

Análise pedida: o que impede implementar, testar e aprovar o motor matemático **isolado**, sem banco, parser ou integração.

| Decisão ou ponto | Bloqueia implementação? | Bloqueia aprovação dos valores de referência? | Motivo |
|---|---|---|---|
| **DECISÃO-06** (arredondamento, escalas, resíduo) | **Sim** | **Sim** | Define o comportamento padrão. Fixtures 03, 04, 15, 19, 20 dependem dela |
| **DECISÃO-10** (representação decimal) | **Sim** | Não | Escolha de implementação. Recomendação independente de negócio |
| DECISÃO-02 (critério padrão) | Não | Não | Motor já exige critério explícito; padrão só faria sentido na UI |
| DECISÃO-04 (fonte do câmbio) | Não | Não | Motor recebe a taxa; só o enum de `fonte` precisa de confirmação |
| DECISÃO-03 (tributos e incorporação) | Não | Não | Motor trata pendência como divergência. Bloqueia **publicação**, não cálculo |
| DECISÃO-01 (publicação em `preco_custo`) | Não | Não | Fora do motor |
| DECISÃO-05 (tolerância duplicata × NF) | Não | Não | Guarda de integração (S3) |
| DECISÃO-07 a 09, 11 a 13 | Não | Não | Integração, autorização, UI ou parser |
| DECISÃO-14 (módulo por cliente, §12) | Não | Não | Exposição, não cálculo |

**Conclusão:** só **DECISÃO-06** e **DECISÃO-10** bloqueiam o motor puro. As demais bloqueiam integração ou publicação.

**Ressalva:** a DECISÃO-06 pode ser parametrizada no motor (lendo `politica`), o que permite implementar antes da aprovação. Mas nenhum fixture com empate pode ser marcado como aprovado antes disso.

---

## 7. Biblioteca decimal ou solução de precisão: recomendação

**Recomendação: auxiliar próprio `decimal.ts` sobre `bigint` escalado, sem nova dependência.** É a opção A da DECISÃO-10 (`06-DECISOES-DETALHADAS.md`).

### Operações mínimas

| Função | Contrato |
|---|---|
| `parseDecimal(s: string, escala: number): bigint` | Rejeita formato inválido e casas excedentes |
| `formatDecimal(v: bigint, escala: number): string` | Sempre `escala` casas; sem notação científica |
| `add`, `sub` | Mesma escala obrigatória |
| `mulRescale(a, sa, b, sb, alvo, modo)` | Produto com escala `sa+sb` reescalado para `alvo` |
| `divRound(a, sa, b, sb, alvo, modo)` | Divisão com arredondamento explícito |
| `reescala(v, de, para, modo)` | Único ponto de mudança de escala |
| `cmp` | Comparação |

### Por que essa opção

1. O motor precisa só de + − × ÷ com arredondamento explícito e comparação. Nenhuma função transcendental.
2. `bigint` é nativo em ES2022 (target atual). Zero dependência, zero revisão de licença, zero impacto em bundle do front-end.
3. Exatidão: `Σ` e rateio são inteiros. A propriedade `Σ alocado = total` é provada por construção, não por tolerância.
4. A alternativa `decimal.js` resolveria, mas adiciona dependência de runtime a um pacote compartilhado que hoje só depende de `zustand`.

### Testes obrigatórios do auxiliar

- Arredondamento HALF_UP nos dois sinais (`2.5 → 3`, `−2.5 → −3`).
- Empate exato em `0.5` e em `0.0000500` na escala de persistência.
- Divisão por zero → erro, nunca `Infinity`.
- `parse` com 11 casas quando a escala é 10 → erro.
- Round-trip `formatDecimal(parseDecimal(s, e), e) === s` para toda entrada válida.

### Atenção ao banco

Ao espelhar valores no Postgres, usar `numeric(p, s)` com `s` igual à escala da política. Não usar `real`/`double precision`. A equivalência de arredondamento TS × SQL (T-RND-03) precisa ser testada.

---

## 8. Separação: motor matemático × correções do parser

Estas duas frentes **não compartilham código nem arquivo**. Podem ser revisadas, aprovadas e revertidas em separado.

| Aspecto | Motor matemático (S1a) | Parser de NF-e (S1b) |
|---|---|---|
| Objetivo | Calcular custo a partir de entrada estruturada | Ler XML e preservar texto tal como está |
| Arquivos | `shared-core/src/import/*` (novo) | `pdv-importados/lib/nfe/nfeParser.ts` e teste existente |
| Depende de | Nada (puro) | Biblioteca `fast-xml-parser` (já existente) |
| Usado por | Testes e, depois, adapter | Fluxo de importação atual em produção |
| Dados afetados | Nenhum | Vínculos fornecedor-produto já gravados (risco R-P1) |
| Migration | Não | Não nesta fase |
| Reversão | Remover pasta | Reverter arquivo; **exige** checar vínculos antes |
| Aprovação | DECISÃO-06 e DECISÃO-10 | Relatório de compatibilidade de vínculos em clone |
| Quando | Após GO deste documento | Depois, em PR separado |
| Nesta etapa | **Não implementar** | **Não corrigir** |

**Regra de dependência:** o motor não lê XML. Os fixtures são construídos a partir de JSON estruturado. O parser só passa a alimentar o motor na fase de adapter (S3), depois que S1b estiver aprovado.

**Sobre o achado do parser (A-03):** o probe confirmou que `parseTagValue: true` converte `cProd "0012"` em `12`. Isso é um defeito real, mas **não bloqueia** o motor, porque o motor não usa `cProd`. Bloqueia apenas a integração.

---

## 9. Testes que podem rodar integralmente em ambiente isolado

"Isolado" aqui significa: sem banco, sem rede, sem Supabase, sem o app Next.js, sem alterar código de aplicação.

### 9.1 Já executáveis agora

| Teste | Como rodar | Resultado desta etapa |
|---|---|---|
| Verificador de referência dos 21 fixtures | `node docs/import-intelligence/fixtures/referencia/landed-cost-referencia.mjs` | **21/21 PASS** |
| Verificação manual de números-chave | Ver `fixtures/README.md` | Conferido: fixtures 03, 04, 15, 19, 20, 21 |

Esse verificador **não é o motor**. Ele é a referência contra a qual o motor será comparado.

### 9.2 Executáveis depois da implementação (sem banco)

| Grupo | Testes da matriz (`04-TESTES-E-GATES.md`) | Ambiente |
|---|---|---|
| Determinismo | T-DET-01 a T-DET-05 | `vitest` na raiz (`node_modules/.bin/vitest` existe) |
| Precisão | T-PREC-01 a T-PREC-03 | `vitest` |
| Conservação | T-CONS-01, T-CONS-02 | `vitest` |
| Arredondamento | T-RND-01, T-RND-02 | `vitest` |
| Rateio | T-RAT-01 a T-RAT-08 | `vitest` |
| Unidades | T-UNI-01, T-UNI-03 (fração) | `vitest` |
| Crédito fiscal (motor) | T-FIS-01, T-FIS-03, T-FIS-05 | `vitest` |
| Fixtures | 21 casos contra a implementação | `vitest` |
| Estático | I-11: lint de imports proibidos em `shared-core/src/import/` | `vitest` com leitura de arquivo, ou `grep` em CI |
| Auxiliar decimal | Testes da seção 7 | `vitest` |

**Pendências de cobertura do fixture (não bloqueiam):**

- T-RAT-06 e T-RAT-07: cobertos por 06 e 07, mas não por critério `VOLUME` com base zero.
- T-FIS-04 (regra fora de vigência): **não coberto por fixture**. Exige campo de vigência em `regra`, que ainda não está no contrato. Ver pendência P-03 abaixo.
- T-FIS-06 (glosa): não coberto.

### 9.3 Não executáveis em ambiente isolado

| Grupo | Motivo |
|---|---|
| T-IDEM, T-PARC, T-RET (SQL) | Precisam de Postgres com as migrations |
| T-ISO-01 a 08 | Precisam de RLS e usuários reais |
| T-EST-01 a 04 | Precisam de kardex e estoque |
| T-PARSE-01 a 08 | Dependem do parser e de XMLs reais; fazem parte de S1b |
| T-COMP-01 a 06 | Suítes de regressão existentes do app e do banco |
| T-DET-06 | Reprocessamento do XML persistido (S2) |

---

## 10. Fixtures

Pasta: `docs/import-intelligence/fixtures/casos/`. Cada caso tem `input.json` e `expected.json`. Lista completa em `fixtures/README.md`.

Fixtures foram **conferidos à mão** para: 03 (empate HALF_UP, resíduo −0,000006), 04 (rateio com resto de 1 unidade de escala 10), 15 (exemplo do doc 02: 8056,5450, unitário 5,594823, resíduo −0,0001200000), 16 (ordem invertida gera saída idêntica a 15), 19 (volume e quantidade de estoque), 20 (fração de caixa), 21 (peso líquido).

**Limitação honesta:** o `expected.json` foi gerado pelo verificador de referência. Ele é a fonte de verdade enquanto a implementação não existe. A conferência à mão cobre os casos acima, não todos. Antes do GO de implementação, recomenda-se revisão independente de pelo menos 5 fixtures por outra pessoa.

---

## 11. Pendências novas identificadas nesta etapa

| ID | Pendência | Ação |
|---|---|---|
| **P-01** | `regra` de tributo sem vigência no contrato | **Resolvido.** `RegraTributo` tem `vigencia_inicio` (obrigatória) e `vigencia_fim` (nula = em vigor); `TributoEntrada` tem `data_fato_gerador`. Fato gerador fora da vigência gera `TRIBUTO_REGRA_FORA_VIGENCIA` e exclui o tributo. Limites inclusivos. Testado em `landedCost.adversarial.spec.ts` |
| **P-02** | `arredondamento` no input aceita só `HALF_UP`, sem ligar à DECISÃO-06 | **Resolvido.** Tipo literal `'HALF_UP'`; qualquer outro valor gera `LANDED_POLITICA_INVALIDA`. A política é literal, não ajustável por entrada. Mudar exige nova versão do motor |
| **P-03** | Não há fixture para T-UNI-03 com fração de unidade **e** critério de rateio | **Parcialmente resolvido.** Frações (fixture 20) e rateio por critérios (fixtures 19, 21) estão cobertos separadamente. Combinação no mesmo item segue aberta, coberta por teste adversarial de unidade fracionada |
| **P-04** | Hash: o verificador calcula `input_hash` e o motor não deveria | **Resolvido.** O motor não calcula hash. `serializarCanonico` (em `canonico.ts`) produz a string canônica; o adapter aplica sha256 |

## 12. Decisões adiadas (registradas na implementação da S1a)

| Item | Motivo do adiamento | Tratamento no motor |
|---|---|---|
| Regime tributário da empresa | Decisão contábil (F-01 de `03-MATRIZ-FISCAL.md` §7) | Não entra no motor; a regra chega pronta |
| Tolerância entre duplicatas e valor da NF-e (DECISÃO-05) | Pertence à guarda de integração (S3) | Fora do motor |
| Método de baixa de estoque (FIFO, média, atual) | Não definido | Fora do motor |
| Valores negativos de despesa | Permitidos como ajuste ou estorno; falta confirmar com a contabilidade se todo ajuste precisa de documento | Aceitos com justificativa obrigatória |
| Parâmetros de política além do aprovado | Só o conjunto da DECISÃO-06 é válido nesta versão | Literais; outro valor é erro |

**Fonte de verdade a partir da implementação:** `shared-core/src/import/types.ts`. A seção 3 deste documento é a referência humana e foi mantida coerente com ele.

---

## 12. Requisito de produto: módulo opcional por cliente, fora das lojas comuns

### Confirmação solicitada

> O novo módulo Import Intelligence será opcional por cliente contratante e não aparecerá nas lojas comuns.

### Estado desta confirmação

**Requisito registrado. Não confirmado como implementado, e a infraestrutura atual não o sustenta.**

| Verificação | Resultado | Evidência |
|---|---|---|
| Existe tabela de contratação, licença ou módulo por cliente? | **Não** | Busca por `modulo`, `assinatura`, `licenca`, `entitlement`, `plano` em `backend/supabase/migrations`: zero tabelas |
| Feature flag suporta escopo por cliente ou loja? | **Não** | `feature_flags (name, enabled, description, updated_at)` é global (`073_feature_flags.sql`) |
| Algum componente de interface consulta feature flag? | **Não** | Busca em `pdv-importados/lib`, `components` e `app` (não-teste): nenhum uso |
| Multiempresa permite distinguir cliente contratante? | **Não** | ESPEC v1 não executada (A-19) |

### Consequência

Hoje **não é possível** garantir que o módulo fique invisível nas lojas comuns: qualquer flag seria global, e não existe nenhum ponto de controle de visibilidade. Isso não afeta o motor isolado, que não tem interface nem rota. Afeta **S3** em diante.

### Requisito a ser cumprido antes de qualquer exposição

1. **Controle no servidor, não só na tela.** Rotas, menu, server actions e RPCs do módulo devem recusar acesso quando o cliente não tem o módulo contratado. Esconder botão não basta.
2. **Modelo de contratação por cliente**, a definir em **DECISÃO-14** (ver `01-ARQUITETURA.md` §10 e §12 abaixo).
3. **Loja comum não enxerga o módulo**, mesmo com perfil GERENTE ou DONO, enquanto o contrato não existir para aquele cliente.
4. **Teste de regressão**: usuário de cliente sem contrato recebe negação em rota, menu, RPC e relatório. Entra na matriz de isolamento (T-ISO-*) como caso novo.

### Recomendação para DECISÃO-14

| Opção | Descrição | Avaliação |
|---|---|---|
| A | Tabela `modulos_contratados (empresa_id, modulo, ativo, vigencia_inicio, vigencia_fim)`, lida no servidor por helper `fp_modulo_ativo(empresa, modulo)` | **Recomendada**. Depende de `empresas` (ESPEC etapa 1). Fica alinhada à arquitetura de tenant |
| B | Um deploy por cliente, com flag de build | Simples, mas quebra a base única de código e não atende "por cliente" dentro de um mesmo banco |
| C | `feature_flags` com coluna `empresa_id` | Gambiarra sobre tabela global; não recomendada |

**Sequenciamento:** a opção A entra junto com S5 (multiempresa). Até lá, **nenhuma rota, menu ou RPC do módulo é criada**. Isso é compatível com o cronograma, porque S1a e S1b não expõem nada.

### Veredito sobre o requisito

**Não confirmado como cumprido. Confirmado como requisito bloqueante para S3.** Não é necessário antes do motor, porque o motor não expõe nada. É obrigatório antes de qualquer rota, menu ou RPC do módulo, ou seja, antes de S3.

---

## 13. GO / NO-GO para a implementação isolada do motor matemático

### Veredito: **GO CONDICIONADO** para implementar o motor em `shared-core/src/import/`, **a começar só depois** de duas aprovações. Não iniciado nesta etapa.

### Condições obrigatórias (todas)

1. **DECISÃO-06 aprovada** (modo de arredondamento, escalas, regra de resíduo), ou substituída por valores da contabilidade com revisão dos fixtures afetados.
2. **DECISÃO-10 aprovada** (auxiliar `bigint` escalado, opção A).
3. **P-01 e P-02 resolvidas** no contrato (vigência de regra e enum de arredondamento).
4. Revisão independente de pelo menos 5 fixtures, incluindo 03, 04 e 15.
5. Escopo restrito a `shared-core/src/import/` e a `docs/import-intelligence/`. Sem import de `pdv-importados`, `backend` ou Supabase. Sem nova dependência.

### O que o GO **não** autoriza

- Parser de NF-e (S1b), que tem aprovação separada.
- Qualquer migration, RPC, tabela ou escrita em banco.
- Alteração de `preco_custo`, estoque, financeiro ou preço.
- Exposição do módulo em tela, rota ou menu.
- Multiempresa.

### Critério de parada

Se a implementação exigir `number` para valor monetário, dependência nova, I/O ou qualquer valor de referência que não bata com a aritmética dos fixtures, **parar e voltar à decisão**. Não ajustar o fixture para fazer o teste passar.
