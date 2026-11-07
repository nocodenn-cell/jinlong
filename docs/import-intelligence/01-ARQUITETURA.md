# 01 — Arquitetura do Import Intelligence (proposta)

Documento de Sprint 0. Nada aqui foi implementado. Referências `A-xx` apontam para `00-AUDITORIA.md`; `DECISÃO-xx` está registrada na seção 10.

---

## 1. Princípios

1. **Reutilizar antes de criar.** Estoque, kardex, pedido de compra, remessa, NF-e de entrada, contas a pagar e histórico de preços já existem. O novo domínio **consome** esses dados e **publica** um resultado de custo. Não cria segundo estoque, segundo financeiro nem segundo cadastro de produto.
2. **Uma fonte por dado.** Cada informação tem um dono (seção 4). Quem não é dono consulta por porta, não copia.
3. **Determinismo.** Mesma entrada, mesma saída, byte a byte. Sem `Date.now()`, sem aleatoriedade, sem I/O no motor.
4. **Dinheiro sem ponto flutuante.** Nenhum cálculo monetário usa `number` de JavaScript ou `float` do Postgres.
5. **Histórico imutável.** Versões de cálculo são append-only. Correção gera nova versão, nunca `UPDATE`.
6. **Fail closed.** Dado ausente gera divergência, nunca zero silencioso. Tenant desconhecido gera negação.
7. **Simplicidade.** Sem camada genérica de "tributos", sem barramento de eventos nesta fase.

---

## 2. Boundaries existentes que o domínio respeita

| Referência | O que impõe | Como o Import Intelligence se encaixa |
|---|---|---|
| ADR-005 (fronteiras shared-core) | Domínios puros em `shared-core`, I/O no adapter da app | Motor e tipos em `shared-core/src/import/`; adapters em `pdv-importados/` |
| ADR-007 (products) | Produto é dono do cadastro e do preço de cadastro | Import **não** escreve preço de venda. Pode propor `preco_custo` por decisão explícita (DECISÃO-01) |
| ADR-008 (inventory) | Estoque, kardex e saldo são de inventory. Valuation fora de escopo | Import **lê** o kardex e as entradas. Não escreve saldo. Custo fica no domínio import |
| ADR-010 (financial) | Contas a pagar são de financial | Import **lê** `contas_pagar` por `nfe_importacao_id`. Não cria AP por fora da NF-e |
| ADR-caixa-002 | Caixa não conhece estoque | Import não toca caixa |
| `inventario_inventory_autoridade.md` | Mapa de escritores de estoque | Usar como checklist de writers ao planejar integrações |
| ESPEC multiempresa v1 | Toda operação responde "qual é o tenant?"; falha fechada | Obrigatório em todas as portas (seção 8) |

**Padrão já usado no código e a seguir aqui:** o `shared-core/src/inventory/contracts.ts` declara portas (`InventoryReader`, `InventoryMovementWriter`) e diz que "implementações de I/O ficam no adapter da app". O domínio import segue o mesmo desenho.

---

## 3. Domínio proposto: `import`

### 3.1 Entidades

