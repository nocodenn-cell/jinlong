# `components/` — UI reutilizável

Objetivo: **separar apresentação** (marcup estável, `data-testid`, acessibilidade) da **orquestração** em `app/` (estado de página, server actions, efeitos longos).

## Pastas

| Pasta | Uso |
|--------|-----|
| `ui/` | Primitivos estilo shadcn (Button, Input, …). Genéricos, sem domínio PDV. |
| `caixa/` | Blocos do fluxo web do operador (ex.: mensagens de status). |
| `gerente/` | Tabelas, filtros, export CSV, links de navegação do painel gerente. |
| `auth/`, `security/`, `forms/` | Cross-cutting pequeno. |

## O que permanece em `app/`

- **Server actions** e validação próxima à rota (`app/**/actions.ts`).
- **Páginas client** que coordenam muitos handlers (ex.: `CaixaPageClient`) — importam componentes daqui para reduzir tamanho e facilitar teste.

## Ao adicionar UI

1. Se o bloco tem **props claras** e pode ser testado/reutilizado → `components/<domínio>/`.
2. Se é só composição de uma rota **e** acoplada a uma action única → pode ficar em `app/` até estabilizar.

Ver também `pdv-importados/README.md` (secção Estrutura) e `.cursorrules`.
