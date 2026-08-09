# UX-11 — Auditoria modais catálogo/produto (2026-08-08)

Escopo: `components/gerente/produtos/*` consumidos em `/admin/catalogo` (SSOT produto).

## Estado antes

| Área | Achado | Impacto |
|------|--------|---------|
| `form/produtoFormStyles.ts` | `app-input` / `app-select` + overrides glass | Campos fora do contrato `fp-control` |
| Seções do `ProdutoForm` | `text-[10–11px]` denso | Hierarquia inconsistente vs admin DS |
| `FaixasAtacadoEditor` | `app-input` + px arbitrários | Mesmo |
| `ComercialSection` | textarea `app-input` | Mesmo |
| `ProdutosImportarModal` | checkboxes `app-border` / `app-surface-soft` | Chrome legado |
| `ProdutosToolbar` | botões `app-border` / `app-surface-soft` | Legado (página gerente; alinhado por consistência) |
| Shell modal | `DragonModal` | **Mantido** — primitivo DS canônico (`ds-coverage`) |
| `CadastroRapidoNomeModal` | `Field` + `Input` DS | Já conforme |
| `ProdutosExcluirLoteModal` | `DragonModal` + `Button` | Já conforme (tipografia menor ajustada onde aplicável) |
| `ProdutosListaImpressao` | px fixos print | **Fora de escopo** (CSS de impressão neutro) |

## Implementado (commit UX-11)

- `produtoFormStyles`: `fp-control` + `text-small` / `FIN_TEXTAREA`
- Tipografia hints/erros: `text-caption` nas seções do formulário
- `ProdutosImportarModal`: checkboxes com tokens `jl-border` / `jl-surface`
- `ProdutosToolbar`: `border-jl-border-1 bg-jl-surface-soft`
- Sem alteração de actions, schema, RPC ou fluxo de submit

## Gates

| Gate | Resultado |
|------|-----------|
| Preview Vercel PR #268 | `dpl_Bp166tUa5ieybjJ4MReDpnrLYuUu` **READY** — `fd6b695c` — https://pdv-importados-m9pds1zez-jinlong.vercel.app |
| `catalogoNovoProdutoEntradas.behavior` | **3/3** OK |
| `p0-venda-homologacao` | **11/11** OK |

## Resíduos UX-11

- Labels `text-xs` em `<label>` do form (aceitável; opcional migrar para `text-small`)
- `DragonModal` usa `dragon-glass-*` por design do primitivo — não duplicar shell admin
