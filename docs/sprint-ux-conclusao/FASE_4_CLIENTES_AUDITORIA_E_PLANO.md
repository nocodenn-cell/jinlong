# Fase 4 — Clientes: auditoria completa e plano de execução

**Status: AUDITORIA CONCLUÍDA. Aguardando autorização para executar.**

Por instrução explícita, esta fase é entregue como auditoria + plano —
nenhuma implementação foi feita ainda. Módulos anteriores (Produtos, Estoque,
Financeiro) estão 100% fechados (código + banco).

## 1. Funcionalidades previstas (o que já existe hoje)

| Funcionalidade | Onde | Status |
|---|---|---|
| Listagem paginada + busca (nome/e-mail/documento/telefone) | `ClientesListClient.tsx` + `buscarClientesPaginadosAction` | Completo |
| Criar/editar cliente (PF/PJ) com máscaras de CPF/CNPJ/telefone | `ClienteEditarModal.tsx` + `salvarClienteAction` | Completo |
| Consentimento LGPD obrigatório na criação (`termos_aceitos_em`, `consentimento_privacidade_em`) | `ClienteEditarModal.tsx` | Completo |
| Exclusão com conformidade LGPD Art. 16 (anonimiza se há histórico financeiro, deleta se não há) | `excluirClienteAction` | Completo |
| Saldo de crediário calculado (soma de `contas_receber` ABERTO/PARCIAL) | view `v_clientes_gerente` | Completo |
| Busca de cliente no PDV/Caixa (somente leitura, para vincular à venda) | `caixaClientesSearch.impl.ts` | Completo |
| Rota dedicada Admin V2 (`/admin/clientes`) reusando o client component do `/gerente` | `app/admin/clientes/page.tsx` | Completo |

## 2. Dependências (quem consome o módulo)

- **Caixa/PDV (checkout):** `caixaClientesSearch.impl.ts` busca clientes ativos da loja para vincular `cliente_id` à venda; `caixaVendas.impl.ts` grava `p_cliente_id` na RPC de finalização (obrigatório quando há saldo pendente/fiado).
- **Financeiro:** `FinanceiroReceberExtras.tsx` reusa `buscarClientesPaginadosAction` para o formulário "Novo título a receber"; `lib/gerente/financeiroTitulosServer.ts` filtra `contas_receber` por nome de cliente.
- **Relatórios de vendas:** `app/gerente/relatorios/vendas/actions.ts` faz join `clientes!vendas_cliente_id_fkey` para exibir nome do cliente por venda.
- **`pdv-local` (Tauri/desktop):** **nenhuma dependência** — não há CRUD nem busca de clientes no cliente desktop; fiado/crediário é fluxo exclusivamente web/online.

Nenhum consumidor depende de colunas ou comportamento que este plano altere — todas as entregas abaixo são aditivas ou consertam algo já quebrado, sem mudar contrato de dados existente.

## 3. Bugs/gaps reais encontrados (evidência, não suposição)

