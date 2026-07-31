# Decisões — Catálogo: categoria inativa e ação "Publicar"

**Data:** 2026-07-30
**Contexto:** rodada P1 da auditoria do catálogo (`AUDITORIA_CATALOGO_PRODUTO.md` §5.4 e §5.6).
**Status:** aplicadas.

Duas regras estavam ambíguas entre o core e a UI. Como ambas mexem em comportamento
de negócio, ficam registradas aqui antes da mudança de código.

---

## Decisão 1 — Categoria inativa some do seletor, mas nunca apaga vínculo existente

### Problema

`alternarAtivoCategoriaProduto` grava `ativo = false`, mas `listarOpcoesFiltrosProdutos`
carregava **todas** as categorias (diferente de marcas, que já filtravam `ativo = true`).
Resultado: inativar categoria não tinha nenhum efeito visível — a categoria continuava
sendo oferecida em todo cadastro de produto. O botão parecia quebrado.

### Por que não bastava filtrar por `ativo`

Filtrar ingenuamente cria um problema pior e silencioso: um produto já vinculado à
categoria inativa abriria o formulário com o `<select>` sem opção correspondente. O
select cai para a opção vazia e **salvar apagaria o vínculo sem o operador perceber** —
perda de dado disfarçada de edição normal.

### Decisão

1. O seletor passa a oferecer apenas categorias **ativas** para escolha nova.
2. A categoria **atual do produto em edição** continua aparecendo mesmo se inativa,
   marcada como inativa, para que salvar não apague o vínculo.
3. Nada é feito em massa nos produtos já vinculados. Inativar é decisão de
   *catálogo futuro*, não migração de dados.
4. A exclusão de categoria continua bloqueada enquanto houver produtos vinculados
   (regra que já existia em `excluirCategoriaProduto` e não muda).

### Consequência

Inativar categoria passa a significar exatamente: "não quero mais classificar produtos
novos aqui". Produtos históricos mantêm a classificação, e relatórios por categoria
continuam íntegros.

### Alternativa descartada

*Bloquear a inativação enquanto houver produtos vinculados* (simétrico à exclusão).
Descartada porque o caso de uso legítimo é justamente aposentar uma categoria que já
tem histórico — bloquear tornaria a ação inútil na prática.

---

## Decisão 2 — "Publicar" só aparece para rascunho; reativar inativo é ação própria

### Problema

`core/catalog/statusPublicacao.podePublicarProduto` documenta "só rascunho é
publicável". A tabela do catálogo (`CatalogoPublicacaoActions`) decidia por
`ativoFromStatusPublicacao(status)`, então oferecia **"Publicar" também para produto
INATIVO** — e a server action `publicarProduto` não revalidava o predicado. Core e UI
discordavam, e o servidor não era o árbitro.

### Decisão

1. A UI passa a consumir `podePublicarProduto` (fonte única). "Publicar" aparece
   **somente** para DRAFT.
2. Produto INATIVO ganha ação própria e nomeada — **"Reativar"** — em vez de reusar
   "Publicar". A transição INATIVO → PUBLICADO continua permitida: é necessidade real
   de operação (produto sazonal que volta a ser vendido).
3. `publicarProduto` (server action) passa a **validar `podePublicarProduto` no
   servidor** e recusa DRAFT→PUBLICADO indevido; a reativação usa
   `reativarProduto`, que é explícita sobre a transição que executa.

### Por que não simplesmente alinhar a UI e deixar o servidor permissivo

Server Action é endpoint público. Se só a UI respeita a regra, a regra não existe —
qualquer chamada direta publica o que quiser. Regra de negócio precisa ser decidida no
core e **imposta no servidor**.

### Consequência

O vocabulário fica honesto: "Publicar" é a estreia de um rascunho; "Reativar" é o
retorno de um produto aposentado. Ambos terminam em PUBLICADO/ativo, e a regra de
vendabilidade do PDV (`ativo && status_publicacao === 'PUBLICADO'`) não muda.

### O que NÃO mudou

- `PRODUCT_RULES.vendavel` — intocada.
- Dual-write `status_publicacao` + `ativo` — intocado.
- `lifecycleAoEditarProduto` (INATIVO preservado ao editar) — intocado.
- Ações em lote continuam usando `setProductStatusLoteAction`, que é transição
  explícita por status e não passa por `podePublicarProduto`.