| Entidade | Responsabilidade | Chave e invariantes |
|---|---|---|
| **ProcessoImportacao** (raiz do agregado) | Uma operação de importação de um lote de mercadorias | `id`; `loja_importadora_id`; `moeda_base = BRL`; `estado`; `versao_atual`; **nunca** `DELETE` |
| **DocumentoImportacao** | Documento que comprova a operação: DI/DUIMP, invoice do exportador, packing list, conhecimento de transporte, NF-e de entrada, recibo de frete | `tipo`, `id_externo`, `chave` (quando houver), `data`, `hash_arquivo`; liga a `importacoes_nfe` quando for NF-e de entrada |
| **ItemImportacao** | Mercadoria do processo | Liga a `produto_id` (pode ser nulo antes do cadastro, ver NF-e manual) e a `ItemNfeOrigem` quando existir; `quantidade_comercial`, `unidade_comercial`, `fator_para_estoque`, `quantidade_estoque` |
| **DespesaImportacao** | Custo atribuível ao processo ou a itens | `tipo`, `valor` em moeda original, `moeda`, `cambio_ref`, `incorporavel` (bool, DECISÃO-03), `atribuicao` (direta ou rateio), `doc_origem_id` |
| **CriterioRateio** | Regra e justificativa de distribuição de uma despesa | `criterio ∈ {VALOR_ADUANEIRO, PESO_LIQUIDO, PESO_BRUTO, VOLUME, QUANTIDADE_ESTOQUE, DIRETA}`; `justificativa` obrigatória e não vazia; `definido_por` |
| **TributoLancamento** | Tributo apurado ou recolhido sobre um item ou processo (contrato em `02-CONTRATOS.md` §4 e `03-MATRIZ-FISCAL.md`) | Nunca lista fixa no código; regra referenciada por `regra_id` com vigência |
| **VersaoCalculo** | Resultado imutável de uma execução do motor | `versao` inteiro; `input_hash`; `engine_version`; `supersede_de` (nullable); `status` |
| **CustoApurado** | Custo unitário e total de um item em uma versão | `(versao_calculo_id, item_id)` único; componentes separados (seção 6.4) |
| **CambioRef** | Taxa de câmbio usada | `moeda`, `taxa` (escala 10), `fonte` (DECLARADA_DI, MANUAL, OUTRA), `data` |

### 3.2 Objetos de valor

| Objeto | Forma | Regra |
|---|---|---|
| `Dinheiro` | `{ minor: bigint, escala: 2 \| 6 \| 10, moeda: string }` | Soma só com mesma moeda e escala; nunca `number` |
| `Taxa` | `{ valor: bigint, escala: 10 }` | Positiva; fonte obrigatória |
| `Quantidade` | `{ valor: bigint, escala: 3, unidade: string }` | Positiva para entrada; `unidade` precisa de conversão para unidade de estoque |
| `Conversao` | `{ fator: bigint, escala: 6, de: string, para: string }` | Fator > 0; uma conversão por item |
| `Cnpj` | 14 dígitos | Validação de dígito verificador na borda |
| `ChaveNfe` | 44 dígitos | Já existe como `chave_acesso` |
| `Percentual` | `{ valor: bigint, escala: 4 }` | Entre 0 e 100 |
| `HashConteudo` | sha256 hex | Identidade de arquivo e de input |

Implementação sugerida: auxiliar pequeno de inteiros escalados em `shared-core/src/import/decimal.ts`, sem dependência nova (DECISÃO-10). Não há biblioteca decimal em `package.json` hoje (CONFIRMADO).

### 3.3 Serviços de aplicação (casos de uso)

| Serviço | Entrada | Saída | Efeito |
|---|---|---|---|
| `ImportarDocumentosProcesso` | XML NF-e, DI/DUIMP estruturada, invoice (dados) | `DocumentoImportacao[]` | Grava documentos e hash; não calcula |
| `RegistrarDespesa` | Despesa com moeda, valor, tipo | `DespesaImportacao` | Grava; valida moeda e câmbio |
| `DefinirRateio` | Despesa + critério + justificativa | `CriterioRateio` | Grava; exige justificativa |
| `RegistrarTributo` | Lançamento tributário | `TributoLancamento` | Grava com regra e status; sem decidir recuperabilidade |
| `CalcularCustoLanding` | `ProcessoImportacao` completo | `VersaoCalculo` + `CustoApurado[]` | Função pura no motor; a aplicação só persiste |
| `RetificarProcesso` | Motivo + novos dados | Nova `VersaoCalculo` | Não altera a anterior |
| `PublicarCusto` | `versao_id` aprovada | Publicação | Ver seção 6.6 |

### 3.4 Repositórios

| Repositório | Contrato | Regra |
|---|---|---|
| `ProcessoRepository` | Leitura e criação de processo | Escrita só por RPC/servidor |
| `DocumentoRepository` | Append-only por processo | Duplicata por `hash_arquivo` no mesmo processo bloqueada |
| `TributoRepository` | Append-only | Retificação = nova linha com `supersede_de` |
| `VersaoCalculoRepository` | Append-only | `UNIQUE (processo_id, versao)` |
| `CustoApuradoRepository` | Append-only, leitura por versão | Sem `UPDATE` |

