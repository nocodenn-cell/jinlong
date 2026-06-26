# Pilar 4 — Especificação dos Módulos

> Cada módulo documenta **apenas**: regras de negócio, fluxos, permissões,
> integrações e casos de uso. **Nunca** descreve layout ou componentes — isso
> pertence aos Pilares [1](./01-ARQUITETURA.md), [2](./02-DESIGN-SYSTEM.md) e
> [3](./03-PADROES-UX.md).

## Template obrigatório por módulo

Cada módulo é descrito com esta estrutura fixa:

```
### <Módulo>
- Objetivo:
- Regras de negócio:
- Fluxos:
- Permissões: (quem pode ler / criar / editar / excluir / aprovar)
- Integrações: (Supabase RPC, fiscal, pagamento, sync…)
- Casos de uso:
- Auditoria: (o que registra além do padrão Usuário/Data/Hora/Estação)
```

> Onde já existe documentação de negócio detalhada, este pilar **referencia** em
> vez de duplicar. A fonte canônica de cada regra continua sendo o documento
> citado; este arquivo é o índice e o contrato de forma.

---

## Índice de módulos

| Módulo | Rota base | Status | Documentação de negócio existente |
|--------|-----------|--------|-----------------------------------|
| Dashboard | `/gerente` | ✅ | — (ver §Dashboard) |
| Vendas | `/gerente/vendas` | ✅ | `docs/venda-golden-flow.md`, `docs/CHECKLIST_UNIFICACAO_FLUXO_VENDAS.md` |
| Produtos | `/gerente/produtos` | ✅ | `docs/PLANO_CADASTRO_PRODUTO.md` |
| Estoque | `/gerente/estoque` | ✅ | `docs/CONFLITO_ESTOQUE_ANALYSIS.md` (em `pdv-importados/`) |
| Transferências | `/gerente/transferencias` | ✅ | contrato `rpc-transferir-estoque-seguro` |
| Financeiro | `/gerente/financeiro` | ✅ | `docs/pdv-production-financial-gate.md` |
| Compras / Recebimento | `/gerente/compras`, `/gerente/recebimento` | ✅ | — |
| Cadastros (clientes/fornecedores/categorias) | `/gerente/clientes`, `/gerente/fornecedores`, `/gerente/categorias-*` | ✅ | — |
| Comissões | `/gerente/comissoes` | ✅ | — |
| Relatórios | `/gerente/relatorios` | ✅ | — |
| Configurações | `/gerente/configuracoes` | ✅ | `ADMIN_PANEL_GUIDE.md` |
| Fiscal | — | ⏳ planejado | — |
| **PDV (Caixa)** | `/caixa` | ✅ | `docs/CIRCUITO_OPERACIONAL.md`, `docs/SCAN_PIPELINE_STATE_MACHINE.md` |
| Admin (back-office) | `/admin/*` | ✅ | `docs/ADMIN_AUTH_STRUCTURAL_AUDIT.md`, `pdv-importados/AUDITORIA_PAINEL_ADMIN.md` |

---

## Módulos (especificação)

### Dashboard
- **Objetivo:** ser o centro gerencial do sistema.
- **Áreas:** indicadores rápidos, indicadores financeiros, análises gráficas,
  atividades recentes, alertas, atalhos. (A posição dos elementos pode evoluir
  sem alterar a arquitetura — ver Pilar 1.)
- **Regras de negócio:** somente leitura/consolidação; não executa operações de
  venda. KPIs derivam de Vendas/Financeiro/Estoque.
- **Permissões:** gerente/admin. Operador de caixa não acessa o Dashboard.
- **Integrações:** Supabase (views/RPC de agregação).

### Vendas
- **Objetivo:** registrar e consultar vendas; fonte da verdade do faturamento.
- **Regras de negócio:** preço de atacado deve ser `<` preço de varejo (ver
  Sprint 4); finalização canônica via RPC `finalizar-venda-canonica`.
