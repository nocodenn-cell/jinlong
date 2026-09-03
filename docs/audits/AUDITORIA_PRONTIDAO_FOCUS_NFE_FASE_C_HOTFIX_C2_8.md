# Prontidão Focus NFe — Fase C / Hotfix C2.8: Preservação dos campos fiscais na edição

**Data:** 2026-09-02
**Escopo autorizado:** corrigir SOMENTE a causa raiz do P0 achado no Gate C2.7 (`list_produtos_gerente_filtrados` sem campos fiscais → edição apaga classificação fiscal real). Sem tributação Focus, sem PIX, sem XML, sem C3, sem dados reais de produto, sem webhook/cancelamento/CC-e, sem produção.

---

## RPC: PASS

Confirmado empiricamente **antes** de escrever a migration que `CREATE OR REPLACE FUNCTION` não permite adicionar colunas a um `RETURNS TABLE` existente — testado contra este mesmo banco, dentro de uma transação revertida:
```
ERROR:  cannot change return type of existing function
DETAIL:  Row type defined by OUT parameters is different.
HINT:  Use DROP FUNCTION list_produtos_gerente_filtrados(...) first.
```
Migration `20260902150000_list_produtos_gerente_filtrados_campos_fiscais.sql` usa `DROP FUNCTION` + `CREATE FUNCTION` (não `CREATE OR REPLACE`), preservando explicitamente e confirmado via `pg_proc`/`pg_get_function_result` **após** a aplicação real:

| Propriedade | Antes | Depois |
|---|---|---|
| Owner | `postgres` | `postgres` (inalterado) |
| `prosecdef` (SECURITY) | `false` (INVOKER) | `false` (INVOKER, inalterado) |
| `search_path` | `public, pg_catalog` | `public, pg_catalog` (inalterado) |
| `proacl` (GRANT) | `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` | idêntico, byte-for-byte |
| `RETURNS TABLE` | 17 colunas, nenhuma fiscal | 24 colunas — as 17 originais + `ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem` |
| Dependentes (`pg_depend`) | 0 objetos | 0 objetos (confirmado antes do DROP — seguro sem CASCADE) |

Único trecho de lógica alterado: a lista de colunas selecionadas/devolvidas (CTE `base`/`numbered` + `SELECT` final). Todo o resto do corpo — filtros de tenant/situação/origem/nf/estoque/imagens/tags/categoria/marca/fornecedor/busca, paginação, `total_count` via window function — copiado verbatim, sem mudança de comportamento.

## HYDRATION: PASS

Prova real (teste 1 do arquivo de integração TypeScript, contra Postgres local, via `createProductReader(gerente).listComFiltros(...)` — o adapter real, não uma simulação): produto criado com 7 valores fiscais distintos e conhecidos → RPC devolve exatamente esses 7 valores, sem nenhuma transformação/perda. Nenhum mapper TypeScript precisou de alteração — `RpcProdutoFilteredRow`/`mapFilteredRow`/`mapListRowToGerente` já esperavam essas colunas desde a Onda C2.6 (ficavam "fantasma" só por a RPC nunca as devolver).

## EDIT PRESERVATION: PASS

**Teste principal** (teste 3 do arquivo de integração, `TESTE PRINCIPAL — editar SOMENTE o nome preserva todos os campos fiscais no banco`), executado de ponta a ponta contra Postgres real, através do código de produção (não reimplementado no teste):

1. Produto criado com 7 valores fiscais distintos.
2. Hidratado exatamente como a tela `/admin/catalogo` hidrata o modal de edição: `listComFiltros` → `mapListRowToGerente` (mesmo caminho de `CatalogoTable.tsx`/`buscarProdutosComFiltros`).
3. Payload de update montado a partir do estado hidratado, alterando **somente** `nome` — nenhum campo fiscal tocado pelo operador simulado.
4. `createProductUpdater(gerente).update(...)` chamado com uma sessão JWT real (usuário GERENTE semeado, mesma loja de `vendaConsistency.integration.test.ts`) — o mesmo adapter/RPC (`atualizar_produto_com_faixa_atacado`) que a UI usa.
5. Leitura direta no banco (não pelos mesmos mappers testados) confirma: `nome` mudou; `ncm`/`cfop_produto`/`csosn`/`cest`/`cst_pis`/`cst_cofins`/`icms_origem` continuam **byte-for-byte idênticos** ao valor original.

