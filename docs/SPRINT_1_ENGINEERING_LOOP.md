# Sprint 1 — Engineering Loop (hot-path)

| Campo | Valor |
|--------|--------|
| **Abertura** | 2026-08-07 (após aceite Sprint 0) |
| **RFCs** | [`UI_UX_RFC.md`](./UI_UX_RFC.md) 002–006 |
| **Branch** | `feat/sprint-ux-go-live` (reuso cloud; não uma branch/missão) |
| **Estado** | **FECHADA** (2026-08-07) — DoD abaixo |

## Escopo (hot-path)

| ID | Entrega | Status |
|----|---------|--------|
| UX-P0-01 / 02 | Vendas FilterBar + título período + Empty/Error DS + PageShell | ✅ |
| UX-P0-03 | Transferências lookup async (sem 500) + PageShell | ✅ |
| UX-P1-06 / 07 | Catálogo 1 primary + menu Importar + PageShell/CrudListShell | ✅ |
| UX-P1-10 | Recebimento PageShell + breadcrumb + InlineAlert | ✅ |
| UX-P1-02 | KeyHint Finalizar (já S0) | ✅ confirmado |
| UX-P1-03 | F3 = consulta (RFC-005; não add-to-cart) | ✅ documentado |
| UX-P1-04 | Realce última linha carrinho | ✅ |
| UX-P1-05 | Ícone barcode na busca | ✅ |

## Ciclos

1. **Aceite S0 + RFC + Vendas** — DoD §3.3; FilterBar status/pagamento; EmptyState.
2. **Catálogo** — hierarquia CTA; PageShell/CrudListShell.
3. **Estoque satélites** — Transferências async; Recebimento chrome DS.
4. **PDV polish** — barcode + realce; F3 preservado.

## DoD Sprint 1 (fechamento)

- [x] Itens da tabela acima ✅ no código
- [x] RFCs 002–006 registradas
- [x] `check:ds-sprint0` + typecheck + lint (0 errors) + vitest UI relevantes verdes
- [x] Revisão crítica UX: chips duplicados removidos em Vendas; 1 primary no Catálogo; Transferências sem payload 500; F3 preservado
- [x] Backlog/roadmap marcam S1 fechada; **S2 bloqueada** até aceite explícito

## Notas de infra

CI `ci-pdv-importados` só dispara em PR → `main` neste repo; validação local + gates do módulo são a evidência operacional enquanto o base for `chore/node22-alignment`.
