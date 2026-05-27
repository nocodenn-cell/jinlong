# Parte 1 — Fornecedores + Contas a Pagar

Duas novas rotas no painel gerente. Ambas seguem o padrão dos UI kits
anteriores: demo HTML interativa + arquivos `.tsx` prontos para drop-in.

## 1) Fornecedores — `/gerente/fornecedores`

Rota **nova** (não existe no repo). CRUD completo + ações em lote.

**Pasta `ui_kits/fornecedores-page/`:**

| Arquivo | O que é |
|---|---|
| `index.html` + `*.jsx` + `fornecedores.css` | Demo interativa |
| `page.tsx` | Server component — busca primeira página |
| `FornecedoresListClient.tsx` | Lista, busca debounced, filtros (Todos / Ativos / Inativos), seleção em lote, scroll infinito |
| `FornecedorEditarModal.tsx` | Modal criar/editar com seção de endereço (CEP + logradouro + nº + complemento + bairro + cidade + UF) |
| `actions.ts` | Server actions: `buscarFornecedoresPaginadosAction`, `salvarFornecedorAction`, `excluirFornecedorAction`, `bulkAtivarFornecedoresAction`, `bulkExcluirFornecedoresAction` |
| `i18n.additions.ts` | Chaves `m.fornecedores.*` em PT + ZH |

### Schema esperado (Supabase)

```sql
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('PF','PJ')),
  documento text not null unique,         -- só dígitos
  email text,
  telefone text,
  contato_pessoa text,
  categoria text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  endereco_cep text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index fornecedores_nome_idx on fornecedores (nome);
create index fornecedores_documento_idx on fornecedores (documento);
```

### Regras
- **Exclusão bloqueada** se o fornecedor tem contas a pagar com status
  `PENDENTE` ou `PARCIAL`. Mensagem específica orienta o usuário a
  quitar/cancelar antes.
- **Bulk excluir** roda a mesma verificação por linha — informa quantos
  foram bloqueados quando a operação é parcial.
- **CNPJ/CPF duplicado** retorna erro amigável (`Já existe um fornecedor
  com este documento.`).

---

## 2) Contas a pagar — `/gerente/financeiro/contas-pagar`

Rota **nova** (irmã da `/gerente/financeiro` que hoje só cobre
contas_receber). Listagem com KPIs, filtros, modal de pagamento e
exportação CSV. Parcelas geradas pela importação de NF-e aparecem aqui
automaticamente (campos `nfe_numero` + `nfe_importacao_id`).

**Pasta `ui_kits/contas-pagar-page/`:**

| Arquivo | O que é |
|---|---|
| `index.html` + `*.jsx` + `contas-pagar.css` | Demo interativa (30 contas mock) |
| `page.tsx` | Server component — busca contas + fornecedores ativos |
| `ContasPagarListClient.tsx` | Lista, KPIs, filtros (período mês/ano + fornecedor + status), exportar CSV, scroll infinito |
| `PagamentoModal.tsx` | Modal pagamento total/parcial — valor grande em âmbar, 5 formas (Dinheiro / PIX / Cartão / Boleto / Transferência), data + observação |
| `actions.ts` | Server actions: `buscarContasPagarAction`, `registrarPagamentoAction`, `cancelarContaPagarAction`, `exportarContasPagarParaCSVAction` |
| `i18n.additions.ts` | Chaves `m.contas_pagar.*` em PT + ZH |

### Schema esperado (Supabase)

```sql
create type conta_pagar_status as enum
  ('PENDENTE','PARCIAL','PAGO','ATRASADO','CANCELADO');

create table contas_pagar (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id),
  descricao text not null,
  valor_total numeric(14,2) not null,
  valor_pago numeric(14,2) not null default 0,
  vencimento timestamptz,
  status conta_pagar_status not null default 'PENDENTE',
  nfe_numero text,
  nfe_importacao_id uuid,                   -- aponta para a importação de origem
  cancelamento_motivo text,
  cancelamento_em timestamptz,
  criado_em timestamptz not null default now()
);

create table contas_pagar_pagamentos (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas_pagar(id) on delete cascade,
  valor numeric(14,2) not null,
  forma text not null,
  data_pagamento timestamptz not null default now(),
  observacao text,
  criado_em timestamptz not null default now()
);
```

### RPC esperada

A `registrarPagamentoAction` chama esta função (cria + atualiza atomicamente):

```sql
create or replace function registrar_pagamento_contas_pagar(
  p_conta_id uuid,
  p_valor numeric,
  p_forma text,
  p_data timestamptz,
  p_observacao text
) returns void
language plpgsql
as $$
declare v_total numeric; v_pago numeric;
begin
  insert into contas_pagar_pagamentos (conta_id, valor, forma, data_pagamento, observacao)
  values (p_conta_id, p_valor, p_forma, p_data, p_observacao);

  update contas_pagar set valor_pago = valor_pago + p_valor where id = p_conta_id
  returning valor_total, valor_pago into v_total, v_pago;

  update contas_pagar
    set status = case
      when v_pago >= v_total then 'PAGO'
      else 'PARCIAL'
    end
  where id = p_conta_id;
end;
$$;
```

### Job recomendado (não incluso aqui)

```sql
-- Marcar como ATRASADO automaticamente:
update contas_pagar set status = 'ATRASADO'
where status = 'PENDENTE' and vencimento < now();
```
Rode em cron Supabase a cada hora.

---

## 3) Integração — navegação + RLS

### `painelGerencialNav.ts` / `GERENTE_NAV_TOPICS`

Adicione duas entradas (procure o array que mapeia os links do
`GerenteHeaderNav.tsx`):

```ts
{ id: 'fornecedores', label: m.gerente.nav_fornecedores, href: '/gerente/fornecedores' },
{ id: 'contas_pagar', label: m.gerente.nav_contas_pagar, href: '/gerente/financeiro/contas-pagar' },
```

E inclua no `messages.{pt,zh}.ts`:
```ts
// gerente
nav_fornecedores: 'Fornecedores',  // 供应商
nav_contas_pagar: 'Contas a pagar', // 应付账款
```

### RLS (Supabase)

As tabelas precisam de policies espelhando as do `fornecedores` /
`contas_receber`. Sugestão:

```sql
alter table fornecedores enable row level security;
alter table contas_pagar enable row level security;
alter table contas_pagar_pagamentos enable row level security;

-- Leitura: gerente / dono / estoquista (estoquista só vê para conciliar NF-e)
create policy "leitura_gerente" on fornecedores for select
  using (auth.role_in('gerente','dono','estoquista'));
create policy "leitura_gerente" on contas_pagar for select
  using (auth.role_in('gerente','dono'));
create policy "leitura_gerente" on contas_pagar_pagamentos for select
  using (auth.role_in('gerente','dono'));

-- Escrita: só gerente/dono (mesma checagem feita em `assertGerenteOuDono`)
create policy "mutacao_gerente" on fornecedores for all
  using (auth.role_in('gerente','dono'))
  with check (auth.role_in('gerente','dono'));
-- (espelhe para contas_pagar e contas_pagar_pagamentos)
```

### Typecheck

Depois de aplicar `i18n.additions.ts` em ambos os módulos:

```bash
cd pdv-importados
pnpm typecheck
```

---

## Pendentes da Parte 2

- Relatório de vendas (avançado)
- Configurações da loja (3 abas)
- Categorias (CRUD completo)

Aguardando seu OK para seguir.
