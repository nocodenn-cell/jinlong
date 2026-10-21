# 16 — Fase 2: precisão de custo dos campos legados

Status: **preparada, medida e testada em banco local. GATE F2 BLOQUEADO para ativação.** A migration está em `backend/supabase/pendentes/`, fora de `supabase/migrations/`, e não entra em nenhum deploy.

Conforme a decisão arquitetural adicional, este bloqueio **não** impede a persistência própria do Import Intelligence (Fase 4). Ela usa tabelas e escalas próprias.

## 1. Inventário

| Campo | Tipo atual | Consumidores no banco | Mexe na F2? |
|---|---|---|---|
| `produtos.preco_custo` | numeric(10,2) | view `produtos_custos`; trigger `trg_produtos_margem_bu` (WHEN); 16 funções (margem, relatórios, NF-e, venda, comissão, painéis) | sim |
| `produtos.preco_custo_medio` | numeric(10,2) | view `produtos_custos` | sim |
| `importacoes_nfe_itens.custo_unitario` | numeric(10,2) | `importar_nfe_transacao`, `confirmar_importacao_nfe` | sim |
| `itens_venda.custo_unitario_snap` | numeric(10,2) | snapshot de venda (margem e comissão) | **não**: histórico de vendas, tabela grande, necessidade não demonstrada |

Arredondamentos prematuros encontrados:
- `trg_fn_precos_atacado_margem` e `trg_fn_regras_preco_margem` guardavam o custo em variável `numeric(10,2)` antes de comparar. A F2 corrige: com custo 0,0345, um atacado de 0,034 passava como se o custo fosse 0,03.
- `importar_nfe_transacao` grava `ROUND(v_custo_unit, 2)`. Isso fica para a etapa de ativação.
- `relatorio_produtos_sem_giro_periodo` arredonda o valor imobilizado para 2 casas. Correto: é saída monetária.

O histórico de preços (`historico_precos_produto`) já usa `numeric` sem escala e não precisa mudar.

Consumidores TypeScript (32 arquivos de produção):
- **Produto:** `app/admin/produtos/*` (reader, writer, updater, mappers), `components/gerente/produtos/**` (formulários, margem, preços, histórico), `app/gerente/produtos/*`, `lib/gerente/produtos/*`.
- **Caixa e vendas:** `caixaConsultaRapida`, `caixaPrecoAutoritativoServer`, `caixaVendas`, `vendaDetalheTypes`, `VendaDetailSheet`, `admin/vendas/actions`.
- **NF-e:** `importar-nfe/{actions, ImportarNfePageClient}`.
- **Relatórios:** `relatorios/sem-giro`.
- **Adapters:** gtin, `criarProdutoComEstoqueInicialRpc`.

Nenhum consumidor no `pdv-local` nem nas edge functions.

## 2. A migration (etapa EXPAND)

Arquivo `pendentes/20261010140000_f2_custo_escala_6.sql`:
- `lock_timeout = 5s`;
- remove a view e o trigger que bloqueiam `ALTER TYPE`;
- amplia os 3 campos para `numeric(14,6)`;
- recria a view (com a cerca da F1, grants idênticos) e o trigger (mesmo WHEN);
- corrige as duas funções de margem.

Não muda nenhum gravador nem preço de venda.

## 3. Medição (banco local descartável, PostgreSQL 17)

| Medida | Resultado |
|---|---|
| Volume | 50.015 produtos (33 MB) e 50.000 itens de NF-e |
| Tempo da transação (reescrita das duas tabelas sob ACCESS EXCLUSIVE) | **≈ 2,0 s** |
| Preservação dos valores | checksum md5 linha a linha igual antes e depois; 0 valores alterados |
| Transação concorrente segurando `produtos` | a F2 falha em ≈ 5,7 s por `lock_timeout`, **sem alterar nada** (tipo continua 10,2) |

Em produção, o tempo escala com o tamanho real das duas tabelas. Medir em um clone autorizado antes, e aplicar em janela de baixo movimento: o caixa grava em `produtos` (custo médio e estoque) e esperaria até 2 s.

## 4. Por que o gate está bloqueado

A ampliação muda o que a coluna aceita. Hoje todo gravador já entrega 2 casas, mas:

1. Qualquer gravador que envie mais casas (importação de catálogo, API, `criar_produto_com_estoque_inicial`) passaria a gravar 4–6 casas.
2. O formulário de produto (`useMoneyInput`, `PrecosSection`, `produtoForm.mappers`) trabalha com 2 casas. Abrir e salvar o produto por outro motivo pode **arredondar o custo em silêncio**, o que viola "não arredondar prematuramente" e "não modificar silenciosamente".
3. As telas de margem e de NF-e exibem o custo em 2 casas.

**Etapa de ativação**, que exige autorização na próxima rodada:
- campo de custo com até 6 casas no formulário, preservando o valor quando o usuário não o edita;
- exibição de até 6 casas no custo unitário (memória de cálculo);
- `importar_nfe_transacao` sem `ROUND(…, 2)` no custo;
- testes de ida e volta (ler, editar outro campo, salvar: custo intacto) nos 32 consumidores.

Só então a F2 entra em `supabase/migrations/`.

## 5. Testes

| Teste | Resultado |
|---|---|
| `pendentes/f2-custo-escala-6.test.sql` | 6/6 OK: tipos; histórico de vendas intocado; view, grants e trigger; 0,0345 e 0,005 sem perda; atacado abaixo do custo exato recusado; margem de varejo ativa; gravador de NF-e inalterado |
| Regressão (45 scripts) com F2 aplicada | 33 PASS / 12 FAIL, idênticas ao baseline |
| F1 (35), M1 (29), C1 com F2 aplicada | OK |
| Rollback sem valores de 6 casas | schema idêntico ao F1 |
| Rollback com um valor de 6 casas | **aborta** (`F2_ROLLBACK_PERDERIA_PRECISAO`) sem perda |

## 6. Gate F2

- Precisão preservada: **sim**.
- Regressões financeiras: **aprovadas** (suíte idêntica).
- Reversão documentada e testada: **sim**.
- Risco operacional resolvido: **não** (§4).

**Gate F2 = BLOQUEADO para ativação.** A Fase 4 não depende dele.
