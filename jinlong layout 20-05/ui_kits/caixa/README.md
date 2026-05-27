# Jīn Lóng — Caixa UI kit

Recreation of the **PDV cashier** screen as it ships in
`pdv-importados/components/caixa/CaixaGridLayout.tsx` and the desktop
`pdv-local` Tauri app.

Layout: a fixed 7:3 split on desktop (cart left, payment right), an oriental
cloud-gradient background, and the function-key payment buttons that
operators learn by muscle memory.

## Files

| File | Role |
|---|---|
| `index.html` | Full caixa view — header, search, cart, payment column, live total. |
| `CaixaHeader.jsx` | Top strip — title, operator chip, caixa-id chip, clock, status pill. |
| `SearchBar.jsx` | The fat search input — barcode reader + free text. |
| `CartList.jsx` | Cart items with quantity stepper + remove. Empty state included. |
| `PaymentColumn.jsx` | Total + the three F-key payment buttons. |
| `caixa-extras.css` | A couple of caixa-only adornments (qty stepper, item card). |

## Real product copy

| Surface | String |
|---|---|
| Empty cart | `Carrinho vazio` · `Adicione produtos usando o campo de busca abaixo` |
| Search placeholder | `Buscar produto…` |
| Cart header | `Carrinho` |
| Operator chip | `Operador: João` |
| Caixa chip | `Caixa: 01` |
| Closed status | `⚠️ CAIXA FECHADO` |
| Payment buttons | `PIX (F8)` · `CARTÃO (F9)` · `DINHEIRO (F10)` |
| Total label | `Total:` |
| Item meta | `qty × R$ unit` |