### 3.5 Portas de integração (para outros domínios)

| Porta | Quem implementa | O que o import consome | Escrita? |
|---|---|---|---|
| `EntradaEstoqueReader` | inventory (adapter sobre `movimentos_estoque_log`, `ordens_compra_recebimentos`, `remessas`) | Quantidade efetivamente recebida por item, por origem (NFE, REMESSA, ORDEM_COMPRA) | Não |
| `NfeEntradaReader` | adapter sobre `importacoes_nfe`, `importacoes_nfe_itens`, `importacoes_nfe_duplicatas` | Itens, custo unitário da nota, duplicatas, status | Não |
| `ObrigacaoReader` | financial (adapter sobre `contas_pagar`) | Títulos por `nfe_importacao_id`, soma, status | Não |
| `ProdutoCatalogReader` | products | `produto_id`, unidade de estoque, `ncm` | Não |
| `CustoPublisher` | products (adapter sobre `produtos.preco_custo` e `historico_precos_produto`) | Escrita de custo, somente após DECISÃO-01 | Sim, via RPC com autorização |
| `CambioProvider` | manual na Fase 1 | Taxa informada | Não |
| `XmlStore` | storage do Supabase, com hash | Arquivo original da NF-e | Sim (append) |

### 3.6 Eventos

**Nenhum evento nesta fase.** Motivo: não há consumidor assíncrono e o custo é consultado sob demanda. Se for necessário no futuro, usar tabela de outbox com `processo_id` e `versao`, respeitando D6 da ESPEC (`sync-outbox` fora do primeiro corte).

---

## 4. Donos de dado (fonte oficial)

| Dado | Dono oficial | Import consome como | Import publica como |
|---|---|---|---|
| Quantidade recebida | inventory / recebimento | leitura | nada |
| Saldo de estoque | inventory | nunca lê para calcular custo | nada |
| Custo unitário da NF-e | import (base) lê de NF-e | leitura do `custo_unitario` como **valor de referência** | nada |
| Custo landed | **import** | — | `CustoApurado` |
| Preço de custo do produto (`preco_custo`) | products | — | proposta/publicação somente após DECISÃO-01 |
| Histórico de preço de custo | products (trigger) | leitura | nada, o trigger registra |
| Obrigação financeira | financial (`contas_pagar`) | leitura | nada |
| Tributo apurado e recolhido | **import** | — | `TributoLancamento` |
| Crédito reconhecido | fiscal/contábil; registrado por import | — | `TributoLancamento.status` |
| Cadastro de empresa e vínculo | multiempresa (ESPEC) | leitura de tenant | nada |

---

## 5. Estados do processo

```
RASCUNHO
  │  documentos mínimos registrados
  ▼
EM_COLETA ──────────────┐
  │  itens conciliados  │
  │  com NF-e/entrada   │
  ▼                     │
PRONTO_PARA_CALCULO     │
  │  CalcularCusto      │
  ▼                     │
CALCULADO (versão N) ◄──┤ (diverg. resolvida)
  │                     │
  ▼                     │
EM_VALIDACAO ───────────┤
  │  aprovação contábil │
  ▼                     │
APROVADO                │
  │  PublicarCusto      │
  ▼                     │
PUBLICADO (versão N)    │
  │  RetificarProcesso  │
  ▼                     │
RETIFICANDO ──► CALCULADO (versão N+1) ──► ... ──► PUBLICADO (versão N+1)

Qualquer estado (exceto PUBLICADO) ──► BLOQUEADO_DIVERGENCIA ──► volta ao estado anterior após resolver
RASCUNHO / EM_COLETA / PRONTO_PARA_CALCULO ──► CANCELADO (terminal)
```

| Transição | Pré-condição | Ator | Efeito |
|---|---|---|---|
| `PRONTO_PARA_CALCULO → CALCULADO` | Sem divergência bloqueante; todas as despesas com atribuição; todos os tributos com status | Sistema, por ação do gerente/dono | Cria `VersaoCalculo` |
| `CALCULADO → EM_VALIDACAO` | Versão com `input_hash` estável | Gerente | Trava edição de insumos |
| `EM_VALIDACAO → APROVADO` | Validação contábil/fiscal registrada (`validado_por`) | Papel de validação (DECISÃO-03) | Registra aprovador |
| `APROVADO → PUBLICADO` | DECISÃO-01 implementada | Dono | Publica custo |
| `PUBLICADO → RETIFICANDO` | Motivo obrigatório | Dono | Abre nova versão |

