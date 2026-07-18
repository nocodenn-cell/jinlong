# ADR-005 — Fronteiras de Domínio e Shared Core

| Campo | Valor |
|--------|--------|
| **ID** | ADR-005 |
| **Título** | Fronteiras de domínio no `@fastproduct/shared-core` (sem arquitetura paralela) |
| **Status** | Aceito — decisões de path e fronteira (Missão 5.1); **sem implementação de código nesta data** |
| **Data** | 2026-07-18 |
| **Contexto** | Ciclo comercial GO (Missão 3.1 + Missão 4) em `main` via [#217](https://github.com/nocodenn-cell/fastproduct/pull/217) (`2becdf39`); Missão 5 em planejamento |
| **Missão** | 5.1 — Split de domínio (fundação) |
| **Relacionados** | [Missão 5 roadmap](../roadmap/missao5_fundacao_internacionalizavel.md), [Inventário 5.1a](../architecture/inventario_dominio_modulo_tabela_writer.md), [ADR-CAIXA-002](./ADR-caixa-contrato-financeiro-pos-cancelamento.md), [mapa autoridade caixa](../../backend/artifacts/mapa_autoridade_caixa_20260718.md), DEC-012 (`Jinlong/07_DECISOES_ARQUITETURAIS.md`), entity-ssot (`.cursor/rules/entity-ssot.mdc`) |

---

## Contexto

O monólito em `pdv-importados` / RPCs Supabase opera o ciclo comercial validado (venda → estoque → pagamento → \(E(c)\) → cancel → fechamento → integridade). Domínios estão acoplados por pasta e hábito; i18n existe pontualmente (`pt`/`zh` JSON) sem núcleo de locale/moeda/fuso compartilhado.

Já existe o workspace **`@fastproduct/shared-core`** (pricing, cart, scan-pipeline, invariants, rotas). Criar um segundo núcleo (`modules/shared`, outro pacote de domínio, ou outro “shared-core”) geraria arquitetura paralela e divergência web/desktop (viola DEC-012).

Missão 5.1 documenta **fronteiras e path alvo**. Não reescreve RPCs, não move telas, não muda regra de negócio.

---

## Decisão

### 1. Único núcleo compartilhado

**Decisão:** o único núcleo de domínio e internacionalização base é o pacote workspace existente:

```
@fastproduct/shared-core
```

**Proibido criar:**

- `modules/shared`
- outro diretório ou pacote chamado `shared-core` fora do workspace atual
- outro pacote de domínio paralelo (npm workspace ou pasta espelho)

**Estrutura alvo** (pastas sob o pacote existente — a criar só quando houver PR de scaffold):

```
@fastproduct/shared-core/src/
  sales/
  inventory/
  cash/
  products/
  i18n/
  locale/
  currency/
  timezone/
  formatting/
```

Código de domínio puro já existente no pacote (ex.: `pricing/`, `pdv/`, `cart/`, `caixa/`) permanece válido; migração gradual alinha nomes e exports às pastas acima sem big-bang.

**Sign-off path:** [x] Eng (decisão aprovada 2026-07-18)

---

### 2. Separação de responsabilidades

| Camada | Responsabilidade | Exemplos |
|--------|------------------|----------|
| **`@fastproduct/shared-core`** | Regras puras, contratos, tipos, cálculos, políticas de domínio | ports de venda/caixa, \(E(c)\) helpers, policies, i18n/formatting |
| **Apps** (`pdv-importados`, `pdv-local`) | UI, adapters, Server Actions, integração Next/Tauri | `app/caixa/*`, `app/admin/*`, impls `*.impl.ts` |

**Não mover telas** nesta fase. UI SSoT de entidades (entity-ssot) permanece nas rotas oficiais (`/admin/catalogo`, `/admin/estoque`, etc.).

Apps **importam** contratos e helpers do `shared-core`; não reimplementam política de domínio.

---

### 3. Donos conceituais por domínio

| Módulo | Dono conceitual | Escopo principal |
|--------|-----------------|------------------|
| **sales** | Vendas e pagamentos da venda | `vendas`, `itens_venda`, **`vendas_pagamentos`**, `devolucoes` (pós-venda), cancel/devolver (contratos) |
| **cash** | Contrato de caixa | \(E(c)\) via `calcular_valor_sistema_dinheiro_caixa`, `movimentacoes_caixa`, abertura/fechamento, sangria/suprimento |
| **inventory** | Regras de estoque | `estoque`, kardex / `movimentos_estoque_log`, reposições de cancelamento, ajustes |
| **products** | Catálogo / produto | `produtos`, GTIN cache, status de publicação; CRUD alinhado a `/admin/catalogo` |

**Orquestração cross-domínio** (ex.: `criar_produto_com_estoque_inicial`, cancel que toca estoque + liquidez física) permanece em RPC/adapters documentados — não vira “god module”. Cada efeito pertence ao dono da tabela/contrato afetado.

---

### 4. Regras de fronteira

1. **Um módulo escreve suas tabelas** (conceitualmente); outros leem via contrato/port ou evento.
2. **Venda não escreve** `movimentacoes_caixa` (estado validado Missão 4).
3. **Caixa não é SSoT de pagamento** — `vendas_pagamentos` permanece em **sales**.
4. **\(E(c)\) é autoridade do esperado** — dono **cash** (ADR-CAIXA-002).
5. **`saldo_atual` não é fonte contábil** nem proxy de \(E(c)\) (ADR-CAIXA-002).
6. **Entity-ssot UI** continua: produto só em `/admin/catalogo`, estoque manual em `/admin/estoque`, etc.
7. **Nenhum domínio importa UI** de outro domínio; apps não fazem “god import” cruzando regras sem passar por port do `shared-core`.
8. Imports entre `sales` / `inventory` / `cash` / `products` só via contratos públicos exportados (a enforçar com boundary check no scaffold).

---

### 5. Continuidade ADR-CAIXA-002

Este ADR **não altera** o contrato financeiro do caixa. Mantém:

| Princípio | Dono / autoridade |
|-----------|-------------------|
| `vendas_pagamentos` = SSoT do pagamento da venda | **sales** |
| \(E(c)\) = fonte de verdade do esperado do turno | **cash** (`calcular_valor_sistema_dinheiro_caixa`) |
| `saldo_atual` = contador físico (A), **não** contábil | cash (escrita operacional); **não** SSoT de esperado |
| Venda **não** escreve `movimentacoes_caixa` | confirmado Missão 4 / mapa de autoridade |

Dívidas D-A1 / D-A3 / D-A4 ficam na trilha **5.3**, em PRs isolados — fora do escopo de fronteiras.

---

### 6. Internacionalização no mesmo núcleo

Pastas alvo (Missão **5.2**, scaffold após 5.1):

```
shared-core/src/
  i18n/         # catalog, keys, fallback, missing-key policy
  locale/       # negociação BCP 47
  currency/     # código moeda, arredondamento (detalhe futuro)
  timezone/     # fuso da loja / display
  formatting/   # número, data, dinheiro para UI
```

**Regras:**

1. **Idioma ≠ país/região** — language tag e região tratados de forma separável; locale de UI usa BCP 47.
2. **Locales iniciais:** `pt-BR`, `zh-CN`, `en-US`.
3. **Nenhum domínio** (`sales`, `cash`, …) **conhece idioma** — recebe keys / mensagens já resolvidas na borda (app) ou via API de `i18n`/`formatting`.
4. **Fallback:** `requested locale → pt-BR → key`.
5. **Formatting ≠ translation** — moeda/número/data em código novo passam por `formatting/`.
6. JSON legado (`pdv-importados/src/lib/i18n/pt.json`, `zh.json`) = **fonte de migração**, não destino final.
7. Bridge na borda: `Idioma` legado (`pt` / `zh`) → BCP 47; DEC-007 (sem next-intl / sem prefixo de URL no D0) permanece até ADR de i18n dedicado.

---

### 7. Estratégia de migração (sem big-bang)

| Fase | Entrega | Código de produto? |
|------|---------|--------------------|
| **Agora** | Este ADR + sign-off Missão 5 | Não |
| **PR 5.1a** | Inventário `módulo → tabela → writer` + regras de import + boundary guards | Docs + script de guard (sem scaffold de pastas de domínio) |
| **PR 5.1b** | Scaffold mínimo de pastas/exports sob `shared-core/src/` | Sim — só fundação, sem mover comportamento |
| **PRs seguintes** | Mover contratos/helpers pequenos; migrar gradualmente; zero mudança de regra de negócio por PR de move | Sim |

**Fora de 5.1:** rewrite de RPCs; materializar `saldo_atual` na venda; traduzir UI completa; mover telas.

---

## Consequências

### Positivas

- Um único SSoT de domínio alinhado a DEC-012 (paridade web/desktop).
- Fronteiras explícitas compatíveis com ADR-CAIXA-002 e entity-ssot.
- i18n/formatting nascem no mesmo núcleo — evita terceiro “core”.
- Migração incremental reduz risco de regressão no ciclo comercial já GO.

### Negativas / trade-offs

- Scaffold e boundary lint exigem disciplina de PR (moves pequenos).
- Código legado em `app/` e pastas atuais de `shared-core` coexistirão até a migração.
- RPCs orquestradoras continuam cross-cutting no Postgres até redesign futuro (fora desta missão).

### Riscos se ignorado

- Criar `modules/*` paralelo → duas fontes de verdade e drift.
- Misturar UI com domínio no shared-core → acoplamento Next/Tauri.
- Tratar `saldo_atual` como contábil → reabre BUG-4.2 / D-A*.

---

## Entregáveis vinculados (implementação futura)

- [x] ADR-005 (este documento)
- [x] **PR 5.1a:** Inventário [`docs/architecture/inventario_dominio_modulo_tabela_writer.md`](../architecture/inventario_dominio_modulo_tabela_writer.md) + [`scripts/domain-boundary-guard.mjs`](../../scripts/domain-boundary-guard.mjs) (`npm run guard:domain`)
- [ ] **PR 5.1b:** Scaffold de pastas sob `shared-core/src/` (sem mover comportamento)
- [ ] Moves graduais de contratos (PRs isolados)

---

## Alternativas rejeitadas

| Alternativa | Motivo da rejeição |
|-------------|-------------------|
| `pdv-importados/modules/{sales,…,shared}` como núcleo | Duplica domínio; dificulta uso por `pdv-local`; cria `modules/shared` paralelo |
| Novo pacote npm de domínio | Overhead e segunda fonte de verdade |
| Big-bang rewrite / mover telas agora | Risco alto pós GO operacional; fora do escopo fundação |
| next-intl + prefixo de URL nesta fase | Conflita com DEC-007 e piloto D0; i18n base é núcleo + bridge |

---

## Sign-off

| Papel | Decisão | Data |
|-------|---------|------|
| Eng | Path único `@fastproduct/shared-core` + fronteiras 5.1 | 2026-07-18 |
| Produto | Aceite ADR-005 + Missão 5 (divisão 5.1/5.2/5.3) | 2026-07-18 |

**Próximo passo:** PR 5.1b — scaffold mínimo sob `@fastproduct/shared-core/src/` (sem mover comportamento).