- **Fluxos:** golden flow em `docs/venda-golden-flow.md`.
- **Permissões:** operador registra; gerente cancela/estorna (confirmação
  obrigatória — Pilar 3, §6).
- **Integrações:** `rpc-finalizar-venda-canonica-v3`, `decrementar-estoque-seguro`,
  outbox de sync (`sync-outbox-venda-registrada`).
- **Auditoria:** estado de transação registrado (ver `docs/VISUAL_TRANSACTION_STATES.md`).

### Produtos
- **Objetivo:** catálogo (cadastro, categorias, variações, etiquetas, importação).
- **Regras de negócio:** validações de preço/margem; vendabilidade
  (`scripts/check-vendabilidade-invariant.mjs`).
- **Fluxos / casos de uso:** `docs/PLANO_CADASTRO_PRODUTO.md`.
- **Abas planejadas ainda não implementadas:** Variações, Etiquetas (backlog —
  não criar na UI antes de existir a regra).

### Estoque (+ Transferências)
- **Objetivo:** posição e movimentação de estoque.
- **Regras de negócio:** decremento seguro e transferência atômica via RPC;
  invariantes operacionais em `docs/ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md`.
- **Integrações:** `rpc-decrementar-estoque-seguro`, `rpc-transferir-estoque-seguro`.
- **Abas (alvo):** Estoque · Entrada · Inventário · Ajustes · Transferências ·
  Movimentações.

### Financeiro
- **Objetivo:** caixa, contas a receber, contas a pagar, fluxo de caixa.
- **Regras de negócio:** gate financeiro de produção —
  `docs/pdv-production-financial-gate.md`.
- **Permissões:** gerente/admin; operador limitado ao caixa do PDV.

### Cadastros
- **Objetivo:** clientes, fornecedores, categorias de produto e financeiras.
- **Regras de negócio:** entidades de apoio; reutilizadas por Vendas/Compras/Financeiro.

### Configurações
- **Objetivo:** parâmetros do sistema, usuários, permissões, features.
- **Permissões:** matriz em `docs/AUTHORIZATION_MATRIX.md`.
- **Feature flags:** `docs/FEATURE_FLAGS_PLANO.md`, `/gerente/features`.
- **Guia:** `ADMIN_PANEL_GUIDE.md`.

### PDV (Caixa)
- **Objetivo:** operação de venda rápida (arquitetura independente — Pilar 1, §6).
- **Regras de negócio:** fluxo contínuo por teclado + scanner; prioridade
  absoluta é a rapidez da venda. Não usa Dashboard, cards gerenciais ou gráficos.
- **Fluxos:** `docs/CIRCUITO_OPERACIONAL.md`, máquina de estados de scan em
  `docs/SCAN_PIPELINE_STATE_MACHINE.md`, contrato de bip em
  `docs/CONTRATO_PIPELINE_BIP.md`.
- **Integrações:** RPC de venda/estoque; política de reconexão/replay em
  `docs/RECONNECT_REPLAY_POLICY.md`.

### Fiscal *(planejado)*
- **Objetivo:** emissão/integração fiscal. Item de nível 1 do Plano ainda **sem
  rota** — manter no backlog até existir regra e integração definidas.

---

## Auditoria (regra transversal)

Auditoria é **obrigatória em todos os módulos**. Toda operação registra: Usuário,
Data, Hora, Estação, Operação, Valor anterior, Valor atualizado. Consulta da
trilha via `/gerente/atividades` e `/admin/auditoria`. Governança e RLS:
`docs/P2_GOVERNANCA_RLS_E_PENTEST.md`, `docs/RLS_POLICY_DIAGNOSTIC.md`.

## Permissões (referência única)

Matriz de autorização canônica: `docs/AUTHORIZATION_MATRIX.md`. Auditorias de
autenticação/autoridade: `docs/ADMIN_AUTH_STRUCTURAL_AUDIT.md`,
`docs/MULTI_AUTHORITY_ARCHITECTURE_AUDIT.md`.