**Estados herdados** (não alterar nesta fase): `importacoes_nfe.status` (`EM_CONFERENCIA → CONCLUIDA`, `001`/`20260805213357`), `ordens_compra.status` e `remessas.status`.

---

## 6. Motor de landed cost (especificação)

O motor é uma função pura: `CalcularCustoLanding(input) → output`. Contratos em `02-CONTRATOS.md`.

### 6.1 Ordem de cálculo

1. **Validar entrada.** Moeda, câmbio, quantidades, unidades, fatores, documentos. Qualquer falha gera divergência bloqueante.
2. **Converter moeda.** Valor da mercadoria em moeda original × taxa explícita → BRL na escala intermediária (10). Arredondamento só no fim (DECISÃO-06).
3. **Base aduaneira.** O motor **recebe** o valor aduaneiro já apurado pelo contador (`valor_aduaneiro_brl` por item, do documento de origem). **Não recalcula** a base tributária. Se o valor não vier, divergência `VALOR_ADUANEIRO_AUSENTE`.
4. **Descontos.** Descontos por item entram antes do rateio. Descontos de processo entram como despesa negativa rateada pelo mesmo critério (DECISÃO-02).
5. **Despesas.** Cada despesa é:
   - **direta**: atribuída a um item, sem rateio;
   - **rateada**: distribuída por critério. A soma das partes é exatamente igual ao total (seção 6.3).
6. **Tributos.** Cada `TributoLancamento` entra no componente conforme o status (seção 6.5). O motor não decide recuperabilidade.
7. **Custo do item.** Soma dos componentes incorporáveis, em BRL, escala 6 por quantidade de estoque.
8. **Unitário.** `custo_total_item ÷ quantidade_estoque`, arredondado a escala 6, com resíduo registrado (seção 6.4).
9. **Conservação.** Verificação obrigatória, em escala 10: `Σ(mercadoria) + Σ(despesas incorporadas) + Σ(tributos incorporados) − Σ|descontos| = Σ custo_total_item`, com diferença zero. Se não fechar, a entrada é recusada com `LANDED_CONSERVACAO_FALHOU`; nunca sai saída parcial.

### 6.2 Tratamento por tipo de valor

| Valor | Entra em | Regra |
|---|---|---|
| Mercadoria em moeda original | Base de custo, após conversão | Nunca duplicar com valor aduaneiro se o aduaneiro já inclui a mercadoria |
| Valor aduaneiro documentado | Base de rateio (critério VALOR_ADUANEIRO) | Fonte: DI/DUIMP ou documento equivalente |
| Frete internacional | Despesa | Incorporável por padrão de política (DECISÃO-03), não por tipo fixo |
| Frete nacional | Despesa | Idem |
| Seguro | Despesa; **não** duplicar se já estiver no valor aduaneiro | Verificação de duplicidade obrigatória (ver 6.7) |
| Armazenagem, despacho, outras despesas | Despesa | Atribuição explícita |
| Descontos documentados | Redução da base do item ou do processo | Exige documento de origem |
| Tributos | Ver 6.5 | Status obrigatório |

### 6.3 Rateio

