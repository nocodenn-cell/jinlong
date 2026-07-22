# Onda 4 — Dashboard (2ª referência visual)

**Papel:** Login = identidade · PDV = operação · **Dashboard = gestão**.

## Escopo

### Permitido
PageHeader · MetricCard · Card/SectionCard · Button · DataTable · Loading · EmptyState · ErrorState · Skeleton · Tipografia · Espaçamento · Focus · Tokens · Badges · FilterBar

### Proibido
SQL/RPC · KPIs · cálculos · filtros (lógica) · gráficos (dados/libs) · Server Actions · regras · permissões

## Consolidação de componentes

| Antes | Depois |
|---|---|
| MetricCard forks / StatCard | `admin-v2/MetricCard` (+ alias `StatCard`) |
| PageHeader tipografia ad hoc | tokens `text-h1/h2/body` |
| FilterBar `text-[Npx]` | tokens + Select DS |
| `<table>` raw pedidos | `DataTable` |
| banners de erro artesanais | `ErrorState` |

## Aceite

- [x] Zero `.app-btn-*` no Dashboard  
- [x] Zero `GerenteTable` no Dashboard  
- [x] Zero `text-[Npx]` / `text-amber-*` no Dashboard (chrome)  
- [x] Zero CSS específico da tela  
- [ ] Screenshots Antes/Depois (anexar no PR)  
- [ ] Smoke: Login → Dashboard → pills → KPIs → tabela → loading/vazio/erro  
- [ ] `npm run typecheck`  
- [ ] `npm run check:ds-burndown` + comparar com relatório anterior  
- [ ] `npm run check:ds-coverage`

## Cobertura mensurável

```bash
npm run check:ds-burndown
npm run check:ds-coverage
```

Acompanhar: % telas migradas · % TSX com import DS · hits legado · exceções aprovadas.

## Próxima onda

Catálogo (Produtos / Categorias / Fornecedores) — substituições de componentes, não redesenho.
