# ADR-008 — Emenda 1: valoração do estoque e custo médio

| Campo | Valor |
|--------|--------|
| **ID** | ADR-008 · Emenda 1 |
| **Status** | **Proposta com decisões registradas em 2026-11-03** (D1, D2 aprovadas com condições, D5 e D7 aprovadas; D3 e D4 pendentes; D6 obrigatória antes de produção). Não aceita. Proposta técnica revisada: [../architecture/ADR-008-emenda-1-mapa-escritores-e-modo-sombra.md](../architecture/ADR-008-emenda-1-mapa-escritores-e-modo-sombra.md) |
| **Data** | 2026-11-03 |
| **Altera** | ADR-008 §1 (tabela "Não owns": "Valuation / custo médio de estoque — fora de escopo até missão explícita") e §4 (invariantes) |
| **Não altera** | ADR-007 (catálogo), ADR-CAIXA-002 (caixa), ADR-005/006 |
| **Relacionados** | [ADR-008](./ADR-008-inventory-domain-boundary.md), [ADR-007](./ADR-007-products-domain-boundary.md), [Import Intelligence, auditoria 22](../import-intelligence/22-AUDITORIA-IM-ETAPAS-1-4-2026-11-02.md), [SSOT aquisição/obrigação](../regras-negocio/SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md) |

---

## 1. Por que a emenda é necessária

- O módulo de importação (S4) precisa publicar um custo efetivo por produto. Hoje o único custo vigente é `produtos.preco_custo`, que recebe o custo unitário da NF-e (`confirmar_importacao_nfe`).
- `produtos.preco_custo_medio` existe e é lido pela UI, mas **nenhum escritor o grava** (busca em migrations e código, confirmada em 2026-11-03). A tela exibe 0 ou valor antigo como custo médio.
- O kardex (`movimentos_estoque_log`) registra só `quantidade_delta`. Não há valor nem custo unitário por movimento.
- ADR-008 deixa valoração **fora do escopo** até missão explícita. Esta emenda é essa missão. Sem ela, qualquer escrita em custo médio viola o ADR.
- O escritor canônico de estoque são as RPCs existentes (porta `InventoryMovementWriter`, `shared-core/src/inventory/contracts.ts`). **Não existe** `estoque_aplicar_movimento`. Ele é uma proposta da auditoria, não uma realidade do código.

## 2. Proposta (recomendada, sujeita à decisão do §5)

### 2.1 Dono

- **Inventory** é dono da **valoração derivada do saldo**: `custo_unitario` por movimento e `custo_medio` por `(loja_id, produto_id)`.
- **Products** continua dono do cadastro e do `preco_custo` como custo **vigente publicado**. `preco_custo` deixa de ser calculado pela NF-e e passa a ser publicado pelo fluxo de custo (S4).
- O custo médio é **derivado**. Nenhuma tela, adapter ou função de import grava `custo_medio` diretamente. Só o escritor canônico grava, na mesma transação do movimento.

### 2.2 Regra de cálculo

Média ponderada móvel por `(loja_id, produto_id)`:

```
entrada: custo_medio_novo = (saldo_anterior × custo_medio_anterior + qtd_entrada × custo_entrada) / (saldo_anterior + qtd_entrada)
saída:   custo_medio inalterado; movimento grava custo_unitario = custo_medio vigente no instante (snapshot)
```

- Arredondamento: escala 6 no unitário, HALF_UP, valores em `numeric` (nunca `float`). O motor de arredondamento já existente em `shared-core/src/import/decimal.ts` é a referência.
- Saldo zero ou negativo na entrada: o `custo_medio` anterior não é válido. A entrada assume o custo de entrada e o movimento recebe `custo_medio_origem = 'REINICIO'`.
- Ajustes manuais (`ajustar_estoque_manual`): entrada usa o custo informado com motivo obrigatório; saída usa o custo médio vigente.

### 2.3 Escrita

- Toda mutação de saldo que altera valor passa pelas RPCs canônicas, dentro da mesma transação (`FOR UPDATE` em `estoque`).
- Invariante **I6 (nova)**: toda linha de `movimentos_estoque_log` com delta ≠ 0 registra `custo_unitario` e `valor_total`, ou `custo_indisponivel = true` com motivo. Nunca valor zero silencioso.
- Histórico não é reescrito (I3). Movimentos anteriores à data de corte ficam com `custo_indisponivel = true`. Não se inventa custo retroativo.

### 2.4 Custo de entrada

| Origem | Custo usado na média | Observação |
|---|---|---|
| NF-e confirmada | custo unitário da NF-e (estimado) | Hoje é o único. Rotulado como estimado até S4 |
| Publicação de apuração landed (S4) | custo efetivo aprovado | Substitui o estimado na média a partir da publicação |
| Ajuste manual | valor informado | Motivo obrigatório |
| Transferência | custo médio da loja de origem | Preserva valor entre lojas |

