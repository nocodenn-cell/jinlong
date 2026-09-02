# Prontidão Focus NFe — Fase C / Onda C2.6: Modelagem mínima de `icms_origem`

**Data:** 2026-09-02
**Escopo autorizado:** modelagem representacional de `icms_origem` (schema + snapshot fiscal + cadastro UI + fail-closed no boundary de emissão). Sem motor tributário, sem cálculo de ICMS/aliquota, sem novo default, sem auto-preenchimento, sem PIX/XML/webhook/CC-e/cancelamento, sem início de C3, sem aplicação em produção.

---

## MIGRATION

**PASS.** Quatro migrations novas, todas aplicadas para real contra o Postgres local efêmero (`supabase_db_fastproduct`, mesmo ambiente do Gate C1.5), cada uma com bloco `DO $verify$` que falha a transação se o efeito pretendido não estiver presente:

| Migration | Efeito |
|---|---|
| `20260902140000_produtos_icms_origem.sql` | `produtos.icms_origem text` — nullable, **sem default**, `CHECK (icms_origem IS NULL OR icms_origem IN ('0'..'8'))`, índice parcial `idx_produtos_sem_icms_origem`, comentário SQL distinguindo explicitamente de `produtos.origem` |
| `20260902140100_criar_produto_icms_origem.sql` | `criar_produto_com_estoque_inicial` (RPC 270) — `icms_origem` adicionado ao `INSERT`, mesma extração `NULLIF(BTRIM(...), '')` dos demais campos fiscais opcionais |
| `20260902140200_atualizar_produto_icms_origem.sql` | `atualizar_produto_com_faixa_atacado` — `icms_origem` adicionado ao `SET` condicional (`CASE WHEN p_payload ? 'icms_origem'`), mesmo padrão de `cst_pis`/`cst_cofins` |
| `20260902140300_fiscal_payload_snapshot_icms_origem.sql` | `finalizar_venda_transacional_canonica_v4_unscoped` (PASSO 9) — `icms_origem` adicionado ao `jsonb_build_object` de cada item do snapshot fiscal |

Execução real confirmada (não estática):
```
=== 20260902140000_produtos_icms_origem.sql ===   BEGIN ... COMMIT (exit 0)
=== 20260902140100_criar_produto_icms_origem.sql ===  BEGIN ... COMMIT (exit 0)
=== 20260902140200_atualizar_produto_icms_origem.sql === BEGIN ... COMMIT (exit 0)
=== 20260902140300_fiscal_payload_snapshot_icms_origem.sql === BEGIN ... COMMIT (exit 0)
```
Todos os 4 blocos `$verify$` passaram (nenhum `RAISE EXCEPTION` disparado) — incluindo a prova viva no `psql` de que o `CHECK` aceita `NULL`+`'0'..'8'` e rejeita `'9'`.

`produtos.origem` **não foi tocado**: nenhuma das 4 migrations contém `ALTER`/`UPDATE`/`DROP` sobre essa coluna; o `$verify$` da migration de schema confirma explicitamente que a constraint de `origem` continua presente e inalterada.

Achado adicional durante a implementação (não estava no plano original, descoberto ao rastrear a cadeia completa até o banco): tanto o `INSERT` de `criar_produto_com_estoque_inicial` quanto o `UPDATE` de `atualizar_produto_com_faixa_atacado` têm lista de colunas **explícita** (não populam dinamicamente a partir do payload) — sem as migrations 140100/140200, a coluna existiria no schema mas o cadastro via UI **nunca conseguiria gravar um valor nela**, apesar do formulário enviar o campo corretamente. As duas migrations adicionais fecham esse gap.

## SCHEMA

**PASS.** `icms_origem text NULL`, sem default, `CHECK IN ('0'..'8')`, comentário SQL distinguindo de `origem`. Nenhuma migration de dados: nenhum `UPDATE` roda sobre linhas existentes — produtos legados ficam `NULL` até classificação humana, exatamente como `ncm`/`cest`.

