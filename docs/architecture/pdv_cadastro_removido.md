# PDV não cadastra produto — superfície removida, código morto pendente

**Decisão de produto (2026-07-30):** o PDV não é responsável por cadastrar
produto. O cadastro pertence ao módulo Produtos (gerente/admin). O objetivo foi
eliminar a confusão entre *vender* e *cadastrar*.

## O que mudou

Ao bipar um código inexistente, o caixa **informa e orienta** em vez de abrir um
formulário de produto:

> Código não encontrado. Busque por nome/SKU. Se o produto não existe, peça o
> cadastro em Produtos (gerente).

A mensagem já era emitida pelo próprio pipeline de leitura
(`webCaixaScanProcess`, ramo `nao_encontrado`), então remover o formulário não
deixou o operador sem feedback — apenas sem o atalho errado.

Removido de `app/caixa/CaixaPageClient.tsx`:

- o import de `CadastroProdutoRelampagoModal`;
- o estado `cadastroRapidoCodigo`;
- o callback `onProdutoNaoEncontrado`, que abria o formulário no bipe;
- o handler `handleSalvoCadastroRapido`, que devolvia o código para a fila;
- o render do modal.

Trava de regressão: `app/caixa/caixaSemCadastroProduto.test.ts`.

## Código morto — CONCLUÍDO (2ª etapa)

Auditoria de consumidores antes de apagar: o ciclo era fechado — só o modal
chamava a action, e o modal não tinha nenhum consumidor. Confirmado ausente de
integração externa e de fluxo oculto:

- nenhuma rota em `app/api/` cria produto;
- `pdv-local` (Tauri) não tem caminho de criação — só consome catálogo;
- a Edge Function `sync-outbox` só **lê** catálogo (`GET catalogo`) e processa
  vendas; não faz replay de criação de produto;
- nenhuma fila offline de cadastro em `pdv-importados`;
- os dois e2e que citam "cadastro rápido" usam `/admin/catalogo`.

| # | Alvo | Situação |
|---|---|---|
| 1 | `CadastroProdutoRelampagoModal.tsx` | **apagado** |
| 2 | `criarProdutoRelampagoPdv` (`app/caixa/actions.ts`) | **removida** — era o item de segurança: `actions.ts` é `'use server'`, então a export era endpoint POST endereçável mesmo sem UI |
| 3 | `caixaCadastroRelampago.impl.ts` | **apagado** |
| 4 | `onProdutoNaoEncontrado` (dep do pipeline) | **removida**, junto com o call site; o teste dela virou cobertura do comportamento novo (avisa e para) |
| 5 | Exceção `/app/caixa/…` no guard de SSoT | **removida** de `scripts/check-entity-ssot-boundary.mjs` |

Telemetria: o valor `surface: 'pdv_relampago'` foi **mantido** no enum de
`sugestaoCadastroActions.ts` e em `cadastroSugestaoClient.ts`. É valor histórico
já gravado; remover do enum de validação não traria ganho e arriscaria rejeitar
requisição em vôo. Nenhuma escrita nova usa esse valor.

## Permissões: o que foi removido FUNCIONAVA

**Correção de um registro anterior errado neste mesmo documento.** Uma auditoria
intermediária afirmou que o caminho relâmpago "nunca funcionou para OPERADOR",
com base nas migrações `269` e `270`. Isso estava **errado**: duas migrações
posteriores substituem essas funções (`CREATE OR REPLACE`) e já liberavam
OPERADOR, de forma estreita e bem desenhada:

| Migração | Efeito |
|---|---|
| `20260718135138_criar_produto_permite_operador_pdv.sql` | `criar_produto_com_estoque_inicial` passa a aceitar `OPERADOR` além de GERENTE/DONO/ADMIN. |
| `20260718135500_ajuste_estoque_inicial_operador_pdv.sql` | `ajustar_estoque_manual` aceita `OPERADOR` **somente** no caso canônico de estoque inicial (`ACERTO_INVENTARIO` + observação canônica). Qualquer outro ajuste segue GERENTE+. |

O smoke de homologação registrou o caminho funcionando
(`backend/artifacts/missao1_go_nogo_fluxo_venda_20260718_rehomolog.md`:
`estoque_aplicado=true`).

Como os arquivos de migração numérica (`269`, `270`) ordenam antes dos de
timestamp (`2026…`), é fácil ler o arquivo antigo e concluir o estado errado.
**Ao auditar uma função Postgres, procurar todos os `CREATE OR REPLACE` dela,
não o arquivo de menor número.**

Portanto: a remoção do cadastro do PDV foi uma **decisão de produto** (separar
vender de cadastrar), não a correção de um bug. O que saiu era uma feature
funcional com uma exceção de permissão estreita e auditável.

## Pendência de permissão gerada por esta remoção

As duas migrações acima agora concedem permissão **sem nenhum consumidor**:
`OPERADOR` continua podendo criar produto e aplicar estoque inicial via RPC,
embora nenhuma UI ofereça isso. Não é exploração trivial (a criação exige
`service_role`, e a action foi removida), mas é permissão mais larga do que o
sistema precisa.

**Decisão pendente do dono do produto:** emitir migração revertendo os dois
gates para GERENTE+, ou manter a concessão caso o cadastro no caixa possa voltar.
Não foi feito aqui porque é mudança de fronteira de permissão em banco, fora do
escopo de uma limpeza de código morto.

Se a necessidade de cadastrar no caixa voltar, a exceção estreita de
`20260718135500` é o modelo a seguir — ela restringe pelo *motivo* do ajuste, não
pelo perfil apenas.

## Não alterado

Regras de estoque, RPCs, pricing e o cadastro de produtos no módulo
gerente/admin seguem intactos. Produto cadastrado pelo módulo normal continua
aparecendo no PDV: o caixa faz consulta ao vivo por bipe com
`aplicarFiltroProdutoVendavel` (`ativo` + `status_publicacao = PUBLICADO`), sem
cache — cadastro manual sai `PUBLICADO` e aparece na hora.

Documentação de arquitetura afetada, a revisar num próximo passo:
`.cursor/rules/entity-ssot.mdc` e
`docs/architecture/inventario_products_autoridade.md` ainda descrevem o PDV
relâmpago como caminho ativo de criação.