- **Critérios permitidos:** `VALOR_ADUANEIRO`, `PESO_LIQUIDO`, `PESO_BRUTO`, `VOLUME`, `QUANTIDADE_ESTOQUE`, `DIRETA`.
- **Obrigatórios:** critério explícito e justificativa textual não vazia. **Nunca** critério padrão silencioso.
- **Fórmula:** o rateio é feito na **escala intermediária (10)**, em unidades de `10⁻¹⁰`. Para despesa `D` e bases `b_i` (inteiros na escala de cada critério), `parte_i = floor(D × b_i / Σb)`; o resto `D − Σ parte_i` é distribuído uma unidade por vez aos itens de maior resto da divisão, com desempate por `item_id` ascendente (método de Hamilton). Resultado: `Σ parte_i = D` exatamente, sem resíduo de rateio.
- **Resíduo de persistência** é outra coisa: aparece só quando o valor de escala 10 é arredondado para a escala de persistência (4 casas no total, 6 no unitário). Esse resíduo é registrado (ver §6.4), nunca distribuído.
- Valores de referência para os casos estão em `fixtures/casos/` (ex.: `04-rateio-valor-aduaneiro-3-itens`, `21-rateio-peso-liquido`).
- **Base zero:** se `Σb = 0` para o critério, divergência `RATEIO_BASE_ZERO`. Não cai para outro critério.
- **Peso e volume ausentes:** divergência `RATEIO_DADO_AUSENTE`. Não usa zero.
- **Registro:** cada despesa gera linhas em `rateio_memoria` com `criterio`, `base_total`, `base_item`, `valor_alocado`, `residuo`, `justificativa`.

### 6.4 Precisão e resíduos

| Grandeza | Escala de cálculo | Escala de persistência | Arredondamento |
|---|---|---|---|
| Taxa de câmbio | 10 | 10 | Não arredonda |
| Valor em BRL do item | 10 | 4 | DECISÃO-06 |
| Custo total de item | 6 | 4 | DECISÃO-06 |
| Custo unitário | 6 | 6 | DECISÃO-06 |
| Quantidade de estoque | 3 | 3 | Não arredonda; fração exige unidade explícita |

**Resíduo unitário:** `Σ(custo_unitario × quantidade_estoque) ≠ custo_total_item` pela escala. A diferença é gravada em `CustoApurado.residuo_unitario` e entra no total de conservação. Nunca é descartada.

**Hoje:** `importacoes_nfe_itens.custo_unitario` e `produtos.preco_custo` são `numeric(10,2)` (A-06). Mudar a escala é uma migration à parte (Sprint 2), depois de DECISÃO-06.

### 6.5 Tributos no componente de custo

| Status do lançamento | Entra no custo? | Entra em crédito? | Observação |
|---|---|---|---|
| `NAO_RECUPERAVEL` | Sim, se `regra.incorpora_custo = true` | Não | Regra referenciada, nunca constante |
| `RECUPERAVEL_POTENCIAL` | Não | Não (memória) | Registrado como crédito potencial |
| `RECUPERAVEL_RECONHECIDO` | Não | Sim | Exige validação contábil (`validado_por`) |
| `GLOSADO` | Conforme `regra.incorpora_custo` | Não | Evento registrado |
| `NAO_APLICAVEL` | Não | Não | Com justificativa |
| `PENDENTE_VALIDACAO` | **Bloqueia** publicação | Não | Gera divergência `TRIBUTO_PENDENTE` |

**Regra:** nenhum status é inferido pelo motor. O motor só lê o status gravado e a regra referenciada (`03-MATRIZ-FISCAL.md`).

### 6.6 Publicação do custo

Opção recomendada (DECISÃO-01): o custo landed é publicado em **tabela própria** (`custo_importacao_publicado`) com referência à `VersaoCalculo`, e `produtos.preco_custo` passa a ser **proposta** que o gerente aceita. Assim, a regra atual de confirmação (`ssot_003:141-153`) continua válida enquanto a decisão não for tomada, e nenhum preço muda sem ação humana.

Alternativa: o custo landed sobrescreve `preco_custo` automaticamente. **Não recomendada** sem aprovação, porque mexe em margem e precificação de todas as vendas futuras.

### 6.7 Verificações de duplicidade

- **Seguro e frete no valor aduaneiro:** se o documento de valor aduaneiro já inclui o componente, a despesa correspondente vira `NAO_APLICAVEL` com justificativa. Não somar duas vezes.
- **Mercadoria na NF-e e na invoice:** só uma das duas entra como base de custo. A outra é referência de conciliação.
- **Mesma despesa em dois documentos:** identificada por `(tipo, valor, moeda, data, documento)`. Duplicidade gera divergência `DESPESA_DUPLICADA_SUSPEITA`.

### 6.8 Reprocessamento determinístico