## UI

**PASS.** Novo `<select>` em `FiscalSection.tsx` (mesma seção `<details>` fiscal já existente, sem redesign), com opção "— não classificado —" (valor vazio → `NULL`) + os 9 códigos oficiais SEFAZ com descrição (0 Nacional, 1/2/6/7 Estrangeira variantes, 3/5/8 Nacional por % de conteúdo importado, 4 Nacional produção básica). Nenhuma opção pré-selecionada por default; nenhuma lógica de auto-inferência a partir de `origem`, país ou canal de aquisição.

Cadeia completa verificada e conectada (13 arquivos, todos com `tsc --noEmit` limpo):
`FiscalSection.tsx` → `ProdutoFormContext`/`useProdutoForm.ts` (estado/setter/snapshot/reset em todos os pontos: hidratação, "salvar e continuar", dirty-check) → `produtoForm.types.ts` → `ProdutoForm.tsx` → `ProdutoFormModal.tsx` → `produtoForm.mappers.ts` (`buildSubmitPayload`) → `produtoFormSchema.ts` (Zod `.refine` para `'0'..'8'`) → `productFormMappers.ts` → `shared-core/src/products/types.ts` (`ProductCatalogWriteFields` + `ProductListFilteredRow`) → `productWriter.ts`/`productUpdater.ts`/`productReader.ts`/`productListMappers.ts` → `core/ports/produto.ts` (`NovoProdutoInput`) → `criarProdutoComEstoqueInicialRpc.ts` → RPC 270 (migration 140100). Caminho de importação CSV (`gerente/produtos/actions.ts`: `IMPORT_MERGE_COLS` + `atualizarProdutoViaImportRow`) também estendido. i18n: `field_icms_origem`/`hint_icms_origem` adicionados a `pt.json` e `zh.json`.

**Achado fora de escopo, não corrigido (regressão pré-existente, não introduzida nesta onda):** a RPC `list_produtos_gerente_filtrados` (usada pela listagem/edição do painel gerente) **não devolve nenhum campo fiscal** no `RETURNS TABLE` — nem `ncm`/`csosn`/`cst_pis`/`cst_cofins` já existentes, nem o novo `icms_origem`. Confirmado por leitura direta do `pg_get_function_result` no banco local. Isso significa que hoje, ao reabrir um produto para edição a partir da lista, os campos fiscais chegam como `null` independentemente do que está gravado — um gap que já existia antes desta onda para os 5 campos fiscais anteriores e que `icms_origem` apenas herda por paridade de tipo (`RpcProdutoFilteredRow`/`mapFilteredRow` estendidos com o mesmo padrão dos campos irmãos, documentado em comentário no código). Corrigir essa RPC está fora do escopo autorizado desta onda ("não expandir escopo").

## SNAPSHOT WEB

**PASS.** `finalizar_venda_transacional_canonica_v4_unscoped` (via `finalizar_venda_transacional_canonica_v4`, confirmado wrapper fino que delega ao `_unscoped`) inclui `icms_origem` em cada item do payload congelado em `documentos_fiscais_pendentes.payload`. Prova real: `vendaConsistency.integration.test.ts` (extensão do teste de imutabilidade já existente) rodou contra Postgres local real e confirmou `itemAntes?.icms_origem === '1'`.

## SNAPSHOT SYNC

**PASS.** `fiscal_enqueue_after_venda_sync.ts` (caminho pdv-local → sync-outbox) estendido: `ProdutoFiscalRow` inclui `icms_origem`; o `SELECT` a `produtos` busca a coluna; o item mapeado no payload inclui `icms_origem: p?.icms_origem ?? null`. Simétrico ao caminho web. Teste Deno estendido e executado via container: `itens[0].icms_origem === "1"`.

## IMMUTABILITY

