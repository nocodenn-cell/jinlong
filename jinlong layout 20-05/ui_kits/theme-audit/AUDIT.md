# Auditoria de tema — Jīn Lóng Design System

**Problema observado** (print do usuário): tema **Nuvem** ativado, mas
todo o conteúdo (KPIs, cards, fundo da página) continua em slate-escuro.
Só o header ficou creme.

**Diagnóstico**: três classes de violações em todo o monorepo —

1. **Atributo `data-app-theme` no lugar errado** (não está no `<html>`).
2. **Cores Tailwind hardcoded** ignoram os tokens semânticos do DS.
3. **Tokens shadcn** (`--background`, `--card`, `hsl(var(--…))`) não
   estão sincronizados com os tokens Jīn Lóng (`--surface`, `--bg-page`).

Os três arquivos de fix estão nesta pasta. Aplique nesta ordem:

## Passo 1 — Atualize o `tailwind.config.js`

Substitua o `tailwind.config.js` da raiz de `pdv-importados/` pelo arquivo
**`tailwind.config.js`** desta pasta. As mudanças são **aditivas**:
adicionei o namespace `jl-*` apontando para todos os CSS vars do DS:

```ts
'jl-surface', 'jl-surface-soft', 'jl-surface-elev',
'jl-fg-1', 'jl-fg-2', 'jl-fg-3',
'jl-border-1', 'jl-border-strong',
'jl-accent', 'jl-accent-strong', 'jl-accent-deep',
'jl-success', 'jl-danger', 'jl-warning'
```

A partir dali, `bg-jl-surface-soft` substitui `bg-slate-950/55` e
responde automaticamente ao tema.

## Passo 2 — Adicione `theme-fix.css` ao `globals.css`

Cole o conteúdo de **`theme-fix.css`** ao final de
`pdv-importados/app/globals.css` (ou crie um `theme-fix.css` importado lá).

Esse arquivo faz três coisas:

- Re-mapeia tokens shadcn (`--background`, `--card`, etc.) para os
  equivalentes Jīn Lóng em cada tema → `Card`, `Button`, `Badge` passam a
  respeitar Noturno ↔ Nuvem.
- Garante que `<html>` herda `var(--bg-page)`.
- Cria utilitários `.jl-surface-*`, `.jl-text-*`, `.jl-glass-backdrop` que
  são equivalentes a tokens — úteis quando você não quer Tailwind.

## Passo 3 — Confirme onde `data-app-theme` está sendo aplicado

