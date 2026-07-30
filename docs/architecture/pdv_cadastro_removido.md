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

## Código morto — inventário para limpeza posterior

Nada foi apagado. Todos os itens abaixo estão marcados `@deprecated` no próprio
arquivo e **não têm mais nenhum call site**.

| # | Alvo | Arquivo | Observação para a limpeza |
|---|---|---|---|
| 1 | `CadastroProdutoRelampagoModal` | `components/gerente/produtos/CadastroProdutoRelampagoModal.tsx` | Componente inteiro. Não tem outro consumidor. |
| 2 | `criarProdutoRelampagoPdv` | `app/caixa/actions.ts` | **Server Action ainda exportada — segue acessível por rede.** Remover de fato, não só o componente. |
| 3 | `criarProdutoRelampagoPdvImpl` | `app/caixa/server/caixaCadastroRelampago.impl.ts` | Só alcançado por (2). |
| 4 | `onProdutoNaoEncontrado` (dep opcional) | `app/caixa/scan-pipeline/webCaixaScanProcess.ts` | Dep opcional sem consumidor. Tem teste próprio (`webCaixaScanProcess.test.ts`) que passa a cobrir um gancho sem uso. |

O item **2** é o único com superfície de segurança: enquanto a action existir e
estiver exportada, ela continua invocável por rede por quem tiver sessão, mesmo
sem UI. Priorizar.

## Divergência de permissão que este código carregava

Registrado para quem for limpar ou reaproveitar. O caminho relâmpago **nunca
funcionou para OPERADOR**:

- `caixaCadastroRelampago.impl.ts` autorizava `OPERADOR, GERENTE, DONO, ADMIN`;
- a RPC `criar_produto_com_estoque_inicial` (mig. 270) exige `GERENTE/DONO/ADMIN`
  e levanta `CRIAR_PRODUTO_PERFIL`;
- `ajustar_estoque_manual` (mig. 269) exige o mesmo, resolvendo o ator como
  `COALESCE(auth.uid(), p_ator_id)`.

O efeito era: operador bipava código desconhecido, preenchia tudo e travava no
salvar. A remoção da superfície resolve o sintoma — o operador não é mais
convidado a um fluxo que terminaria em erro.

**Não "consertar" isso afrouxando o portão de estoque.** `ajustar_estoque_manual`
é o único lugar que decide movimento de saldo; liberar OPERADOR lá vale para
qualquer produto de qualquer tela, e é cobertura de quebra. Se a necessidade de
cadastrar no caixa voltar, a opção discutida foi autorização pontual de gerente
reusando o padrão de `validar-gerente` / `tokens_desconto_gerente` (token
persistido, uso único, com `criado_por`), rodando a criação com o gerente como
ator — sem criar permissão nova.

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