Nenhum `COALESCE`/default/valor inventado foi adicionado em qualquer camada — o fix é estritamente "devolver o que já está na coluna".

## NULL PRESERVATION: PASS

Dois testes dedicados, um em SQL (dentro do `$verify$` da migration, produto com todos os 7 campos fiscais `NULL`) e um em TypeScript (teste 2 do arquivo de integração, mesmo cenário via `listComFiltros`) confirmam que `NULL` continua `NULL` na leitura. Um quarto teste (teste 4, TypeScript) confirma que **editar** um produto com campos fiscais `NULL` (mudando só o nome) **não** introduz nenhum default — os 7 campos permanecem `NULL` após o `UPDATE`, exatamente como estavam.

## POSTGRES MIGRATION: PASS

Aplicada de verdade contra `supabase_db_fastproduct` (mesmo ambiente das ondas anteriores). Primeira tentativa do bloco `$verify$` falhou por motivo esperado e diagnosticado corretamente (não um bug do fix): a RPC é `SECURITY INVOKER` e seu `WHERE` depende de `auth_usuario_eh_admin()`/`auth_usuario_loja_id()`, que leem `auth.uid()` — chamar a função a partir de uma sessão `psql`/`postgres` pura (sem JWT) faz `auth.uid()` resolver `NULL`, bloqueando todas as linhas (mesmo comportamento que um usuário não-autenticado teria no app real — não é uma regressão da migration). Corrigido simulando a sessão de um usuário gerencial real via `request.jwt.claim.sub` dentro da própria transação de verificação (`set_config(..., true)`, escopo local). Reaplicada com sucesso: `BEGIN → DROP FUNCTION → CREATE FUNCTION → REVOKE/GRANT → COMMENT → DO $verify$ → COMMIT`, todos os `RAISE EXCEPTION` nomeados passaram, nenhum produto de teste sobrou no banco (transação de verificação limpa após si mesma).

## TESTS: PASS

| Suíte | Resultado |
|---|---|
| `$verify$` da migration (SQL, Postgres real) | PASS — produto com dados + produto NULL, ambos verificados byte-for-byte |
| `produtosFiscalEdicao.integration.test.ts` (novo, vitest + Postgres real, sessão JWT real de usuário GERENTE) | **4/4 PASS** — RPC devolve valores reais; RPC preserva NULL; edição preserva valores reais; edição preserva NULL |
| `productUpdater.semRpc.integracao.test.ts` (pré-existente, Postgres real) | 2/2 PASS — confirmado não afetado pela mudança |
| Suíte completa `app/admin/produtos` + `app/gerente/produtos` + `components/gerente/produtos` (unit + integration) | **223/223 PASS**, 35 arquivos |
| `tsc --noEmit` (projeto inteiro) | limpo, 0 erros |
| `eslint` (arquivo novo) | limpo |

## REGRESSION: PASS

Nenhuma mudança de comportamento fora do escopo: os filtros de listagem (situação/origem/nf/estoque/imagens/tags/categoria/marca/fornecedor/busca), a paginação e o isolamento de tenant permanecem idênticos (corpo da RPC copiado verbatim, só a lista de colunas mudou). `atualizar_produto_com_faixa_atacado` e `criar_produto_com_estoque_inicial` — já corretos desde a Onda C2.6 — não foram tocados nesta rodada. 223 testes pré-existentes da área de produtos continuam verdes.

---

## C2.8 HOTFIX GATE: PASS

Corrigida a única causa raiz identificada no Gate C2.7: `list_produtos_gerente_filtrados` agora devolve os 7 campos fiscais (`ncm`, `cfop_produto`, `csosn`, `cest`, `cst_pis`, `cst_cofins`, `icms_origem`) com os valores reais gravados no banco — não default, não `NULL` mascarando dado real, não valor inventado. A cadeia de edição (`RPC → mapper → tela → modal → formulário → UPDATE`) agora hidrata e preserva corretamente a classificação fiscal de qualquer produto, mesmo quando o operador só altera um campo não fiscal.

Não foi tocada tributação Focus, respostas Focus, PIX, XML, C3, dados reais de produto, webhook, cancelamento ou CC-e. Nenhuma migration/dado de produção foi tocado nesta rodada.
