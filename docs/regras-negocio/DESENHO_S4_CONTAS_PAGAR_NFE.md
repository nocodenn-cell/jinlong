# S4 — Contas a pagar da NF-e: unicidade e conciliação (desenho)

| Campo | Valor |
|---|---|
| Status | **Desenho para aprovação. Nenhuma migration escrita.** |
| Decisões | D3 (tolerância de R$ 0,01 após identificar o valor conciliável), D4 (obrigações por credor e documento, sem duplicar AP existente) |
| Base | Consultas de leitura em produção em 2026-10-29 (projeto `kbabmewnahysfvlybiak`) |

## 1. Estado atual (produção, leitura)

- `contas_pagar`: 9 registros, **todos** com `nfe_importacao_id` preenchido, de 6 NF-es. Nenhum sem origem NF-e.
- Duplicidade: **nenhum** grupo com mesmo `(nfe_importacao_id, vencimento, valor_total)`.
- Conciliação: em **todas** as 6 NF-es, `soma(importacoes_nfe_duplicatas.valor) = soma(quantidade_conferida × custo_unitario) = soma(contas_pagar.valor_total)`. Diferença zero.
- Coluna `contas_pagar.parcela` existe mas está **nula** em todos os registros.
- `importacoes_nfe_duplicatas` tem `numero_duplicata` (texto, pode ser nulo), `data_vencimento`, `valor` e a chave `importacao_nfe_id`.

## 2. Problema

A confirmação (`internal.confirmar_importacao_nfe`) cria uma AP por duplicata, mas:

1. **A AP não guarda a identidade da duplicata.** Não há ligação com a linha de `importacoes_nfe_duplicatas`, nem `numero_duplicata` nem `parcela`. Sem isso não existe chave única possível. O plano original previa UNIQUE por `(nfe_importacao_id, numero_duplicata)`, mas essa coluna não existe em `contas_pagar`.
2. **A proteção contra AP duplicada é só o status da NF-e** (`EM_CONFERENCIA → CONCLUIDA`). Ela funciona para a confirmação, mas não cobre qualquer outro caminho que venha a inserir AP para a mesma NF-e.
3. **Não há conciliação explícita** entre a soma das duplicatas e o valor econômico conferido. A confirmação só bloqueia `valor econômico > 0` sem duplicatas (SSOT-003). Duplicatas com soma diferente do valor econômico passam em silêncio.

## 3. Proposta

### 3.1 Identidade da AP (migration aditiva)

- Nova coluna `contas_pagar.origem_duplicata_id uuid NULL REFERENCES importacoes_nfe_duplicatas(id)`.
- `UNIQUE (origem_duplicata_id) WHERE origem_duplicata_id IS NOT NULL` (índice parcial).
- A confirmação passa a gravar `origem_duplicata_id` ao criar cada AP. A chave é a linha da duplicata (estável e única), não o número.
- APs existentes (9 em produção) ficam com `origem_duplicata_id` nulo. **Sem backfill automático**: a associação por ordem ou por valor seria ambígua. Se a operação quiser vincular o histórico, é um mapeamento manual à parte.

### 3.2 Conciliação na confirmação

- Antes de criar as APs, calcular `valor_conciliavel` e `soma_duplicatas`.
- Se `|soma_duplicatas − valor_conciliavel| > tolerância`, falhar com `IMPORT_NFE_DUPLICATA_DIVERGENTE`, sem criar AP e sem concluir a NF-e.
- **Tolerância: R$ 0,01** (D3).
- Ver a decisão D3 abaixo sobre a base do `valor_conciliavel`.

### 3.3 Retry e concorrência

- A UNIQUE torna a segunda inserção de uma mesma duplicata impossível, mesmo se o status falhar.
- A confirmação continua com `FOR UPDATE` na NF-e.

### 3.4 Sem mudança de comportamento para casos sem duplicata

- NF-e sem duplicata e com valor econômico zero continua permitida (SSOT-003).
- NF-e com valor econômico > 0 e sem duplicata continua bloqueada (`IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`).

## 4. Decisões pendentes

1. **Base da conciliação (D3):**
   - (a) valor econômico dos itens conferidos (`quantidade_conferida × custo_unitario`): é o que a própria confirmação já usa. **Recomendado** por ser o único valor que o sistema calcula.
   - (b) valor total da NF-e (`vNF`): o sistema **não armazena** esse valor hoje. Seria preciso guardá-lo na importação, o que é outra mudança.
   Com (a), a conciliação confere a consistência entre duplicatas e itens, não contra o documento fiscal. Validar com a contabilidade.
2. **Recebimento parcial:** se a operação confirmar só parte da NF-e, a soma das duplicatas deve ser comparada com o conferido (proposta: sim, por (a)). Confirmar.
3. **Backfill de histórico:** manter nulo (proposta) ou mapear manualmente as 9 APs existentes às duplicatas.

## 5. Testes de regressão (antes da migration)

| # | Cenário | Esperado |
|---|---|---|
| S4-T1 | NF-e com 2 duplicatas que batem com o valor econômico | 2 APs, cada uma com `origem_duplicata_id` |
| S4-T2 | Mesma NF-e confirmada de novo | Erro de status; nenhuma AP nova |
| S4-T3 | Duplicatas com soma diferente do valor econômico em mais de R$ 0,01 | `IMPORT_NFE_DUPLICATA_DIVERGENTE`; nenhuma AP; NF-e segue `EM_CONFERENCIA` |
| S4-T4 | Diferença de R$ 0,01 | Aceita |
| S4-T5 | NF-e sem duplicata e valor econômico zero | Confirma (regressão SSOT-003) |
| S4-T6 | NF-e sem duplicata e valor econômico > 0 | Bloqueia (regressão SSOT-003) |
| S4-T7 | Duas inserções concorrentes da mesma duplicata | Uma sucesso, uma erro de UNIQUE |
| S4-T8 | APs existentes (sem `origem_duplicata_id`) | Continuam válidas e pagáveis |
| S4-T9 | Pagamento de AP vinculada | Não muda (regressão do fluxo de pagamento) |
| S4-T10 | Recebimento parcial com duplicatas proporcionais | Conforme decisão 2 |

## 6. Riscos

- **Produção hoje:** sem duplicidade e sem divergência. A migration é aditiva e não altera APs existentes. Risco baixo.
- **Falha na conciliação de NF-es em andamento:** NF-e já com duplicata divergente em `EM_CONFERENCIA` passaria a falhar na confirmação. Não existe caso assim hoje (todas estão `CONCLUIDA`), mas a consulta deve ser repetida antes da janela.
- **Conciliação pela base (a) não prova o documento fiscal.** É uma checagem interna de consistência, não uma conferência contra a NF-e.

## 7. Próximos passos

1. Aprovar o desenho e as decisões 1 a 3.
2. Escrever a migration: coluna, índice parcial, alteração de `internal.confirmar_importacao_nfe` (gravar origem e conciliar).
3. Testes S4-T1 a S4-T10 em homologação, com rollback validado.
4. Plano de aplicação em produção, nos mesmos moldes dos planos da S1 e da S2.
