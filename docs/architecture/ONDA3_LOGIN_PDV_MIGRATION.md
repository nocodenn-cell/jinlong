# Onda 3 — Login + PDV (1ª passagem)

**Escopo:** só infraestrutura visual do Design System.  
**Proibido:** auth, fluxos, validações, rotas, i18n, regras de venda/pagamento/carrinho.

## Entregue

### Login (referência visual)

- `Button`, `Field`, `Input`, `Loading`, `ErrorState`
- Tipografia / focus / spacing via tokens
- Tema cerimonial em `styles/ds/login-theme.css` (`data-theme="login"`)
- Hex `#bfa76a` removido do TSX → `--color-login-*`

### PDV (1ª passagem — sem polish)

- `.app-btn-*` / `.app-input` removidos de `app/caixa/**`
- Modais críticos: `Button` + `Input`/`Select`/`Textarea` + `ErrorState`
- Busca: `CaixaSearchBar` no DS
- Feedback: `Loading` / `EmptyState` / `ErrorState` em histórico, timeline, em aberto, cliente
- Total do footer: sem `text-amber-400` (token warning)

## Critério obrigatório (PR)

| Item | Status |
|---|---|
| Antes / depois (screenshot) | Anexar no PR (manual) |
| Zero regressões funcionais | Smoke Login + PDV |
| Zero CSS novo fora do DS | `styles/ds/login-theme.css` apenas |
| Zero cores hardcoded novas no TSX migrado | Login OK; PDV parcial (polish depois) |
| Zero componentes paralelos novos | OK |

## Burndown

```bash
cd pdv-importados && npm run check:ds-burndown
```

## Próximo

Dashboard → Catálogo → … → PDV polish final.
