# Vendas (gerente) — lista + detalhe em modal

Melhoria da tela `pdv-importados/app/gerente/vendas/page.tsx`: linhas da
lista agora abrem um **modal de detalhe** em vez de navegar para
`/gerente/vendas/[id]`. Cobertura completa: itens da venda, método de
pagamento, totais, data, status, operador, caixa e NF — mais o cancelamento
consolidado no rodapé do modal (saiu da coluna espremida na tabela).

## Visualizar
Abra `index.html` para ver a versão interativa com mock data (84 vendas,
infinite scroll funcionando, modal acessível).

## Drop-in no monorepo

```
pdv-importados/app/gerente/vendas/
  page.tsx                       ← (sem mudanças — só renderiza o list client)
  VendasGerenteListClient.tsx    ← SUBSTITUIR
  VendaDetalheModal.tsx          ← NOVO
  actions.ts                     ← APPEND `buscarVendaDetalheAction`
```

1. Substitua **`VendasGerenteListClient.tsx`** pelo da pasta.
2. Adicione **`VendaDetalheModal.tsx`** no mesmo diretório.
3. Cole o conteúdo de **`actions.additions.ts`** no fim de
   `actions.ts` (export `buscarVendaDetalheAction` + tipo `VendaDetalheDTO`).
4. Opcional: remova `app/gerente/vendas/[id]/page.tsx` — o detalhe agora
   está no modal. Se preferir manter, adicione um link "Abrir em página
   inteira" no header do modal apontando para `/gerente/vendas/${id}`.

## O que muda na UX

- **Linha clicável inteira** (não mais o link "Ver detalhes" + form de
  cancelamento brigando pelo mesmo espaço).
- **Coluna de cancelamento sumiu da tabela** — o form foi para o rodapé
  do modal, com `confirm()` antes de chamar a server action.
- **Chevron `›` na ponta direita** indica afford. de clique.
- **Indicador `‹fim do histórico›`** quando o scroll infinito acaba.
- **Busca local** (#ID, valor, forma, operador) sobre as vendas já
  carregadas — não recarrega.

## Acessibilidade

- `role="button"` + `tabIndex={0}` nas linhas; Enter/Space abrem o modal.
- `:focus-visible` com anel âmbar nas linhas.
- Modal: `role="dialog"` `aria-modal="true"` `aria-labelledby`.
- ESC fecha; backdrop click fecha (com confirmação se o motivo estiver
  preenchido).
- Foco inicial no `Fechar`; **focus trap** entre os elementos do diálogo
  (Tab/Shift+Tab); foco volta para a linha de origem ao fechar.
- `body.overflow=hidden` enquanto o modal está aberto.
- Cancelamento exige confirmação explícita + `motivo` com `minLength=2`.

## Responsivo

- Modal em desktop: 780px, centralizado, com `max-h: calc(100vh - 2rem)`.
- Em ≤640px: modal fica colado embaixo (`align-self: flex-end`), border-
  radius só no topo (sheet style), padding interno reduzido, table com
  fontes menores. Form de cancelamento empilha verticalmente.
- Tabela da lista usa `overflow-x: auto` se faltar largura.

## Design system

Tudo via tokens existentes:
- `dragon-glass-card` (modal) + `backdrop-filter: blur(18px)`.
- `app-badge-positive/-danger/-warn` para status.
- `app-btn-danger/-neutral` no rodapé.
- `gerente-fin-row-hover`, `gerente-fin-muted`, `gerente-fin-cell` para a
  tabela.
- Foco usando `--accent` em `box-shadow` (amber halo).
- `prefers-reduced-motion`: já honrado pelos keyframes existentes em
  `components.css`; o modal usa `transform`/`opacity` simples.

## i18n

Todas as labels usam `m.gerente.*` e `m.comum.*` — sem strings hardcoded.
Se faltar `m.comum.fechar`, o componente cai em `'Fechar'` como fallback.

## Arquivos do mock (apenas para a demo HTML)

- `mock-data.jsx`, `VendasList.jsx`, `VendaDetalheModal.jsx`,
  `vendas-melhorada.css`, `index.html`.

Estes não vão para produção — servem só para visualizar a interação no
browser, sem precisar do Supabase. A versão de produção mora nos
arquivos `.tsx`/`.ts` ao lado.
