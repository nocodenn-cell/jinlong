# Clientes (gerente) — listagem + CRUD em modal

Nova página para `pdv-importados/app/gerente/clientes/page.tsx`. Segue o
mesmo padrão de `vendas` (server component → list client → modal) e usa só
componentes já existentes do design system.

## Visualizar
Abra `index.html` — versão interativa com 36 clientes mock (PF + PJ, com
crediário aberto para uns 13 deles), scroll infinito, busca, e modal de
criação/edição totalmente acessível.

## Drop-in no monorepo

Crie o diretório `pdv-importados/app/gerente/clientes/` e coloque dentro:

```
clientes/
  page.tsx                  ← server component (renderiza o list client)
  ClientesListClient.tsx    ← lista paginada + busca + ações
  ClienteEditarModal.tsx    ← modal criar/editar
  actions.ts                ← server actions (buscar / salvar / excluir)
```

E adicione as chaves de i18n de `i18n.additions.ts` aos arquivos
`pdv-importados/i18n/messages.{pt,zh}.ts` — todas as strings já estão
externalizadas em PT e ZH.

### Schema esperado (Supabase)

```sql
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('PF', 'PJ')),
  documento text not null unique,           -- só dígitos
  email text,
  telefone text,                            -- só dígitos
  endereco text,
  limite_crediario numeric(12,2) not null default 0,
  saldo_crediario numeric(12,2) not null default 0,
  ultima_compra timestamptz,
  criado_em timestamptz not null default now()
);
create index clientes_nome_idx on clientes (nome);
create index clientes_documento_idx on clientes (documento);
```

`saldo_crediario` é atualizado pelo fluxo de venda em crediário (fora do
escopo desta entrega) — o `excluirClienteAction` se recusa a apagar
cliente com saldo > 0.

## O que entrega

- **Header**: título + botão **+ Novo cliente** + busca live (debounce 280ms)
- **Tabela** (via `GerenteTable tone="dragon"`):
  - Nome (avatar com iniciais, badge PF/PJ, e-mail abaixo)
  - Documento (CPF/CNPJ mascarado)
  - Telefone (mascarado)
  - **Saldo crediário** com barra de progresso — vira degradê âmbar→imperial-red
    quando ≥ 70% do limite
  - Ações: editar (lápis) + excluir (lixeira) — ícones Lucide, ambos com
    `aria-label` específico do cliente
- **Modal único** para criar e editar:
  - Toggle PF / PJ (`role="radiogroup"`)
  - Campos: nome / razão social, CPF ou CNPJ, telefone, e-mail, endereço,
    limite de crediário
  - Máscaras formatam ao digitar; o que vai para o server action é só dígitos
  - Validação cliente (nome ≥ 2 char, CPF=11, CNPJ=14, e-mail regex,
    telefone ≥ 10 dígitos, limite ≥ 0) + server (em `actions.ts`)
  - ESC fecha, backdrop fecha — ambos com `confirm()` se o form estiver sujo
  - Focus trap, foco volta para a linha de origem ao fechar
- **Scroll infinito** via `IntersectionObserver` com `rootMargin: 300px`
  (mesma lógica de `VendasGerenteListClient`)
- **Toast** via `emitGerenteToast` para sucesso/erro

## Responsividade

- Em ≥ 760px: tabela tradicional com 5 colunas
- Em < 760px: linhas viram cards empilhados — cada `<td>` mostra um rótulo
  via `data-label` (`::before`) e os botões de ação ficam alinhados à
  esquerda. *(Aplicado pelo CSS na demo HTML; no Tailwind do TSX a tabela
  já é `overflow-x: auto` por padrão do `GerenteTable`, então decida se
  quer adicionar uma versão mobile dedicada.)*
- Modal: em ≤ 540px o grid 2 colunas vira 1 coluna e o modal cola no
  bottom (`items-end`).

## Acessibilidade

- Inputs com `aria-invalid`, `aria-describedby` apontando para a mensagem
  de erro
- Modal: `role="dialog"` `aria-modal` `aria-labelledby`; foco automático
  no primeiro campo (nome); focus trap em Tab/Shift+Tab; lock de scroll
  do body
- Toggle PF/PJ com `role="radiogroup"` + `aria-checked` nos botões
- Barra de saldo crediário com `role="progressbar"` + `aria-valuenow/min/max`
- Botões de ação com `aria-label` contextualizado (`Editar — João Wei`)
- Hover/focus state com anel âmbar (`focus-visible:ring-2`)

## Arquivos de demo (não vão para produção)

`index.html`, `clientes.css`, `mock-data.jsx`, `ClientesList.jsx`,
`ClienteEditarModal.jsx` — só para visualizar o resultado sem precisar do
Supabase configurado. A versão de produção mora em `.tsx`/`.ts`.
