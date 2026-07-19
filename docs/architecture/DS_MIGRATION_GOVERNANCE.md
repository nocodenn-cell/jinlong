# Design System — Governança de migração (Fase 2 · Onda 3+)

## Princípio inegociável

Migrar tela = **somente infraestrutura visual**.  
Auth, fluxos, validações, rotas, i18n, regras de negócio e atalhos **não mudam**.

## Checklist obrigatório (todo PR)

Se **qualquer** item falhar, o PR **não entra**.

- [ ] Usa apenas componentes do DS (`Button`, `Field`/`forms/*`, `DataTable`, `feedback/*`, `DragonModal`)
- [ ] Não adiciona CSS novo em telas (só tokens / `styles/ds/*` / classes utilitárias do Tailwind mapeadas a tokens)
- [ ] Não adiciona cores hardcoded (`#…`, `amber-400`, `slate-700` crus)
- [ ] Não altera regras de negócio / auth / validações / rotas
- [ ] Antes/depois anexado (screenshot da tela migrada)
- [ ] `npx tsc --noEmit` (ou `npm run typecheck`) OK
- [ ] Smoke da tela OK (abrir, interação crítica, sem regressão óbvia)

## Ordem de migração

1. Login  
2. PDV (1ª passagem — sem polish)  
3. Dashboard  
4. **Catálogo** — módulo único (Produtos + Categorias de produtos + Fornecedores)  
5. **Clientes** — valida `CrudListShell` genérico (Onda 6)  
6. **Estoque** — teste definitivo do DS (movimentos + kardex · Onda 7)  
7. Financeiro  
8. Funcionários  
9. Configurações  
10. Implantação  
11. Provisionamento  
12. PDV (polish final)

> Não migrar Produtos / Categorias / Fornecedores como frentes separadas.  
> O Catálogo é a biblioteca de referência CRUD para as ondas seguintes.

### Regra de componentes (Onda 6+)

Antes de criar UI específica de módulo, perguntar:

> Esse caso serve também para Estoque, Financeiro ou Funcionários?

Se sim → DS. Se não → composição inline com tokens; zero CSS de tela.

Métrica em `check:ds-coverage`: **componentes exclusivos por módulo** (tendendo a zero).

## Burndown legado — dívida nunca sobe

```bash
cd pdv-importados && npm run check:ds-burndown
```

- Snapshot atual: `pdv-importados/reports/ds-legacy-burndown.json`
- Teto (baseline): `pdv-importados/reports/ds-legacy-burndown.baseline.json`

**Regra objetiva (Fase 2):** nenhum PR pode aumentar `hits` de qualquer métrica do burndown em relação ao baseline. O check **falha (exit 1)** se houver regressão.

Atualizar o baseline só após redução genuína:

```bash
npm run check:ds-burndown -- --write-baseline
```

Aliases (`.app-btn-*`, `GerenteTable` shim) só saem quando o burndown das métricas relevantes estiver em **0**.

## Screenshots

Para cada tela migrada, anexar no PR:

| | |
|---|---|
| Antes | estado atual em staging/local |
| Depois | mesmo fluxo pós-migração |

O operador **não deve precisar reaprender** a tela.
