# Auditoria — Cadastro de Produto e módulo Catálogo

Escopo: telas de catálogo, fluxos ponta a ponta (Frontend → Server Action → RPC/Supabase → tela),
integração com PDV e UX de operação. Objetivo: prontidão para o primeiro cliente.

Base auditada: branch `claude/audit-product-catalog-apg4ts` (a partir de `6902999`).

---

## 1. Mapa real das telas

A auditoria começou pelo roteamento, e a primeira constatação muda a leitura de tudo o que vem depois:
**as telas `/gerente/*` de catálogo não existem mais como rota.** Sobraram só os componentes órfãos
(o próprio `check-entity-ssot-boundary` do projeto já os marca como `[ssot:orphan]`).

| Tela pedida | Rota real | Situação |
|---|---|---|
| Cadastro de produto | `/admin/catalogo` (modal) + `/admin/catalogo/novo` (redirect) | ✅ |
| Lista de produtos | `/admin/catalogo` | ✅ |
| Edição de produto | `/admin/catalogo` (modal, mesmo formulário do cadastro) | ✅ |
| Categorias | `/admin/categorias-produtos` | ⚠️ sem excluir na UI |
| Fornecedores | `/admin/fornecedores` | ✅ |
| **Marcas** | ~~não existia rota~~ → `/admin/marcas-produtos` | ✅ criado na rodada 2 |
| Estoque inicial | dentro do cadastro (só na criação) | ✅ |
| Recebimento | `/admin/estoque/recebimento` | ~~`<select>` de 500~~ → ✅ busca server-side (rodada 2) |
| Preços atacado/varejo | dentro do formulário (`FaixasAtacadoEditor`) | ✅ |
| Dados fiscais | dentro do formulário (`FiscalSection`, modo completo) | ✅ |

---

## 2. Fluxos validados

| Fluxo | Cadeia | Situação |
|---|---|---|
| Criar produto | `ProdutoFormModal` → `criarProduto` → Zod → `criarProdutoAction` → `ProductWriter` → RPC 270 (produto + estoque + kardex na mesma TX) → reload `ProductReader` | ✅ |
| Salvar rascunho | intenção `DRAFT` → `NovoProdutoRascunhoSchema` (preço pode ser 0) → dual-write `status_publicacao=DRAFT, ativo=false` | ✅ |
| Publicar no PDV | `publicarProduto` → `ProductLifecycleService` → dual-write `PUBLICADO/true` (com `.eq('loja_id')`) | ✅ |
| Alterar preço | edição → `atualizarDadosProdutoGerente` → `ProductUpdater` (`.eq('loja_id')`) | ✅ |
| Alterar estoque | `/admin/estoque` → `atualizarEstoqueProduto` → RPC `ajustar_estoque_manual` (mig. 269) + kardex | ❌ → corrigido (item 3.3) |
| Vincular categoria | `CategoriaQuickField` → `criarCategoriaProduto` → grava `categoria_id` | ⚠️ → corrigido (item 3.5) |
| Vincular fornecedor | `FornecedorQuickField` → `salvarFornecedorAction` | ✅ |
| Criar estoque inicial | só no create, via RPC 270 na mesma transação | ✅ |
| Consultar no PDV | `caixaCatalogo.impl` / `caixaConsultaRapida.impl` → `aplicarFiltroProdutoVendavel` → motor único `productEngine` | ✅ |

A regra de vendabilidade (`ativo=true AND status_publicacao='PUBLICADO'`) tem **fonte única** em
`shared-core/src/engine/productEngine` e é aplicada tanto como filtro SQL quanto como validação
pós-leitura no caixa. Não achei divergência entre cadastro e PDV.

---

## 3. ❌ Quebrado — corrigido nesta branch

### 3.1 Trocar a foto no meio da edição fechava o modal e descartava tudo

`ProdutoFormModal` ligava `onImagemChange` direto em `onSaved`. No catálogo, `onSaved` faz
`setEditando(null)` — então subir/remover a foto desmontava o modal.

