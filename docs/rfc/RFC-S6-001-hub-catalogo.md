# RFC-S6-001 — Hub Catálogo (sidebar → abas)

**Status:** implementado (Sprint 6)  
**Escopo:** UX/navegação apenas — Entity-SSOT preservado.

## Problema atual

Três entradas no menu CORE (Catálogo, Categorias de produtos, Marcas) fragmentavam um único fluxo mental (“organizar o que vendo”). Categorias e marcas são cadastros de apoio usados com baixa frequência isolada, mas com alta co-ocorrência com produtos.

## Evidência

- `adminV2SidebarNav.ts` listava 12 itens CORE incluindo categorias e marcas.
- `AUDITORIA_CONSISTENCIA_VISUAL.md` e PMO citam excesso de itens no menu principal.
- Testes de menu (`adminV2SidebarNav.test.ts`) exigiam categorias no CORE (legado pré-S6).

## Decisão

**Fundir na navegação** (não no backend): manter rotas SSOT `/admin/catalogo`, `/admin/categorias-produtos`, `/admin/marcas-produtos` e expor **abas horizontais** (`CatalogoHubNav`) em todas as telas do hub. Remover categorias e marcas da sidebar.

## O que mudou

- Sidebar CORE −2 itens.
- Abas Produtos · Categorias · Marcas abaixo do `PageHeader` nas três rotas.
- Hint no item Catálogo na sidebar.

## Onde a função foi parar

Mesmas rotas e actions; descoberta via abas do hub ou item “Catálogo” na sidebar.

## Impacto para o usuário

Menos scroll na sidebar; cadastros de taxonomia encontrados no contexto do catálogo.

## Riscos

Bookmarks antigos continuam válidos. Usuários habituados ao atalho direto na sidebar precisam de um clique a mais (Catálogo → aba).

## Como validar

- `npm run test -w pdv-importados -- lib/navigation/adminV2SidebarNav.test.ts`
- Smoke manual: sidebar → Catálogo → abas Categorias/Marcas.
- `npm run check:entity-ssot -w pdv-importados`.