- `input_hash = sha256(JSON canônico do input)`. Chaves ordenadas, números em string decimal, sem espaços.
- Mesmo `input_hash` + mesmo `engine_version` ⇒ mesmo output. Teste obrigatório (seção 04, T-DET-*).
- Mudança de `engine_version` ou de regra ⇒ nova versão de cálculo, nunca sobrescrita.
- Requer XML persistido (A-04) e documentos com hash (`DocumentoImportacao.hash_arquivo`).

---

## 7. Autorização

### 7.1 Papéis (ESPEC §5, adaptado)

| Papel | Ver processo | Ver custo landed | Criar/editar insumos | Calcular | Aprovar | Publicar |
|---|---|---|---|---|---|---|
| ADMIN (plataforma) | Não (D1, D9) | Não | Não | Não | Não | Não |
| DONO (empresa) | Sim, da empresa | Sim | Sim | Sim | Sim | Sim |
| GERENTE (loja/lojas do vínculo) | Sim, das lojas do vínculo | Sim | Sim | Sim | Não | Não |
| OPERADOR | Não | Não | Não | Não | Não | Não |
| Validador contábil (papel novo, DECISÃO-03) | Sim, da empresa | Sim | Não | Não | Sim | Não |

- OPERADOR já é bloqueado do custo pela proteção N1 (`20261009180001`). Import mantém a regra.
- **Até a ESPEC estar implementada** (DECISÃO-07): DONO e GERENTE usam as RPCs já existentes, com a limitação de A-08 documentada. Não criar uma autorização paralela.

### 7.2 Regras

- Toda RPC nova responde "qual é o tenant?" (D18). Sem tenant claro ⇒ negar.
- `loja_id` vindo do cliente seleciona, não autoriza (ESPEC §8, última linha).
- Escrita só por RPC `SECURITY DEFINER` com checagem explícita. Sem `INSERT`/`UPDATE` direto em tabelas de import.
- Leitura de custo landed exige papel de custo; a view deve ter `security_invoker` (ESPEC §7, views).

---

## 8. Multiempresa: o que pode ser construído isoladamente

| Funcionalidade | Pode ser construída antes da ESPEC? | Condição |
|---|---|---|
| Motor puro de landed cost (`shared-core`) | **Sim** | Sem I/O, sem tenant |
| Parser de NF-e com totais, tributos e zeros preservados | **Sim** | Só leitura de arquivo |
| Persistência do XML com hash | **Sim**, com RLS por loja hoje | Tenant = loja, como as demais tabelas de entrada |
| Tabelas de processo, despesa, tributo, versão (aditivas) | **Sim**, com `loja_id` e coluna `empresa_id` **nullable** | Migrar para `NOT NULL` quando ESPEC etapa 2 |
| Publicação em `preco_custo` | **Não** antes de DECISÃO-01 e de fp_pode_loja nas RPCs de entrada | ESPEC etapas 5 e 8 |
| Compartilhar custo com lojas de outro CNPJ | **Não** | ESPEC etapas 7–10 e isolamento A × B |
| Transferência de custo entre lojas do mesmo CNPJ | **Parcial** | Usar `custo_origem_id` como referência, sem recomputar no destino |

---

## 9. Limites entre importadora e lojas destinatárias

| Ator | Papel no processo | O que vê | O que não vê |
|---|---|---|---|
| **Empresa importadora** (CNPJ titular da DI) | Titular do processo; recolhe e registra tributos | Processo completo, tributos, despesas, custo landed | — |
| **Loja da mesma empresa** (filial) | Recebe mercadoria, pode ser destino de transferência | Custo landed publicado do processo | Tributos detalhados (DECISÃO-08) |
| **Loja de outro CNPJ do mesmo grupo** | Recebe mercadoria por transferência ou remessa | Custo unitário publicado (DECISÃO-08) | Tributos, despesas, DI |
| **Cliente atacadista independente** | Compra produto, não participa do processo | Preço de venda | Qualquer custo, tributo ou dado de outra empresa |

**Regra:** dado de importação nunca cruza CNPJ sem autorização explícita e registrada. Cliente independente nunca recebe custo.