Cenário real: o operador abre "Editar", corrige o preço, ajusta NCM, sobe a foto do produto → o modal
fecha, a foto é gravada e **preço e NCM são perdidos sem nenhum aviso**. Silencioso: o toast diz
"foto atualizada", que parece sucesso.

Correção: `onImagemChange` passou a ser um evento próprio (`onImagemAtualizada`), que só recarrega a
lista por baixo. A miniatura passa a refletir a URL nova na hora (`onDone` agora devolve a URL), sem
reabrir o formulário.

### 3.2 Botão "Ver" (olho) da lista era link morto

`CatalogoTable` renderizava `href={ROUTES.admin.catalogo}` — a própria lista. A tela de detalhe
`/admin/catalogo/[id]` nunca foi criada (a server action `buscarProdutoDetalhe` existe, sem consumidor).
Clicar em "Ver produto X" recarregava a lista.

Correção: botão removido. "Editar" já mostra todos os campos. Não inventei tela de detalhe — isso é
decisão de produto, não correção de bug.

### 3.3 Ajuste de saldo travava em produto legado, sem saída para o operador

`/admin/estoque` lista, na visão "geral" (LEFT JOIN), produtos **sem linha em `estoque`** e oferece o
botão "Ajustar". A RPC `ajustar_estoque_manual` aborta com `AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA` nesse
caso — e **nenhuma tela expõe a criação da linha**: a action `garantirLinhaEstoque` existe mas ficou
sem call site quando `/gerente/produtos` foi removida. O produto ficava permanentemente sem saldo
ajustável.

Produtos criados hoje não caem nisso (a RPC 270 sempre insere a linha 0/0). Quem cai é o legado —
exatamente a base que o primeiro cliente vai importar.

Correção: `atualizarEstoqueProduto` cria a linha 0/0 (mesma regra de `garantirLinhaEstoque`) e repete
o ajuste **uma vez** quando o erro é `NOT_FOUND`. Saldo, motivo e kardex continuam sendo escritos pela
RPC canônica — nenhuma regra de negócio muda. Lógica isolada em `ajusteComLinhaGarantida.ts` com testes.

---

## 4. ⚠️ Risco — corrigido nesta branch

### 4.1 Server Actions de leitura sem guard de sessão

Server Action é endpoint HTTP público. Estas não chamavam `assertGerenteSession`:

- `obterListaEstoqueGerente`, `obterListaEstoqueGerenteCompletaParaExport`, `obterKpisEstoque`
- `buscarFornecedoresPaginadosAction`

O RLS segurava o vazamento (a RPC de estoque é `SECURITY INVOKER` e só `authenticated` tem GRANT;
`fornecedores` tem policy `GERENTE/DONO/ADMIN`), então **não era vazamento de dados** — mas
`lojaIdResolvidaGestao()` ainda caía em `LOJA_MATRIZ_ID` sem sessão, e em fornecedores a tela mostrava
"nenhum fornecedor" em vez de "sem permissão". Guards adicionados, alinhando com o resto do módulo.

### 4.2 Renomear/inativar categoria não invalidava o cache das opções

`listarOpcoesFiltrosProdutos` usa `unstable_cache` com TTL de 120 s e tag `catalogo-opcoes-filtro`.
`criarCategoriaProduto` e `excluirCategoriaProduto` invalidavam a tag; `atualizarCategoriaProduto` e
`alternarAtivoCategoriaProduto` **não**. Resultado: renomear uma categoria e o nome antigo continuar
nos seletores do cadastro e nos chips de filtro do catálogo por até 2 minutos. Tag adicionada nos dois.

### 4.3 Rótulos em português fixos e idioma não propagado

`CatalogoTable` tinha `Editar ${nome}`, `Duplicar ${nome}`, `"Ver e ajustar no estoque"` hard-coded, e
`/admin/catalogo` não passava `idioma` para os modais (o padrão `'pt'` vazava para o cadastro rápido de
fornecedor). Para um operador em `zh` isso é texto ilegível. Chaves i18n criadas em `pt.json`/`zh.json`
e `idioma` propagado do server component até os modais.

