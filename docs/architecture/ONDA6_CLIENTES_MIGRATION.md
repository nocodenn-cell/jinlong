# Onda 6 — Clientes (validação do CrudListShell)

## Objetivo

Não “migrar Clientes” como tela isolada.

**Validar que `CrudListShell` é genérico** — o usuário deve perceber o mesmo sistema do Catálogo, gerenciando outra entidade.

## Pergunta de governança

Se surgir necessidade de um componente específico para Clientes:

> Esse caso serve também para Estoque, Financeiro ou Funcionários?

- **Sim** → o componente pertence ao DS (`components/ui/*`), não ao módulo.
- **Não** → justificar exceção documentada; preferir composição inline com tokens.

## Critérios de aceite

| Critério | Status |
|---|---|
| Zero CSS específico de Clientes | ✓ |
| Zero novos componentes exclusivos | ✓ (hosts ListClient + Modal apenas) |
| Mesmo header (`PageHeader`) | ✓ |
| Mesmo fluxo de busca (`SearchInput`) | ✓ |
| Mesmo shell (`CrudListShell` + `PageActions`) | ✓ |
| Mesma tabela (`DataTable`) | ✓ |
| Mesmo padrão de ações | ✓ |
| Mesmo modal (`DragonModal` + `Field`/`Input`) | ✓ |
| Mesmo `EmptyState` / `Loading` | ✓ |

Domínio preservado: LGPD, crediário (barra de progresso com tokens), masks, infinite scroll, Server Actions.

## Arquivos tocados (chrome only)

- `app/gerente/clientes/ClientesListClient.tsx`
- `app/gerente/clientes/ClienteEditarModal.tsx`

Não criados: `ClienteBadge`, `ClienteCrediarioBar`, `clientes.module.css`, etc.

## Métrica nova

```bash
cd pdv-importados && npm run check:ds-coverage
```

Indicador **Componentes exclusivos por módulo** → objetivo: tendendo a zero.

Hosts permitidos (não contam): `page.tsx`, `*ListClient.tsx`, `*EditarModal.tsx` (e equivalentes documentados).

## Próxima sequência

1. Estoque  
2. Financeiro  
3. Funcionários  
4. Configurações  
5. Implantação  
6. Provisionamento  
7. PDV (polish final)  
