# Jīn Lóng — Gerente UI kit

Recreation of the **manager dashboard** as it ships in
`pdv-importados/app/gerente`. A daily-summary view with KPI cards, a
faturamento-by-hour sparkline, the *estoque crítico* (low-stock) panel, and
the *atividades recentes* (activity feed). Top app bar with the brand
wordmark + nav and a sign-out chip.

## Files

| File | Role |
|---|---|
| `index.html` | Full dashboard view. |
| `GerenteTopBar.jsx` | Brand wordmark + nav links + user/sign-out chip. |
| `KPICard.jsx` | Metric card with icon, label, value, trend delta. |
| `Sparkline.jsx` | SVG hourly faturamento sparkline + a peak chip. |
| `StockCriticalPanel.jsx` | Low-stock list with deficit deltas. |
| `ActivityFeed.jsx` | Recent activity timeline. |

## Real product copy

| Surface | String |
|---|---|
| KPIs | `Faturamento hoje` · `Ticket médio hoje` · `Vendas hoje` · `Margem hoje` |
| Delta footer | `vs. dia anterior` · `vs. semana anterior` |
| Week section | `Resumo da semana` |
| Sparkline | `Faturamento por hora · hoje` · `Pico hoje:` |
| Stock panel | `Estoque crítico` · `Itens abaixo do mínimo · ação recomendada` · `Ver todos →` |
| Activity panel | `Atividades recentes` · `Últimos eventos no caixa, estoque e financeiro` |