### 4.4 Link de estoque da lista buscava por nome

A coluna "Estoque" linkava `adminEstoqueProdutoQuery(r.nome)`. Com nomes parecidos ("Caneca 300ml",
"Caneca 300ml Azul") o operador caía numa lista ambígua. Passou a preferir o código de barras.

---

## 5. ⚠️ Risco — reportado na rodada 1

> **Atualização (rodada 2):** os itens 5.1 a 5.6 foram endereçados. As duas mudanças
> de regra (5.4 e 5.6) têm decisão registrada em
> `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`. O que segue aberto
> está consolidado na §8.

### 5.1 Não existe como excluir um produto na UI

`aplicarExclusaoOuInativacaoEmLote` e `ProdutosExcluirLoteModal` existem, mas o único consumidor era
`/gerente/produtos`, que não é mais rota. Hoje o catálogo só inativa. Um produto cadastrado errado no
primeiro dia fica no catálogo para sempre.

### 5.2 Ações em lote e filtro por tags ficaram sem UI

Mesma causa. O comentário no topo de `app/admin/catalogo/page.tsx` diz que foram "deferidos (existem em
/gerente/produtos)" — a rota citada não existe. Sem UI: publicar em lote, ativar/inativar em lote,
alterar categoria em lote, filtro por tags, edição de preço inline na lista.

### 5.3 "Marcas" não tem tela de gestão

Só dá para **criar** marca (cadastro rápido no formulário). Não há como renomear, inativar ou excluir —
`app/gerente/marcas-produtos/actions.ts` só exporta `criarMarcaProduto`. Marca digitada errada é
permanente e polui o seletor de todo cadastro futuro.

### 5.4 Inativar categoria não tem efeito visível

`buscarOpcoesFiltrosCached` filtra marcas por `ativo=true` mas **carrega todas as categorias**. Inativar
uma categoria não a tira do seletor de produto — o botão parece não fazer nada.

Não filtrei por conta própria porque há um efeito colateral perigoso: produtos já vinculados à categoria
inativa passariam a abrir o formulário com o seletor vazio, e salvar **apagaria silenciosamente o
vínculo**. A correção segura exige decidir o comportamento (manter a categoria atual na lista mesmo
inativa, ou bloquear a inativação enquanto houver produtos, como já é feito na exclusão).

### 5.5 Recebimento: `<select>` cortado em 500 produtos

`/admin/estoque/recebimento` carrega `produtos ... .eq('ativo', true).limit(500)` e joga tudo num
`<select>` sem busca. Acima de 500 itens o produto simplesmente não aparece — sem erro, sem aviso.
Também exclui rascunhos (`ativo=false`), então não dá para receber mercadoria de um produto ainda não
publicado. Precisa de combobox com busca server-side (o `FornecedorCombobox` do formulário já é esse
padrão).

### 5.6 "Publicar" aparece para produto INATIVO, contra a regra documentada

`core/catalog/statusPublicacao.podePublicarProduto` diz "só rascunho é publicável" e a lista antiga
respeitava isso. `CatalogoPublicacaoActions` decide por `ativoFromStatusPublicacao(status)`, então
oferece "Publicar" também para INATIVO — e `publicarProduto` não revalida o predicado no servidor.
Reativar um produto inativo é uma necessidade legítima; o problema é a regra e a UI discordarem. Precisa
de decisão: ou a UI respeita `podePublicarProduto`, ou a regra passa a admitir INATIVO → PUBLICADO.

### 5.7 Código órfão de alto volume

`ProdutosGerentePageClient.tsx` (1187 linhas), `CategoriasProdutosPageClient.tsx` e outros marcados
`@legacy` não são importados por nada. Além do peso de manutenção, contêm um bug latente que confunde
quem for reaproveitá-los: `refetch()` chama `fetchList(filtros, paginaAtual)` com `append=false`, o que
**substitui** a lista acumulada pelo scroll infinito pela página atual — após qualquer edição o operador
perderia as linhas anteriores. Também há `revalidatePath('/gerente/produtos')` espalhado nas actions,
apontando para rota inexistente (no-op inofensivo, mas ruído).