1. **`app/admin/clientes/page.tsx`** — mesmo padrão de erro-descartado já corrigido em Estoque/Financeiro: `inicial.ok ? inicial.clientes : []` sem surfacing de erro. Uma falha real de carga (RLS, rede) aparece como "nenhum cliente cadastrado".
2. **`app/admin/clientes/page.tsx`** — `subtitle="Cadastro e gestão de clientes"` hardcoded em português, quebrando paridade zh (mesmo padrão de gap sistêmico já encontrado e fechado em 5 componentes do Financeiro).
3. **`ClienteEditarModal.tsx`** — 2 strings hardcoded em português fora do sistema de i18n: a mensagem de erro do checkbox LGPD (`'Confirme o consentimento do titular antes de cadastrar.'`) e o texto do próprio consentimento (`'Confirmo que os dados pessoais acima foram coletados...'`). Mesmo gap de i18n.
4. **`salvarClienteAction`** — documento duplicado (há `UNIQUE (loja_id, documento)` desde a migration 273/265) não tem tratamento amigável: o erro Postgres bruto (`error.message`, ex. `"duplicate key value violates unique constraint..."`) é devolvido direto ao usuário em vez de algo como "Já existe um cliente com este documento nesta loja."
5. **`v_clientes_gerente`** (view, produção confirmada via `pg_get_viewdef`) — `ultima_compra` é **hardcoded `NULL::timestamptz`**, com comentário no código (`actions.ts:39`) dizendo "NULL até a Fase 7 (vendas ainda não possui cliente_id)". Esse comentário está **desatualizado**: `vendas.cliente_id` já existe em produção (capturado como migration 273, com FK `vendas_cliente_id_fkey` já em uso em `relatorios/vendas/actions.ts`). A view pode ser corrigida para computar de verdade.
6. **`caixaVendaEspera.impl.ts:314`** — `TODO(fase-7): vendas.cliente_id → join clientes para clienteNome na lista` — mesmo gap: a lista de "vendas em espera" não mostra o nome do cliente vinculado, apesar da coluna já existir. TODO real, não hipotético.
7. **`ClientesListClient.tsx`** — não exibe `ultima_compra` mesmo que a view venha a ser corrigida (item 5) — decisão de UX a tomar (adicionar coluna ou não).

Nenhum TODO/FIXME adicional encontrado além do item 6 dentro do escopo direto do módulo.

## 4. Riscos técnicos

- **Baixo, geral:** todas as entregas abaixo são aditivas (nova lógica na view, novo tratamento de erro, novas chaves de i18n) — nenhuma remove ou muda o contrato de uma função/coluna já consumida.
- **Entrega 3 (view `ultima_compra`)** é a única com superfície de banco. Risco real: a subquery de `MAX(data)` sobre `vendas` precisa ser barata (índice em `vendas.cliente_id` já existe, criado junto com a FK na captura 273 — a confirmar antes de aplicar). Sem isso, a listagem paginada de clientes ficaria lenta.
- **Entrega 5 (mostrar cliente na venda em espera)** toca um fluxo de caixa ativo (`caixaVendaEspera.impl.ts`) — precisa rodar sem regressão no fluxo de "reter/retomar venda", que é crítico (guarded por `guard:pdv`).

## 5. Migrações necessárias

**Uma migration pequena, aditiva, de baixo risco:**

```sql
-- Corrige v_clientes_gerente.ultima_compra (hoje hardcoded NULL) para computar
-- de fato a partir de vendas.cliente_id, que já existe em produção (migration 273).
CREATE OR REPLACE VIEW public.v_clientes_gerente
WITH (security_invoker = true)
AS
SELECT c.id, c.nome, c.tipo, c.documento, c.email, c.telefone, c.endereco,
  c.limite_credito,
  COALESCE(cr.saldo, 0::numeric) AS saldo_crediario,
  uc.ultima_compra,
  c.created_at, c.loja_id, c.ativo
FROM clientes c
LEFT JOIN LATERAL (
  SELECT sum(r.valor_aberto) AS saldo
  FROM contas_receber r
  WHERE r.cliente_id = c.id AND r.status = ANY (ARRAY['ABERTO','PARCIAL'])
) cr ON true
LEFT JOIN LATERAL (
  SELECT max(v.data) AS ultima_compra
  FROM vendas v
  WHERE v.cliente_id = c.id AND v.status = 'CONCLUIDA'
) uc ON true;
```

Idempotente (`CREATE OR REPLACE VIEW`), sem mudança de schema de tabela, sem
necessidade de PITR adicional (é apenas uma view). Pré-requisito: confirmar
índice em `vendas.cliente_id` antes de aplicar (checagem read-only, sem
mutação).

## 6. Impactos

