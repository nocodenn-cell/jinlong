# Design System Contract — Fase 2 · Onda 2

**Status:** fundação congelada (tokens + primitivos).  
**Escopo:** apenas UX/UI — sem features, domínio, migrations, RLS/Auth/Fiscal.

## Porta única

```
pdv-importados/styles/tokens/
  colors.css
  spacing.css
  radius.css
  shadows.css
  typography.css
  motion.css
  z-index.css
  focus.css
  aliases.css      ← ponte legado (--jl-*, --fp-*, --accent…)
  index.css        ← única entrada
```

Camada de componentes CSS: `styles/ds/` (carregada **depois** de oriental/jl).

## Primitivos oficiais

| Área | Import |
|---|---|
| Button | `@/components/ui/button` |
| Forms | `@/components/ui/forms` (Field, Input, Textarea, Select, Checkbox, Radio, Switch, SearchInput, Autocomplete) |
| Table | `@/components/ui/DataTable` |
| Feedback | `@/components/ui/feedback` (Loading, EmptyState, ErrorState, SuccessState, RetryButton, Skeleton) |

### Deprecated (shim até migração de telas)

- Classes `.app-btn-*` → mesma aparência do Button; **não usar em código novo**
- `GerenteTable` → alinhado visualmente; **novas listagens usam DataTable**
- `components/forms/FormField` → alias de `Field`

## Tipografia (Tailwind)

`text-display` · `text-h1` · `text-h2` · `text-h3` · `text-title` · `text-subtitle` · `text-body` · `text-small` · `text-caption` · `text-mono`

**Proibido em código novo:** `text-[Npx]`, cores Tailwind cruas (`amber-400`, `slate-700`…), hex em TSX, `rounded-[Npx]`.

## Focus

Um anel: `var(--focus-ring-shadow)` / utilitário `.fp-focus-ring` / classe Tailwind `shadow-focus`.

## Radius

`--radius-sm` (4) · `--radius-md` / control (6) · `--radius-lg` / card (8) · `--radius-xl` / panel (12) · `--radius-full`

## Regra de PR (Onda 2+)

> Se um PR tocar em uma tela e adicionar CSS novo / hex / tipografia arbitrária em vez de reutilizar o Design System, **deve ser rejeitado**.

## Ordem de migração de telas

1. ~~Login~~ → feito (Onda 3)  
2. ~~PDV — primeira passagem~~ → feito (Onda 3; sem polish)  
3. ~~Dashboard~~ → feito (Onda 4 — 2ª referência / gestão)  
4. Catálogo (Produtos, Categorias, Fornecedores)  
5. Clientes  
6. Estoque  
7. Financeiro  
8. Funcionários  
9. Configurações  
10. Implantação  
11. Provisionamento  
12. **PDV — polish final**

Governança: `DS_MIGRATION_GOVERNANCE.md`  
Burndown: `npm run check:ds-burndown`  
Cobertura: `npm run check:ds-coverage`

## Hubs de navegação (Sprint 6 · IDS)

Telas que tratam o **mesmo domínio operacional** compartilham abas horizontais (`AdminHubTabNav` / `FinanceiroHubNav`), definidas em `lib/navigation/*HubNav.ts`. A sidebar lista só o **hub** (ex.: Catálogo, Estoque, Financeiro); taxonomias e fluxos satélite ficam nas abas — **sem** alterar rotas SSOT nem CRUD oficial.

| Hub | Abas | Rotas canônicas (inalteradas) |
|-----|------|-------------------------------|
| Catálogo | Produtos · Categorias · Marcas | `/admin/catalogo`, `/admin/categorias-produtos`, `/admin/marcas-produtos` |
| Estoque | Saldos · Recebimento · Transferências · NF-e · Etiquetas | `/admin/estoque/*` |
| Financeiro | A receber · A pagar · Fila fiscal · Categorias | `/admin/financeiro?tab=*`, `/admin/categorias-financeiras` |

Componentes: `CatalogoHubNav`, `EstoqueHubNav`, `FinanceiroHubNavShell` em `components/ui/admin-v2/`.

## Estados obrigatórios em todo primitivo

Loading · Disabled · Error · Success · Readonly (onde aplicável) · Focus · Hover · Active
