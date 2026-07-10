# 03 — Arquitetura

> Documentação técnica baseada no código e migrations existentes.
> [[00_DASHBOARD_PROJETO]] · [[04_PDV]] · [[05_CADASTRO_PRODUTO]]

---

## Visão Geral do Monorepo

```
┌────────────────────────────────────────────────────────────────┐
│                    MONOREPO (npm workspaces + Turborepo)        │
│                                                                │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │
│  │pdv-importados│   │  pdv-local  │   │      backend        │  │
│  │  Next.js 15  │   │  Tauri 2    │   │  Supabase (PG 17)  │  │
│  │  React 19    │   │  Vite+SQLite│   │  Edge Functions     │  │
│  └──────┬──────┘   └──────┬──────┘   └──────────┬──────────┘  │
│         └────────┬────────┘                      │              │
│                  │                               │              │
│         ┌────────▼────────┐                       │              │
│         │  shared-core  │───────────────────────┘              │
│         │  TS puro      │                                      │
│         └───────────────┘                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## Módulos Principais

### pdv-importados (Web — Next.js 15)

| Área | Rotas | Responsabilidade |
|---|---|---|
| **PDV** | `/caixa` | Venda, scan, carrinho, pagamento (OPERADOR, PT fixo) |
| **Gerente** | `/gerente/*` | Painel legado bilíngue PT/ZH (migração para admin) |
| **Admin** | `/admin/*` | Painel v2 — SSoT de entidades |
| **API** | `/api/health`, `/api/caixa/scan-telemetry` | SSRA, telemetria |

**Stack:** App Router, Server Components, Server Actions, Zustand 5, Tailwind 3.4, shadcn/ui, Zod 3.23

### pdv-local (Desktop — Tauri 2)

| Componente | Função |
|---|---|
| SQLite local | Catálogo + `vendas_outbox` |
| `usePdvLocalOutboxSync` | Sync via Edge `sync-outbox` |
| `@core` alias | Importa `shared-core` |

### backend (Supabase)

| Componente | Quantidade |
|---|---|
| Migrations PostgreSQL | 187 arquivos (001–256) |
| Edge Functions | 3 (Deno 2.x) |
| Scripts utilitários | `verify_p0_producao.sql`, smoke tests |

### shared-core (Domínio Puro)

| Módulo | Exports principais |
|---|---|
| `pricing/` | `PricingService`, resolução faixas atacado |
| `cart/` | `CartEngine` (add, remove, recalculate) |
| `caixa/` | `variantesChaveLeitura`, `mapRegrasPreco` |
| `pdv/` | Invariantes operacionais, pipeline scan |
| `money/` | `roundAbnt` (arredondamento ABNT) |
| `ledger/` | `LedgerEngine` |
| `observability/` | Logger estruturado |

---

## Admin — Consolidação SSoT

Telas oficiais (regra `entity-ssot.mdc`):

| Entidade | Rota oficial |
|---|---|
| Produto | `/admin/catalogo` |
| Cliente | `/admin/clientes` |
| Fornecedor | `/admin/fornecedores` |
| Estoque | `/admin/estoque` |
| Venda (cancelar) | `/admin/vendas` |
| Financeiro | `/admin/financeiro` |
| Diagnóstico PDV | `/admin/diagnostico-caixa` |

**Exceção legada:** estoque inicial só na criação de produto (`ProdutoFormModal.aplicarEstoqueInicial`).

---

## Supabase — Tabelas Principais

| Tabela | Propósito | Mutação |
|---|---|---|
| `usuarios` | Perfis + idioma | SELECT próprio; dono vê loja |
| `produtos` | Catálogo | Gerente+ via RLS |
| `estoque` | Saldo por loja | Via RPC apenas |
| `vendas` / `itens_venda` | Transações | Via RPC canônica v4 |
| `caixas` | Turno de caixa | Via RPC |
| `contas_receber` / `contas_pagar` | Financeiro | Gerente+ |
| `documentos_fiscais_pendentes` | Fila NFC-e | Worker processa |
| `vendas_eventos_ledger` | Auditoria imutável | Trigger |
| `vendas_em_espera` | Parked sales | RPCs migration `255` |
| `sync_request_nonces` | Anti-replay desktop | Edge only |

---

## RPCs Importantes

### Finalização de Venda
| RPC | Status | Uso |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4(...)` | **Padrão** | Web + sync desktop |
| `registrar_venda_com_itens(...)` | Legada | Desktop antigo |

### Estoque
| RPC | Função |
|---|---|
| `decrementar_estoque_seguro(...)` | Baixa com FOR UPDATE + version |
| `ajustar_estoque_manual(...)` | Ajuste gerencial + kardex |
| `transferir_estoque_seguro_idempotente(...)` | Transferência entre lojas |

### Preço
| RPC | Função |
|---|---|
| `calcular_preco_produto(...)` | Autoridade de preço no servidor |
| `calcular_preco_produto_security_definer(...)` | Com contexto de segurança |

### Caixa
| RPC | Função |
|---|---|
| `registrar_movimentacao(...)` | Sangria, suprimento |
| `aprovar_movimentacao(...)` | Aprovação gerente |
| `fechar_caixa_atomico(...)` | Fechamento cego |
| `pdv_diagnostico_pre_producao()` | Checklist pré-piloto (migration `256`) |

### Venda em Espera (migration `255`)
| RPC | Função |
|---|---|
| `colocar_venda_em_espera(...)` | Park carrinho |
| `retomar_venda_em_espera(...)` | Resume |
| `descartar_venda_em_espera(...)` | Discard |
| `listar_vendas_em_espera()` | Listagem |

### Relatórios
| RPC | Função |
|---|---|
| `relatorio_vendas_por_dia_periodo(...)` | Vendas por dia |
| `relatorio_top_produtos_periodo(...)` | Top N produtos |
| `dashboard_gerente_resumo(...)` | KPIs |
| `relatorio_margem_por_venda(...)` | Margem por transação |

---

## Edge Functions

| Função | Auth | Propósito |
|---|---|---|
| `sync-outbox` | HMAC SHA256 | Sync desktop → Supabase |
| `validar-gerente` | JWT | Token curto-prazo desconto |
| `fiscal-worker` | Cron/trigger | Processar fila NFC-e/NF-e |

---

## Regras de Domínio

1. **Preço autoritativo no servidor** — RPC recalcula no commit; cliente não dita preço final
2. **Código único por loja** — constraint em `produtos`
3. **Margem não negativa** — trigger `guard_margem_negativa`
4. **Produto sem NF é válido** — `tem_nf = false` não bloqueia fluxos
5. **Faixas atacado** — prioridade: produto > categoria > varejo
6. **Estoque só via RPC** — `authenticated` não faz UPDATE direto em `estoque`
7. **Venda só via RPC v4** — v2/v3 bloqueadas
8. **SSoT de entidades** — cadastros apenas nas telas oficiais admin
9. **Operador sempre PT** — caixa sem lógica de idioma
10. **Perfil em `public.usuarios`** — nunca em `public.perfis` (tabela órfã)

---

## Autenticação e Autorização

```
Request → middleware.ts → supabase.auth.getUser()
  ├─ Não autenticado → /login
  ├─ OPERADOR → /caixa only
  ├─ GERENTE/DONO → /gerente/* + /admin/*
  └─ ADMIN → /admin/* (equipe interna)
```

**Referência:** `docs/AUTHORIZATION_MATRIX.md`

---

## CI/CD — Guards Arquiteturais

| Guard | Valida |
|---|---|
| `guard:core` | `shared-core` sem imports web |
| `guard:pdv` | Invariantes PDV |
| `guard:routes` | Rotas permitidas |
| `guard:rpc` | RPCs canônicas (não legadas) |
| `guard:pricing` | Motor de preço correto |
| `guard:migrations` | Sequência migrations |
| `guard:deps` | Versões dependências |

---

## Fluxos Principais (links)

- PDV completo: [[04_PDV]]
- Cadastro produto: [[05_CADASTRO_PRODUTO]]
- Sync desktop: ver seção em [[04_PDV#PDV Desktop]]
- Decisões: [[07_DECISOES_ARQUITETURAIS]]

---

> Design system: [[Design System]] · Auditoria: [[Auditoria]] · Legado: [[Arquitetura]]
