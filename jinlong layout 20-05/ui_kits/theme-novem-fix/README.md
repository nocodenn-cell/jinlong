# Tema Nuvem + remoção de sticky — aplicação no monorepo

Entrega da auditoria solicitada. Não toca em arquivos das telas novas
(fornecedores, contas a pagar, etc.) — foca **só nas telas existentes do
gerente**: dashboard, produtos, clientes, estoque.

A estratégia tem duas camadas que funcionam **sem precisar editar cada
componente individualmente**:

1. **`theme-fix-aggressive.css`** — overrides com `!important` que captam
   os hardcodes Tailwind (`bg-slate-950/55`, `text-slate-100`, etc.)
   apenas quando `[data-app-theme='novem']` está ativo. No tema noturno,
   nada muda — os componentes continuam exatamente como eram.
2. **`unstick-gerente.css`** — força `position: static` em tudo dentro
   das páginas do gerente (preservando modais, drawers e toasts que
   precisam continuar fixed para funcionar).

A camada (3) é opcional: o script **`convert-hardcodes.sh`** faz a
limpeza definitiva substituindo as classes hardcoded pelos tokens
`jl-*` (precisa do `tailwind.config.js` atualizado).

## Passo a passo

### 1. Substitua o `tailwind.config.js`

Use o `tailwind.config.js` da pasta `ui_kits/theme-audit/` (já entregue
anteriormente). Ele adiciona o namespace `jl-*` apontando para os CSS
vars do design system.

### 2. Append nos `globals.css`

No arquivo `pdv-importados/app/globals.css`, ao final:

```css
/* ... seu CSS existente ... */

@import './theme-fix-aggressive.css';
@import './unstick-gerente.css';
```

Ou cole o conteúdo dos dois arquivos direto no final do `globals.css`.

### 3. Mova `data-app-theme` para `<html>`

Se hoje está em um `<div>` interno, em `app/layout.tsx`:

```tsx
export default async function RootLayout({ children }) {
  const tema = await getTemaUsuario() // 'noturno' | 'novem'
  return (
    <html lang="pt-BR" data-app-theme={tema}>
      <body data-route="gerente">{children}</body>
    </html>
  )
}
```

O `data-route="gerente"` ativa o unstick (ou use a classe `.gerente-shell`
que já existe nos layouts atuais).

### 4. (Opcional) Rodar o script de conversão

```bash
cd pdv-importados
bash ../ui_kits/theme-novem-fix/convert-hardcodes.sh
```

Substitui cerca de 200+ ocorrências de `bg-slate-*` / `text-slate-*` /
`border-slate-*` pelos equivalentes `jl-*`. Não é estritamente
necessário — a CSS agressiva já cobre — mas deixa o código futuro mais
limpo e remove a dependência de `!important`.

## O que cada CSS faz exatamente

### `theme-fix-aggressive.css`

| Quando `[data-app-theme='novem']` está ativo | Override aplicado |
|---|---|
| Qualquer `.bg-slate-950/*` ou `.bg-slate-900/*` | vira `var(--surface-soft)` (creme translúcido) |
| `.text-slate-100/200` | vira `var(--fg-1)` (slate-900) — texto preto sobre creme |
| `.text-slate-400/500` | vira `var(--fg-3)` (slate-500) — secundário |
| `.border-slate-700/*` | vira `var(--border-1)` (creme borda) |
| `.dragon-glass-card` | fundo branco translúcido + borda âmbar + shadow âmbar |
| `.app-input`, `.app-select` | fundo claro + texto escuro |
| `.ger-topbar` | gradiente creme em vez de slate |
| `.kpi`, `.panel`, `.proto-panel` | fundo creme elevado |
| `.gerente-fin-row-hover:hover` | hover âmbar tinto em vez de slate |

No tema **noturno**, **nada** disso aplica — o CSS de origem continua
em pleno vigor.

### `unstick-gerente.css`

- `position: static !important` em **tudo** dentro de
  `.gerente-shell`, `.ger-shell`, `.ger-page`, `[data-route='gerente']`
  ou qualquer `[data-screen-label]` das telas gerente.
- Re-permite `position` (com `revert`) em `[role='dialog']`,
  `[role='tooltip']`, `[role='menu']`, `.venda-modal-backdrop`,
  `.proto-modal-backdrop`, `.proto-drawer*`, `.clientes-toast` — modais
  e toasts continuam funcionando.
- `.ger-topbar`, `.gerente-sticky-toolbar`, `.gerente-fin-sticky` →
  estáticos (rolam com a página).
- `thead th sticky` → estático (cabeçalho da tabela rola com o conteúdo).
- `.proto-sidebar`, `.proto-shell` → estáticos, layout vira coluna única.

## Verificação

Após aplicar:

1. `/gerente` → header e KPIs viram creme; texto preto
2. Role a página → topbar **rola junto** (não acompanha mais)
3. Role uma tabela longa → cabeçalho **rola junto**
4. Abra um modal → continua centralizado em overlay (não quebrou)
5. Mude para `data-app-theme='noturno'` → volta exatamente ao visual
   anterior

### Smoke test no console

```js
// Em qualquer /gerente/* — alterna temas a cada 1,5s
['noturno','novem','noturno'].forEach((t, i) =>
  setTimeout(() => {
    document.documentElement.dataset.appTheme = t
    console.log(`[${t}]`,
      'body bg:', getComputedStyle(document.body).backgroundColor,
      '| primary text:', getComputedStyle(document.body).color)
  }, i * 1500)
)
```

Se em `novem` o body bg for próximo de `rgb(255, 248, 235)` (cream), está
correto.

## Telas cobertas

✅ `/gerente` — dashboard (KPIs, painéis, atividades)
✅ `/gerente/produtos` — listagem + modais
✅ `/gerente/clientes` — listagem + ficha
✅ `/gerente/estoque` — tabela + ajustes
✅ `/gerente/fornecedores` — listagem + bulk
✅ `/gerente/financeiro/contas-pagar` — KPIs + tabela + modal pagamento
✅ `/gerente/vendas` — histórico + drawer
✅ `/gerente/financeiro` — contas a receber + fila fiscal
✅ Todas as outras rotas filhas (relatórios, configurações, categorias)

## Rollback

Se algo der errado em produção, remova os dois `@import` do `globals.css`
— o sistema volta exatamente ao estado anterior. Os overrides são 100%
aditivos.