---

## 10. Registro de decisões necessárias

| ID | Decisão | Por que importa | Recomendação de partida |
|---|---|---|---|
| **DECISÃO-01** | `preco_custo` recebe custo landed automaticamente, ou só por proposta aprovada? | Muda margem e preço de todas as vendas | Proposta aprovada; tabela própria de custo publicado |
| **DECISÃO-02** | Critério de rateio padrão por tipo de despesa, e quem define | Rateio arbitrário é proibido (missão, Etapa C) | Nenhum padrão automático; critério obrigatório por lançamento |
| **DECISÃO-03** | Quais tributos incorporam custo e quais são recuperáveis, por regime da empresa; papel validador | Não inventar regra tributária | Contabilidade define por regra com vigência; motor só lê |
| **DECISÃO-04** | Fonte e data de câmbio (DI, PTAX ou informado) | Taxa diferente muda custo | Informada e registrada com fonte; sem API na Fase 1 |
| **DECISÃO-05** | Tolerância de diferença entre soma das duplicatas e valor da nota | Afeta A-02 | Zero centavos na Fase 1, com exceção documentada |
| **DECISÃO-06** | Modo de arredondamento e escalas de persistência | Afeta A-06 | Escala 6 para unitário, 4 para total, arredondamento comercial a validar |
| **DECISÃO-07** | Operar com autorização atual (DONO/GERENTE globais) até a ESPEC? | Afeta A-08 | Sim, apenas com cliente único e documentado |
| **DECISÃO-08** | Lojas de outro CNPJ do mesmo grupo podem ver custo landed? | Afeta sigilo entre CNPJs | Não, até ESPEC completa |
| **DECISÃO-09** | Manter ou remover a regra `preço = custo × 1,5` na criação de produto (A-10) | Regra não documentada | Remover da criação de produto importado; manter legado até decisão |
| **DECISÃO-10** | Biblioteca decimal ou auxiliar próprio de inteiros escalados | Dependência nova | Auxiliar próprio pequeno, com testes |
| **DECISÃO-11** | NF-e de entrada vinculada a remessa exige duplicata? (hoje sim, para qualquer valor > 0) | Afeta fluxo de remessa com NF-e posterior | Confirmar que é intencional |
| **DECISÃO-12** | Retenção e armazenamento do XML original (volume e LGPD) | Afeta A-04 | Armazenar com hash; definir retenção |
| **DECISÃO-13** | Para OC sem remessa: exigir vínculo explícito de NF-e ou bloquear confirmação quando OC já recebida (A-05) | Evita estoque em dobro | Bloquear quando OC tem saldo recebido e NF-e não vinculada |
| **DECISÃO-14** | Modelo de contratação do módulo Import Intelligence por cliente. Requisito de produto: opcional por cliente e invisível nas lojas comuns | Hoje não há tabela de contratação; `feature_flags` é global e nenhuma tela a consulta (`07-MOTOR-CONTRATO-MINIMO.md` §12) | Tabela `modulos_contratados` por empresa, checada no servidor (opção A). Sequenciar com S5. Até lá, nenhuma rota, menu ou RPC do módulo |

---

## 11. Mudanças mínimas previstas (visão de arquitetura)

| Onde | O que muda | Quando |
|---|---|---|
| `shared-core/src/import/` | Tipos, motor puro, auxiliar decimal, política de rateio | Sprint 1a (motor isolado) |
| `pdv-importados/lib/nfe/nfeParser.ts` | Preservar zeros em `cProd`/`cEAN`; ler totais e tributos | Sprint 1b (separado, PR próprio) |
| `backend/supabase/migrations/` | Tabelas aditivas de processo; persistência de XML | Sprint 2 (após aprovação) |
| `backend/supabase/migrations/` | Escala de custo; ajuste de `ROUND` | Sprint 2 (DECISÃO-06) |
| `pdv-importados/app/…/importar-nfe/` | Adapter de leitura e tela de processo | Sprint 3 |
| `backend/supabase/migrations/` | Publicação de custo e revogação de caminho legado | Sprint 4 (DECISÃO-01) |

Nenhum arquivo de aplicação é alterado nesta sprint.