### 2.5 Escopo de impacto (cross-domínio)

Cada RPC que move saldo precisa gravar o custo do movimento:

- inventory-led: `ajustar_estoque_manual`, `confirmar_remessa_entrada`, `transferir_estoque_seguro`, `importar_nfe_transacao` / `confirmar_importacao_nfe`;
- sales-led (orquestrador de venda): `finalizar_venda_transacional_canonica_v4` → `decrementar_estoque_seguro`, e reposições de `cancelar_venda_transacional` / `devolver_ou_trocar_venda`.

Para vendas, a emenda **não** muda a autoridade de sales. O sales continua solicitando baixa, e o inventory calcula o `custo_unitario` dentro da RPC que já executa a baixa. Não há escrita de sales em valor de estoque.

## 3. Alternativas

| Alternativa | Prós | Contras | Veredito |
|---|---|---|---|
| **A. Manter fora de escopo** (ADR-008 como está) | Nenhum risco novo agora | Custo médio continua 0 na UI; S4 publica custo sem média; margem histórica usa custo atual (A-18) | Aceitável só se a UI parar de exibir custo médio |
| **B. Inventory dono da valoração derivada** (proposta) | Um escritor canônico; média calculada na mesma transação do saldo | Toca todas as RPCs de movimento; exige migração com modo sombra | **Recomendada** |
| **C. Products dono do custo médio** | Parece natural (cadastro de custo) | Products precisaria ler movimentos e saldo de inventory: aresta de leitura nova e risco de divergência; viola I4 se houver escrita cruzada | Rejeitada |
| **D. Valoração em serviço separado (fora de inventory e products)** | Isolamento | Novo domínio sem ADR; fonte de verdade duplicada com o kardex | Rejeitada |

## 4. Riscos

- **Blast radius:** todas as RPCs de movimento mudam. Mitigação: modo sombra (calcula e compara com o valor atual sem gravar), regressão por escritor e rollback por migration.
- **Vendas antigas sem custo:** margem histórica muda de base. Mitigação: `custo_indisponivel` explícito, nunca zero silencioso.
- **Concorrência:** duas entradas simultâneas alteram a média. Mitigação: `FOR UPDATE` em `estoque` já existente, e teste de concorrência.
- **Divergência entre custo NF-e e custo landed:** precedência explícita no §2.4 e teste de conservação.
- **Aspecto contábil e fiscal:** média ponderada móvel é um critério de valoração que precisa de validação do contador antes de uso em apuração de tributos. Esta emenda não afirma que o método atende a nenhuma obrigação fiscal.

## 5. Decisões necessárias (humanas)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Inventory é dono da valoração derivada (alternativa B)? | Sim |
| D2 | Custo médio é por loja ou por empresa? | Por loja (já é a regra D1 do backlog) |
| D3 | Precedência de custo na média: NF-e estimado vs landed efetivo | Landed efetivo quando publicado; NF-e até então, com rótulo |
| D4 | Movimentos antigos sem custo: data de corte e tratamento | Corte na implantação, `custo_indisponivel` antes |
| D5 | Vendas gravam `custo_unitario` no movimento de saída? | Sim, snapshot da média vigente, para margem histórica correta |
| D6 | Validação contábil do método (média ponderada móvel) | Obrigatória com o contador antes de produção |
| D7 | Antes de qualquer migration: modo sombra por no mínimo N dias | Sim |

## 6. Efeito sobre o plano

- S5 (custo médio) passa a depender desta emenda aceita. Sem ela, S5 não começa.
- S4 pode começar com `preco_custo` e sem média, desde que a UI pare de exibir `preco_custo_medio` como custo real. Isso depende de decisão separada.
- Nenhuma escrita em `preco_custo_medio` é permitida antes da aceitação desta emenda.

## 7. Decisão sobre `produtos.preco_custo_medio` (2026-11-03)

Retirar o campo como informação oficial na interface; bloquear novas gravações; substituir as consultas por `estoque.custo_medio` respeitando empresa e loja; manter a coluna marcada como legada até comprovar a ausência de consumidores. Plano em seis fases e critérios de remoção em [ADR-008-emenda-1-transicao-preco-custo-medio.md](../architecture/ADR-008-emenda-1-transicao-preco-custo-medio.md). A troca de consultas depende da criação de `estoque.custo_medio` (fase 2).

## 8. Status

- **Não aceita.** Este documento é proposta. Nenhum código, migration ou alteração de ADR aceito foi feita.
- Para aceitar: registrar as decisões D1–D7 na seção 5 e mudar o status para "Aceito".