**PASS.** Extensão do teste real (`vendaConsistency.integration.test.ts`) que já provava imutabilidade para `ncm`/`cfop`/`csosn`: produto é criado com `icms_origem = '1'`, venda é fechada, o snapshot congela `'1'`; o produto é então mutado para `icms_origem = '2'`; o documento fiscal já persistido continua mostrando `'1'` — a mutação posterior do cadastro não retroage ao documento já enfileirado. Rodado contra Postgres real (não mock).

## FAIL-CLOSED FISCAL

**PASS.** `fiscal_focus_dto.ts` (`mapSnapshotItemToFocus`) — `icms_origem` promovido a campo obrigatório do item, mesmo mecanismo já usado para NCM ausente: item com `icms_origem` ausente ou fora de `'0'..'8'` **bloqueia o item inteiro** (`item: null`), com gap explícito reportando o motivo exato (não classificado vs. valor fora do domínio confirmado). Item com `icms_origem` válido é mapeado sem bloqueio, valor propagado literalmente (sem transformação). O mapeador **nunca lê `produtos.origem`** — teste dedicado prova que um item com `origem: 'china_manual'` mas `icms_origem: null` continua bloqueado, não usa `origem` como fallback.

Este boundary é estritamente de **representação/preflight** (construção do envelope Focus) — não afeta cadastro, estoque, venda ou PDV: nenhum desses fluxos chama `fiscal_focus_dto.ts`. Confirmado pelo item REGRESSÃO VENDA abaixo.

## REGRESSÃO VENDA

**PASS.** Produto sem `icms_origem` (`NULL`, comportamento padrão de todo produto legado) continua normalmente cadastrável, editável, vendável e enfileirável no fiscal-worker — nenhum desses caminhos referencia `icms_origem` fora do payload JSON opcional. Confirmado por:
- 192/192 testes em `app/caixa` (excluindo integration) — nenhuma regressão na venda.
- 99/99 testes em `app/admin/produtos` + `app/gerente/produtos`.
- 88/88 testes em `components/gerente/produtos` (formulário completo, incluindo fluxos de criar/editar/duplicar/importar).
- `vendaConsistência.integration.test.ts`: 4/4 testes reais contra Postgres, incluindo o cenário de venda completa com produto SEM classificação fiscal alguma (teste pré-existente, não tocado, continua passando).

## TESTES

**PASS** (executados de verdade, não estáticos):

| Suíte | Resultado |
|---|---|
| `fiscal-worker` (Deno, container `denoland/deno:latest`) | **57/57** — 53 pré-existentes + 4 novos (`icms_origem` ausente/inválido/válido×9/não-deriva-de-origem) |
| `sync-outbox/fiscal_enqueue_after_venda_sync.test.ts` (Deno) | **2/2** — estendido com `icms_origem` |
| `vendaConsistency.integration.test.ts` (vitest, Postgres real local) | **4/4** — imutabilidade estendida para `icms_origem` |
| `app/admin/produtos` + `app/gerente/produtos` (vitest) | **99/99** |
| `components/gerente/produtos` (vitest) | **88/88** |
| `app/caixa` (vitest, exclui integration) | **192/192** |
| `tsc --noEmit` (projeto inteiro `pdv-importados`) | limpo, 0 erros |
| `deno check` (`fiscal_focus_dto.ts`) | limpo |

Cenários explicitamente cobertos, cruzando com a lista pedida: aceita `'0'..'8'` (teste dedicado, todos os 9 valores); rejeita inválido (CHECK no banco + `.refine` no Zod + boundary DTO, 3 camadas); `NULL` permitido (schema + UI "— não classificado —"); sem default (verificado no `$verify$` da migration); `produtos.origem` independente (constraint intacta + teste "nunca deriva de origem"); snapshot web e sync capturam (2 testes reais); edição posterior de produto não altera snapshot já emitido (teste de imutabilidade real); produto sem classificação continua vendável com fiscal automático desligado (192 testes de venda passando); boundary rejeita item sem `icms_origem` na tentativa de emissão (2 testes DTO dedicados).

---

## C2.6 GATE: PASS