O atributo precisa estar no **`<html>`** para o re-mapeamento funcionar
em modais, drawers e portais Radix (que renderizam fora da árvore React
visual):

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  const tema = await getTemaUsuario()    // 'noturno' | 'novem'
  return (
    <html lang="pt-BR" data-app-theme={tema}>
      <body>{children}</body>
    </html>
  )
}
```

Se hoje está em um `<div>` interno, mova para `<html>`. Para troca
client-side, atualize `document.documentElement.dataset.appTheme`.

## Passo 4 — Substitua os hardcodes (find & replace)

Rode este find & replace no codebase. As 6 telas que eu entreguei usam
essas classes; o restante do app pode usar variações próprias —
procure por todas e converta.

| Antes (hardcode) | Depois (token) |
|---|---|
| `bg-slate-950/55` | `bg-jl-surface-soft` |
| `bg-slate-950/45` | `bg-jl-surface-soft` |
| `bg-slate-900/55` | `bg-jl-surface` |
| `bg-slate-950/40` | `bg-jl-surface-soft/80` |
| `text-slate-100` | `text-jl-fg-1` |
| `text-slate-200` | `text-jl-fg-1` |
| `text-slate-300` | `text-jl-fg-2` |
| `text-slate-400` | `text-jl-fg-3` |
| `text-slate-500` | `text-jl-fg-3` |
| `border-slate-700/40` | `border-jl-border-1` |
| `border-slate-700/50` | `border-jl-border-strong` |
| `text-amber-400` | `text-jl-accent` |
| `text-amber-300` | `text-jl-accent` |
| `border-amber-400/45` | `border-jl-accent/45` |
| `bg-amber-400/15` | `bg-jl-accent/15` |
| `from-amber-300 to-amber-600` | `from-jl-accent to-jl-accent-deep` |
| `text-red-300` (com semântica) | `text-jl-danger` |
| `text-emerald-300` (com semântica) | `text-jl-success` |

Casos que **não** precisam mudar:
- Cores em ícones decorativos pequenos (`text-amber-400` num glyph
  estilizado tipo o `印` — tudo bem manter direto se for ornamental).
- Gradientes 100% âmbar para CTAs (`from-amber-300 to-amber-600 text-slate-900`)
  já funcionam em ambos os temas porque o âmbar é o accent comum.
- `text-slate-900` quando aplicado **em cima** de um fill âmbar (legível
  nos dois temas).

### Padrões inline (CSS-in-JS) — também há

Eu também usei muito `style={{ background: 'rgba(...)' }}` nos UI kits.
Esses precisam virar `style={{ background: 'var(--surface-soft)' }}`.
Lista completa nas 6 telas:

| Tela | Linhas afetadas (aprox.) |
|---|---|
| `fornecedores/FornecedoresListClient.tsx` | bulk-bar, avatares, badges |
| `fornecedores/FornecedorEditarModal.tsx` | inputs, toggle PF/PJ |
| `contas-pagar/ContasPagarListClient.tsx` | KPIs, filtros, barra de progresso |
| `contas-pagar/PagamentoModal.tsx` | input grande de valor, chips de valor |
| `estoque/EstoqueListClient.tsx` | toggle "só baixo", switch |
| `estoque/EstoqueAjusteModal.tsx` | toggle de operação, preview |
| `relatorios/vendas/RelatorioVendasClient.tsx` | tooltip Recharts (hardcoded #f1f5f9, etc) |
| `configuracoes/ConfiguracoesClient.tsx` | tabs, placeholder do logo |
| `categorias/CategoriasListClient.tsx` | header da modal, ícone Tag |

## Passo 5 — Recharts no tema claro

O `RelatorioVendasClient.tsx` que entreguei tem cores fixas no tooltip do
Recharts:

```tsx
// ❌ Antes
contentStyle={{
  background: 'rgba(2,6,23,0.95)',
  border: '1px solid rgba(148,163,184,0.38)',
  color: '#f1f5f9',
}}
```

Troque por:

```tsx
// ✅ Depois
contentStyle={{
  background: 'var(--surface-elev)',
  border: '1px solid var(--border-1)',
  color: 'var(--fg-1)',
}}
```

E na barra:
```tsx
// ❌ Antes
<Bar fill="#fbbf24" />
// ✅ Depois
<Bar fill="var(--accent)" />
```

## Passo 6 — Verificação manual

Depois de aplicar, abra cada uma destas rotas e clique no toggle
**Nuvem ↔ Noturno** — todas devem trocar suavemente:

- `/gerente` (dashboard — onde estava o bug do print)
- `/gerente/vendas`
- `/gerente/clientes`
- `/gerente/fornecedores`
- `/gerente/estoque`
- `/gerente/financeiro`
- `/gerente/financeiro/contas-pagar`
- `/gerente/relatorios/vendas`
- `/gerente/configuracoes`
- `/gerente/categorias`

**Smoke test recomendado** (cole no console em cada página):

```js
['noturno', 'novem'].forEach((t, i) => {
  setTimeout(() => {
    document.documentElement.dataset.appTheme = t
    console.log('tema:', t,
      'bg:', getComputedStyle(document.body).backgroundColor,
      'fg:', getComputedStyle(document.body).color)
  }, i * 1500)
})
```

Se os valores `bg`/`fg` não mudarem entre temas, há ainda um override em
algum lugar (algum componente com `bg-[#hex]` literal). Procure por
`bg-\[#`, `text-\[#`, e `border-\[#` no codebase.

## Resumo: o que cada arquivo desta pasta faz

| Arquivo | Aplicar onde | Resultado |
|---|---|---|
| `tailwind.config.js` | `pdv-importados/tailwind.config.js` (substitui) | Habilita `bg-jl-*`, `text-jl-*` |
| `theme-fix.css` | Append em `app/globals.css` | Re-mapeia tokens shadcn + base do `<html>` |
| `AUDIT.md` (este arquivo) | Documentação | Lista de substituições |

Após o passo 1–5, ative `data-app-theme='novem'` no `<html>` e o print do
usuário deve mostrar **TODA** a página em creme — não só o header.