Server actions sem nenhum consumidor: `buscarProdutoDetalhe`, `obterKpisEstoque`,
`atualizarPrecoVarejoProduto`, `garantirLinhaEstoque` (esta última agora coberta pelo item 3.3).

### 5.8 Fora do escopo, mas achado no caminho

O `next.config.js` **da raiz do monorepo** declara `const { withSentryConfig }` três vezes e não carrega
(`SyntaxError`). Não afeta o deploy — a Vercel builda `pdv-importados`, cujo `next.config.js` está
correto e cujo `next build` passa. É arquivo legado que vale remover para não derrubar quem rodar build
da raiz.

---

## 6. UX de operação — leitura do formulário

O que está bom e vale preservar:

- ✅ Modo simples/completo: o cadastro rápido pede só código, nome, custo, venda e estoque inicial.
- ✅ Cadeia de Enter na ordem visual (código → nome → custo → venda → estoque → salvar).
- ✅ Sugestão por GTIN preenchendo nome/preço/NCM sem sobrescrever o que o operador já digitou.
- ✅ Erro de validação rola até o campo e abre "Mais detalhes" se o campo estiver escondido lá.
- ✅ Tela pós-salvar honesta: com saldo 0 ela **não** diz "liberado no PDV" — diz que o ajuste de estoque
  é obrigatório, porque `finalizar_venda_v4` aborta com `ESTOQUE_INSUFICIENTE`. Isso está inclusive
  coberto por teste.
- ✅ "Salvar e continuar" preserva categoria/marca/fornecedor/origem entre itens.

Pontos que ainda pesam (não corrigidos, são ajuste fino):

- ⚠️ Na edição, o link de estoque aponta para `/admin/estoque` genérico, não para o produto aberto.
- ⚠️ `AjusteSaldoModal` diz que a observação é obrigatória para o motivo "Outro" só no placeholder, e não
  valida no cliente — o operador preenche tudo, salva, e só então leva o erro do servidor.
- ⚠️ Preço de custo e "permitir venda abaixo do custo" ficam no modo completo, mas a margem calculada
  aparece na precificação — quem cadastra no modo simples não entende de onde vem a margem.

---

## 7. Verificação

Executado após as correções, tudo verde:

- `npx tsc -p tsconfig.typecheck.json --noEmit` — sem erros
- `npx vitest run` — **157 arquivos, 821 testes** (era 815; +6 de regressão novos)
- `npx next lint` nas áreas alteradas — sem avisos
- `npm run guard:all` (core-rule, pdv-flow, route, rpc-gate, pricing, deps, migrations, domain, ssot) — OK
- `npx next build` em `pdv-importados` — build completo

Testes de regressão adicionados:

- `components/gerente/produtos/ProdutoFormModal.foto.behavior.test.tsx` — foto não dispara `onSalvo`, o
  formulário continua montado e a miniatura atualiza.
- `app/gerente/estoque/ajusteComLinhaGarantida.test.ts` — cria a linha faltante e repete uma vez;
  não repete em outros erros; devolve o erro original se a criação falhar.

**Não houve alteração de regra de negócio.** Vendabilidade, dual-write de lifecycle, precificação e
kardex continuam exatamente onde estavam, com as mesmas RPCs como autoridade.

---

## 8. Rodada 2 — o que foi fechado e o que segue aberto

### ✅ P0 — fluxo cadastro → estoque → PDV travado por teste

`app/gerente/produtos/cadastroEstoquePdv.contrato.test.ts` percorre a cadeia inteira,
sem I/O, elo por elo:

```
form (buildSubmitPayload)
  → Zod (NovoProdutoSchema | NovoProdutoRascunhoSchema)
  → lifecycle (statusInicialProduto | dualWriteFromStatus)
  → mapFormToCreateProductInput      (UI snake → domínio camel)
  → mapCreateProductInputToRpc       (domínio → payload da RPC 270)
  → defaultStatusNovoProduto         (dual-write gravado na linha)
  → isProdutoVendavel                (regra única do PDV)
```

