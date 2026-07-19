# Onda 5 — Catálogo (módulo único)

## Objetivo

Transformar o **Catálogo** na biblioteca de referência visual para todos os CRUDs do ERP.

Tratado como **um módulo**, não três frentes:

| Superfície | Rota |
|---|---|
| Produtos | `/admin/catalogo` |
| Categorias de produtos | `/admin/categorias-produtos` |
| Fornecedores | `/admin/fornecedores` |

Categorias financeiras ficam para a onda **Financeiro**.

## Contrato CRUD compartilhado

Todas as listagens do Catálogo usam o mesmo chrome:

- `PageHeader` + `PageActions`
- `CrudListShell` (toolbar · bulk · tabela · footer)
- `SearchInput` / filtros
- `DataTable`
- `EmptyState` / `Loading` / `ErrorState`
- `Button` / `Field` / `Dialog` (`DragonModal`) / `Badge`
- Modal de edição + exclusão confirmada

Se Produtos e Fornecedores parecerem sistemas diferentes, a migração não está concluída.

## Critérios de aceite (superfícies do módulo)

Nas pastas do Catálogo (admin + list client de fornecedores):

- Zero `.app-btn-*`
- Zero `GerenteTable`
- Zero `<table>` manual de listagem (grade bulk de importação documentada como exceção)
- Zero `text-[Npx]` novos
- Zero cores hardcoded de tipografia
- Zero CSS específico de tela (salvo exceções documentadas)

## Primários novos no DS

- `components/ui/admin-v2/PageActions.tsx`
- `components/ui/admin-v2/CrudListShell.tsx`
- `PageHeader` aceita `actions` opcional

## Governança

Nenhum PR da Fase 2 pode aumentar a dívida visual:

```bash
cd pdv-importados && npm run check:ds-burndown
```

Se `hits` > baseline → falha. Ver `DS_MIGRATION_GOVERNANCE.md`.

## Cobertura

```bash
cd pdv-importados && npm run check:ds-coverage
```

- Telas oficiais: Catálogo conta como **1/12** (módulo único).
- Meta secundária: % de TSX do app com imports DS + % nas superfícies do módulo Catálogo.

## Próxima sequência

1. Clientes  
2. Estoque  
3. Financeiro  
4. Funcionários  
5. Configurações  
6. Implantação  
7. Provisionamento  
8. PDV polish final  

## Exceções documentadas

| Item | Motivo |
|---|---|
| Grade editável em `ProdutosImportarModal` | Grid bulk colar/editar — não é listagem CRUD; permanece `<table>` até onda de importação |
| Form sections de produto (`text-caption` legado jl-*) | Dívida residual de form body; fora do chrome da listagem; próxima passagem no polish de catálogo |