- **Arquitetura:** nenhum. Autoridade única de dados de cliente continua em `clientes`/`v_clientes_gerente`; nenhuma nova tabela, nenhuma duplicação de regra de negócio na UI (toda validação de duplicidade/crediário já está no servidor).
- **UX:** melhora pura — mensagens de erro mais honestas (item 1, 4), paridade de idioma completa (item 2, 3), dado que já existe passa a aparecer onde falta (itens 5, 6). Nenhuma mudança de fluxo existente.
- **Domínio:** nenhuma regra de negócio nova. "Última compra" e "cliente na venda em espera" são leitura de dado que já é gravado hoje — não alteram como uma venda ou um cliente é criado/validado.

## 7. Plano de execução — entregas incrementais

### Entrega 1 — `loadError` honesto na página admin de Clientes
- **Objetivo:** distinguir "sem clientes cadastrados" de "falha ao carregar" (mesmo padrão já aplicado em Estoque/Financeiro).
- **Arquivos:** `app/admin/clientes/page.tsx`, `app/gerente/clientes/ClientesListClient.tsx` (prop `loadError` + banner).
- **Risco:** baixíssimo — puramente aditivo, sem tocar em ação de escrita.
- **Rollback:** reverter o commit; nenhuma migração de banco envolvida.
- **Critérios de aceite:** falha simulada de RLS/rede mostra banner de erro, não a mensagem de lista vazia; caso real de zero clientes continua mostrando o estado vazio normal.
- **Testes obrigatórios:** teste de comportamento (mesmo padrão de `RecebimentoGerentePageClient.behavior.test.tsx`) cobrindo `loadError` presente vs. ausente.

### Entrega 2 — Fechar gap de i18n (subtitle da página + textos LGPD do modal)
- **Objetivo:** paridade pt/zh completa no módulo Clientes.
- **Arquivos:** `app/admin/clientes/page.tsx`, `app/gerente/clientes/ClienteEditarModal.tsx`, `src/lib/i18n/pt.json`, `src/lib/i18n/zh.json`.
- **Risco:** nulo — só texto.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** nenhuma string hardcoded em português remanescente nos dois arquivos; `idioma=zh` mostra tudo em chinês.
- **Testes obrigatórios:** nenhum teste automatizado dedicado necessário (mesma decisão tomada para as trocas de string análogas no Financeiro); validação manual via leitura do diff.

### Entrega 3 — Mensagem amigável para documento duplicado
- **Objetivo:** `salvarClienteAction` reconhece `error.code === '23505'` (unique violation) e devolve mensagem de negócio, não o erro Postgres bruto.
- **Arquivos:** `app/gerente/clientes/actions.ts`.
- **Risco:** baixo — muda só o texto de um caminho de erro já existente, não a lógica de sucesso.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** tentar criar cliente com documento já existente na mesma loja mostra "Já existe um cliente com este documento nesta loja.", não a mensagem técnica do Postgres.
- **Testes obrigatórios:** teste unitário de `salvarClienteAction` mockando `createClient`/Supabase para simular `error.code = '23505'` e checar a mensagem devolvida (mesmo padrão de `contas-pagar/actions.test.ts` desta sessão).

### Entrega 4 — Corrigir `v_clientes_gerente.ultima_compra`
- **Objetivo:** view passa a computar a última compra real, em vez de `NULL` fixo.
- **Arquivos:** nova migration em `backend/supabase/migrations/` (view `CREATE OR REPLACE`); `app/gerente/clientes/actions.ts` (remover comentário desatualizado sobre Fase 7).
- **Risco:** baixo-médio — única entrega com mutação de banco nesta fase; requer confirmação explícita antes de aplicar em produção (mesmo protocolo usado para a 248).
- **Rollback:** `CREATE OR REPLACE VIEW` de volta à definição atual (hardcoded NULL) — script de um comando, trivial.
- **Critérios de aceite:** `01_validation.sql`-style probe confirma que `ultima_compra` não é mais `NULL::timestamp with time zone` fixo na `pg_get_viewdef`; smoke comportamental (transação com `ROLLBACK`, mesmo padrão desta sessão) confirma que uma venda `CONCLUIDA` vinculada a um cliente aparece como `ultima_compra` na view.
- **Testes obrigatórios:** smoke SQL direto em produção dentro de transação revertida (não há teste de unidade possível para uma view); nenhuma mudança de código TypeScript além da limpeza do comentário, então sem novo teste JS necessário.