O modo de falha que ele existe para pegar é silencioso: produto cadastrado com
sucesso, visível no catálogo, que **nunca aparece no PDV** porque algum elo parou de
propagar `status_publicacao`/`ativo`. Cobre também rascunho que não vaza, publicação
posterior, inativação, e o caso "publicado com saldo 0" (vendável pela regra de
catálogo; quem barra é `decrementar_estoque_seguro` na venda).

### ✅ P1 entregue

| Item | O que mudou |
|---|---|
| Excluir/inativar produto | Botão por linha + ação em lote no `/admin/catalogo`, reusando `ProdutosExcluirLoteModal` e a regra segura de `productExclusion` (sem dependências → remove; com dependências → inativa) |
| Ações em lote | Seleção por linha e por página + barra com publicar / ativar / inativar / alterar categoria / excluir. `DataTable` ganhou `headerCell` opcional (aditivo) para o "selecionar todos" |
| Gestão de marcas | Nova rota `/admin/marcas-produtos` + actions `listar`/`atualizar`/`alternarAtivo`/`excluir`, espelhando categorias. Entrou no menu lateral |
| Categoria inativa | Sai das escolhas novas, **continua visível no produto que já a usa** com aviso — esconder faria salvar apagar o vínculo. Lógica pura em `core/catalog/opcoesCadastro.ts`, com teste |
| Recebimento | `<select>` de 500 itens → autocomplete com busca server-side (nome, código de barras, código interno), teto de 20 e escopo de loja |
| Regra "Publicar" | UI passa a consumir `podePublicarProduto` (só rascunho publica); INATIVO ganha ação própria "Reativar"; a regra é **imposta no servidor**, não só na tela |

### ⚠️ Segue aberto (decisão de produto)

- **Filtro por tags** — a server action aceita `tags`, mas não há UI. Nenhum consumidor hoje.
- **Tela de detalhe do produto** — `/admin/catalogo/[id]` não existe; `buscarProdutoDetalhe` continua sem consumidor. "Editar" cobre a necessidade.
- **Fornecedor inativo ainda aparece no seletor** — mesma questão que foi resolvida para categoria (§5.4) e marca. Não mexi porque fornecedor tem regra própria de bloqueio (contas a pagar em aberto) e merece decisão separada.
- **`AjusteSaldoModal`** — a observação obrigatória para o motivo "Outro" só aparece no placeholder e não é validada no cliente: o operador preenche tudo, salva, e só então leva o erro do servidor.
- **Código órfão** — `ProdutosGerentePageClient.tsx` (1187 linhas) e outros `@legacy` seguem sem importador; o `check-entity-ssot-boundary` já os lista como `[ssot:orphan]`. Server actions sem consumidor: `buscarProdutoDetalhe`, `obterKpisEstoque`, `atualizarPrecoVarejoProduto`, `garantirLinhaEstoque`.

### 🧹 Fora do escopo, corrigido no caminho

O `next.config.js` **da raiz do monorepo** declarava `withSentryConfig` três vezes (o
wizard do Sentry injetou o bloco em duplicata) e não carregava — `SyntaxError`. Não
afetava a Vercel, que builda `pdv-importados`, mas derrubava qualquer build disparado
da raiz, incluindo o preview do Autonoma na PR #251. Duplicatas removidas.

### Verificação da rodada 2

- `npx tsc -p tsconfig.typecheck.json --noEmit` — sem erros
- `npx vitest run` — **159 arquivos, 834 testes** (era 821)
- `npx next lint` nas áreas alteradas — sem avisos
- `npm run guard:all` — OK (route-guard agora com 27 rotas)
- `npx next build` em `pdv-importados` — build completo

**Nenhuma regra de negócio foi alterada sem decisão registrada.** As duas que mudaram
estão em `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`.
