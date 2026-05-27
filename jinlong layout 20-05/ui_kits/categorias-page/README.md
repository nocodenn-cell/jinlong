# Parte 2 — Relatório de vendas + Configurações + Categorias

Entrega final. Três telas drop-in para o monorepo `pdv-importados`.

---

## 1) Relatório de vendas (avançado) — `/gerente/relatorios/vendas`

Subrota nova abaixo de `/gerente/relatorios/`. Pasta:
**`ui_kits/relatorio-vendas-page/`** (já com demo HTML + drop-in TSX).

Ver `README.md` na pasta para detalhes. Requer **`pnpm add recharts`**.

---

## 2) Configurações da loja — `/gerente/configuracoes`

Substitui a stub atual. Tudo em **`ui_kits/configuracoes-page/`**:

| Arquivo | O que é |
|---|---|
| `page.tsx` | Server component (carrega `lojas` + `pdv_config`) |
| `ConfiguracoesClient.tsx` | 3 abas: Loja / Fiscal / Preferências |
| `actions.ts` | `atualizarDadosLojaAction`, `atualizarConfiguracoesPdvAction`, `uploadLogoLojaAction` |
| `i18n.additions.ts` | Chaves `m.configuracoes.*` em PT + ZH |

### Schema esperado

```sql
create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text not null unique,
  inscricao_estadual text,
  telefone text,
  email text,
  logo_url text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  endereco_cep text
);

create type regime_tributario as enum
  ('SIMPLES_NACIONAL','LUCRO_PRESUMIDO','LUCRO_REAL','MEI');

create table if not exists pdv_config (
  loja_id uuid primary key references lojas(id) on delete cascade,
  cfop_padrao text not null default '5102',
  cst_padrao text not null default '00',
  regime_tributario regime_tributario not null default 'SIMPLES_NACIONAL',
  auto_enqueue_fiscal boolean not null default true,
  idioma_padrao text not null default 'pt' check (idioma_padrao in ('pt','zh')),
  tema_padrao text not null default 'noturno' check (tema_padrao in ('noturno','novem')),
  imprimir_cupom_auto boolean not null default true,
  formato_impressao text not null default 'TERMICA' check (formato_impressao in ('TERMICA','A4'))
);
```

### Abas entregues

1. **Loja** — nome, CNPJ, IE, telefone, e-mail, upload de logo (reusa o
   bucket `produto-imagens`), seção de endereço completa.
2. **Impostos e fiscal** — CFOP, CST (select com lista permitida), regime
   tributário, toggle `auto_enqueue_fiscal`.
3. **Preferências** — idioma padrão (pt/zh), tema (noturno/novem),
   impressão automática (sim/não), formato (Térmica/A4).

a11y: `role="tablist"` + `role="tab"`/`tabpanel`, `aria-selected`,
`aria-controls`/`aria-labelledby` interligados.

---

## 3) Categorias (CRUD) — `/gerente/categorias`

Rota **nova** (não existe). Pasta **`ui_kits/categorias-page/`**:

| Arquivo | O que é |
|---|---|
| `page.tsx` | Server component (`listarCategoriasAction`) |
| `CategoriasListClient.tsx` | Tabela + modal create/edit |
| `actions.ts` | `listarCategoriasAction`, `salvarCategoriaAction`, `excluirCategoriaAction` |
| `i18n.additions.ts` | Chaves `m.categorias.*` em PT + ZH |

### Schema esperado

```sql
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- A coluna `produtos.categoria_id` já existe e é usada para contar
-- produtos vinculados (a tela bloqueia exclusão se > 0).
```

### Regras

- **Bulk count** — uma única query batch conta produtos vinculados a todas
  as categorias listadas (evita N+1).
- **Exclusão bloqueada** se há produtos vinculados — o botão fica disabled
  e o `confirmMessage` muda para explicar.
- **Nome único** — Supabase retorna `23505` e a action vira mensagem
  amigável "Já existe uma categoria com este nome".

---

## Integração — navegação

Adicione em `painelGerencialNav.ts` / `GERENTE_NAV_TOPICS`:

```ts
{ id: 'relatorios_vendas', label: m.gerente.nav_relatorios_vendas, href: '/gerente/relatorios/vendas' },
{ id: 'configuracoes', label: m.gerente.nav_configuracoes, href: '/gerente/configuracoes' },
{ id: 'categorias', label: m.gerente.nav_categorias, href: '/gerente/categorias' },
```

E em `messages.{pt,zh}.ts` (root `gerente`):
```ts
nav_relatorios_vendas: 'Relatório de vendas',  // 销售报表
nav_configuracoes: 'Configurações',            // 设置
nav_categorias: 'Categorias',                  // 类别
```

## RLS (Supabase)

```sql
alter table lojas enable row level security;
alter table pdv_config enable row level security;
alter table categorias enable row level security;

-- Leitura: qualquer usuário autenticado da loja (até caixa precisa)
create policy "leitura_publica_autenticados" on lojas
  for select using (auth.role() = 'authenticated');
create policy "leitura_publica_autenticados" on pdv_config
  for select using (auth.role() = 'authenticated');
create policy "leitura_publica_autenticados" on categorias
  for select using (auth.role() = 'authenticated');

-- Escrita: somente gerente/dono (mesma checagem feita em assertGerenteOuDono)
create policy "mutacao_gerente" on lojas
  for all using (auth.role_in('gerente','dono'))
  with check (auth.role_in('gerente','dono'));
-- (espelhe para pdv_config e categorias)
```

## Typecheck

Depois de aplicar todos os `i18n.additions.ts` da Parte 2:

```bash
cd pdv-importados
pnpm add recharts          # relatório de vendas
pnpm typecheck
```

---

## Resumo das duas partes

| Tela | Rota | Status |
|---|---|---|
| Fornecedores | `/gerente/fornecedores` | ✅ Parte 1 |
| Contas a pagar | `/gerente/financeiro/contas-pagar` | ✅ Parte 1 |
| Relatório de vendas | `/gerente/relatorios/vendas` | ✅ Parte 2 |
| Configurações | `/gerente/configuracoes` | ✅ Parte 2 |
| Categorias | `/gerente/categorias` | ✅ Parte 2 |