### Entrega 5 — Cliente na lista de "vendas em espera" (fecha o TODO)
- **Objetivo:** `caixaVendaEspera.impl.ts` faz join com `clientes` e devolve `clienteNome` quando `vendas.cliente_id` não é nulo.
- **Arquivos:** `app/caixa/server/caixaVendaEspera.impl.ts` (e o componente que renderiza a lista, a identificar na implementação).
- **Risco:** médio — toca um fluxo de caixa ativo e guardado por `guard:pdv`; precisa preservar exatamente o comportamento atual quando `cliente_id` é nulo (maioria dos casos hoje).
- **Rollback:** reverter o commit; nenhuma migração envolvida (usa a FK que já existe).
- **Critérios de aceite:** venda em espera sem cliente continua exibindo como hoje; venda em espera com cliente mostra o nome; `guard:pdv` continua verde.
- **Testes obrigatórios:** teste de unidade/comportamento do parsing da lista de vendas em espera cobrindo os dois casos (com e sem cliente vinculado).

### Entrega 6 (opcional, decisão de produto) — Exibir "última compra" na tabela de Clientes
- **Objetivo:** só faz sentido depois da Entrega 4. Adicionar coluna "Última compra" em `ClientesListClient.tsx`.
- **Arquivos:** `ClientesListClient.tsx`, `actions.ts` (tipo `ClienteListRow` já tem o campo).
- **Risco:** baixo — só UI, dado já viria correto da Entrega 4.
- **Rollback:** reverter o commit.
- **Critérios de aceite:** coluna nova mostra data formatada ou "—" quando nunca comprou; responsivo (mobile esconde/prioriza como as demais colunas via `priority`).
- **Testes obrigatórios:** nenhum teste dedicado necessário além dos já existentes (mesma decisão tomada para colunas puramente apresentacionais em outras tabelas desta sprint).
- **Nota:** marcado como opcional porque é uma decisão de produto (mostrar ou não), não um bug — o dado só ficará disponível depois da Entrega 4, mas exibi-lo é uma escolha de UX, não uma correção.

## 8. Checklist "reduz complexidade / dívida / SSOT / observabilidade / arquitetura / acoplamento / testabilidade / reversibilidade"

| Entrega | Reduz complexidade? | Reduz dívida? | Fortalece SSOT? | Observabilidade? | Preserva arquitetura? | Reduz acoplamento? | Testável? | Reversível fácil? |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 — loadError | Sim | Sim | Sim (mesmo padrão do resto do app) | Sim (erro real visível) | Sim | Neutro | Sim | Sim |
| 2 — i18n | Sim | Sim | Sim | Neutro | Sim | Neutro | N/A (texto) | Sim |
| 3 — erro amigável duplicado | Sim | Sim | Neutro | Sim | Sim | Neutro | Sim | Sim |
| 4 — view ultima_compra | Sim (remove workaround) | Sim (remove comentário/gap desatualizado) | Sim (view volta a refletir a realidade) | Sim | Sim | Neutro | Sim (smoke) | Sim |
| 5 — cliente na venda em espera | Sim (fecha TODO) | Sim | Neutro | Sim | Sim | Neutro | Sim | Sim |
| 6 — coluna UI (opcional) | Neutro | Neutro | Neutro | Neutro | Sim | Neutro | N/A | Sim |

Nenhuma resposta negativa em nenhuma entrega — todas passam no checklist sem
precisar de alternativa mais simples.

## 9. Ordem recomendada

1 → 2 → 3 (zero risco de banco, podem ir juntas num único PR incremental) →
4 (única com mutação de banco, pede confirmação explícita como a 248) → 5
(depende só da FK, não da view corrigida, mas faz sentido depois do 4 para
fechar o mesmo tema de "cliente_id finalmente sendo usado em toda parte") →
6 (opcional, depois do 4).

**Aguardando sua autorização para começar a execução.**
