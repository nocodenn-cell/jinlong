# Missão 5 — Fundação Arquitetural Internacionalizável

| Campo | Valor |
|--------|--------|
| **ID** | MISSÃO-5 |
| **Status** | **Aceito** (sign-off 2026-07-18) — PR 5.1a em entrega; scaffold 5.1b pendente |
| **Data** | 2026-07-18 |
| **Pré-requisito** | Missão 3.1 + Missão 4.1–4.5 **GO** · merge em `main` via [#217](https://github.com/nocodenn-cell/fastproduct/pull/217) (`2becdf39`) |
| **Branch de referência (manter)** | `consolidate/missao3-20260718` — **não apagar** até `main` estável por alguns dias |
| **Regra** | Implementação só após este sign-off; 1º PR = inventário + boundary guards (**sem** scaffold neste PR) |
| **ADR 5.1** | [`docs/adr/ADR-005-fronteiras-dominio-shared-core.md`](../adr/ADR-005-fronteiras-dominio-shared-core.md) |

---

## Por que agora

O ciclo comercial (venda → estoque → pagamento → caixa \(E(c)\) → cancel → fechamento → integridade) está validado operacionalmente.

O monólito atual em `pdv-importados` / RPCs Supabase **funciona**, mas:

1. Domínios (venda, estoque, caixa, produto) estão acoplados por pasta e por hábito — difícil crescer sem regressão.
2. i18n existe pontualmente (`pt`/`zh` JSON), sem núcleo de locale/moeda/fuso compartilhado.
3. Dívidas conhecidas da Missão 4 (liquidez física, devolução, CI) precisam de backlog explícito — **não** misturar com redesign.

Missão 5 é **fundação**, não feature de loja.

---

## Divisão da missão

```
5.1  Split de domínio
5.2  Internacionalização base
5.3  Limpeza / backlog das dívidas conhecidas
```

Ordem estrita: **5.1 → 5.2 → 5.3** (5.3 pode ter itens paralelos de CI, mas não bloqueia o desenho de 5.1/5.2).

---

## 5.1 — Split de domínio

### Objetivo

Introduzir fronteiras de módulo **sem** big-bang rewrite. Extrair contratos e donos; migrar código gradualmente.

### Path aprovado (ADR-005)

**Único núcleo:** `@fastproduct/shared-core` (workspace existente).

**Não criar:** `modules/shared`, outro `shared-core`, nem pacote de domínio paralelo.

```
@fastproduct/shared-core/src/
  sales/        # venda, itens, pagamentos da venda, cancel/devolver (contratos)
  inventory/    # estoque, kardex, reposições, ajustes
  cash/         # caixa, E(c), sangria/suprimento, fechamento
  products/     # catálogo, GTIN, cadastro, publicação
  i18n/         # (scaffold com 5.2)
  locale/
  currency/
  timezone/
  formatting/
```

| Camada | Responsabilidade |
|--------|------------------|
| **shared-core** | Regras puras, contratos, tipos, cálculos, políticas |
| **Apps** (`pdv-importados`, `pdv-local`) | UI, adapters, Server Actions, integração Next/Tauri |

**Não mover telas** nesta fase. Detalhe: [ADR-005](../adr/ADR-005-fronteiras-dominio-shared-core.md).

### Por domínio: dono dos dados · eventos · contratos

| Módulo | Dono dos dados (SSoT) | Eventos (exemplos) | Contratos (interfaces / RPCs) |
|---|---|---|---|
| **sales** | `vendas`, `itens_venda`, `vendas_pagamentos`, `devolucoes` (pós-venda), auditoria de cancel | `SALE_REGISTERED`, `SALE_CANCELLED`, `SALE_PARTIAL_RETURN` | `finalizar_venda_*`, `cancelar_venda_*`, `devolver_ou_trocar_*`; ports de venda |
| **inventory** | `estoque`, `movimentos_estoque_log`, `estoque_reposicoes_cancelamento` | baixa/entrada (kardex unificado) | parte estoque de `criar_produto_com_estoque_inicial`; ajustes `/admin/estoque` |
| **cash** | `caixas`, `movimentacoes_caixa`, \(E(c)\) via RPC | abertura/fechamento; sangria/suprimento (não venda) | `calcular_valor_sistema_dinheiro_caixa`, `fechar_caixa_*`, `registrar_movimentacao` |
| **products** | `produtos`, cache GTIN, status publicação | cadastro / publicação (a definir no ADR de catálogo) | CRUD catálogo SSoT `/admin/catalogo`; sugestão GTIN |

Transversais (auth/loja, erros, money helpers até migrar formatting) ficam no próprio `shared-core` (exports públicos), **não** em `modules/shared`.

### Regras de fronteira (5.1)

1. **Um módulo escreve suas tabelas**; outros só leem via contrato/port ou evento.
2. **Venda não escreve** `movimentacoes_caixa` (já validado na Missão 4).
3. **Caixa não é SSoT de pagamento** — `vendas_pagamentos` permanece em **sales**.
4. **\(E(c)\) permanece autoridade de esperado** (ADR-CAIXA-002) — dono **cash**.
5. **`saldo_atual` não é fonte contábil** (ADR-CAIXA-002).
6. **SSoT de entidade UI** (entity-ssot) continua: produto só em `/admin/catalogo`, etc.
7. Apps não fazem “god import” de regras de domínio sem passar por port do `shared-core`.

### Entregáveis 5.1

- [x] ADR-005: Fronteiras de domínio e shared-core
- [x] **PR 5.1a:** Inventário [`docs/architecture/inventario_dominio_modulo_tabela_writer.md`](../architecture/inventario_dominio_modulo_tabela_writer.md) + `npm run guard:domain` ([`scripts/domain-boundary-guard.mjs`](../../scripts/domain-boundary-guard.mjs))
- [ ] **PR 5.1b:** Scaffold mínimo sob `shared-core/src/{sales,inventory,cash,products,…}` (sem mudar comportamento)
- [ ] Mover **apenas** 1–2 ports/helpers por PR seguinte (sem mudar comportamento)

### Fora de 5.1

- Rewrite de RPCs
- Novo modelo de caixa / materializar `saldo_atual`
- Tradução completa da UI
- Mover telas

---

## 5.2 — Internacionalização base

### Objetivo

Criar **núcleo** internacionalizável **no mesmo** `@fastproduct/shared-core`. **Não** traduzir tudo.

### Estrutura alvo (ADR-005 §6)

```
shared-core/src/
  i18n/         # catalog, keys, fallback, missing-key policy
  locale/       # locale negotiation (BCP 47)
  currency/     # código moeda, arredondamento (ABNT vs outros — decisão futura)
  timezone/     # fuso da loja / display
  formatting/   # número, data, dinheiro para UI
```

### Idiomas / locales iniciais

| Locale (BCP 47) | Completude alvo na 5.2 |
|---|---|
| **pt-BR** | Completo (fonte atual) |
| **zh-CN** | Estrutura + chaves críticas PDV (pode herdar parcial do `zh` existente) |
| **en-US** | Estrutura + fallback; strings podem apontar para pt-BR temporariamente |

### Princípios

1. **Idioma separado de país/região**; locale de UI = BCP 47.
2. **Keys estáveis** (`sales.cancel.motivo_obrigatorio`) — não string solta na UI nova.
3. **Fallback:** `requested locale → pt-BR → key`.
4. **Nenhum domínio conhece idioma** — resolução na borda / via `i18n` + `formatting`.
5. **Formatting ≠ translation:** moeda/número/data sempre via `formatting/`, nunca `toLocaleString` ad hoc em código novo.
6. **Timezone da loja** como input de relatório/fechamento (não hardcode `-03`).
7. Reaproveitar i18n existente (`pt.json` / `zh.json`) como **fonte de migração**, não como destino final.
8. DEC-007 (sem next-intl / sem prefixo de URL no D0) permanece até ADR de i18n dedicado.

### Entregáveis 5.2

- [ ] Scaffold `i18n|locale|currency|timezone|formatting` no shared-core + 3 locales
- [ ] ADR: “i18n + formatting policy” (quando implementar)
- [ ] 1 tela piloto (ex.: mensagem de erro de cancel) usando o núcleo
- [ ] Documentar gap: o que ainda está só em JSON legado

### Fora de 5.2

- Traduzir todo o gerente/admin
- Multi-currency operacional (só foundation de `currency/`)

---

## 5.3 — Limpeza das dívidas conhecidas (backlog)

Itens **não** são pré-requisito para scaffold 5.1/5.2. São missões/PRs dedicados.

### Caixa / liquidez

| ID | Item | Origem | Notas |
|---|---|---|---|
| **D-A1** | `saldo_atual` não materializado na venda DINHEIRO | Missão 4 | \(E(c)\) é SSoT do esperado; A é contador físico stale |
| **D-A3** | `devolver_ou_trocar` ainda pode `DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE` | Missão 4 | Alinhar a best-effort do cancel **ou** materializar A |
| **D-A4** | `recalcular_saldo_caixa` = VI+movs (ignora vendas) | Mapa autoridade | Perigoso se chamado em produção |

### Diagnóstico

| Item | Notas |
|---|---|
| Manter funções de consistência confiáveis | `verificar_consistencia_venda` já corrigida (BUG-4.4-DIAG-01); expandir cobertura sem ambiguidade PL/pgSQL |
| Relatórios de consistência de turno | Opcional — pós 5.1 `cash`/`sales` |

### CI

| Item | Notas |
|---|---|
| Resolver pipeline | PR #217 mergeou com checks UNSTABLE (falhas ~2s); investigar runners/gitleaks/CI backend |
| Gates mínimos verdes em `main` | build pdv-importados + migration drift + secret scan |

### Prioridade sugerida (5.3)

1. **CI** (desbloqueia confiança em todo PR da Missão 5)  
2. **D-A3** (dor operacional real em devolução)  
3. **D-A1** (+ decisão se A deve espelhar venda)  
4. **D-A4** (hardening / revoke / reescrever)

---

## Branch de referência

| Branch | Ação |
|---|---|
| `consolidate/missao3-20260718` | **Manter** por alguns dias após merge #217 |
| Critério para apagar | `main` estável (CI razoável + smoke ops 4.2/4.3 ok em staging) |
| Apagar | Só com ordem explícita — **não** automático nesta missão |

---

## Critérios de aceite da Missão 5 (agregado)

| Fatia | GO quando |
|---|---|
| **5.1** | ADR-005 + inventário + boundary check + scaffold sob `@fastproduct/shared-core` (PRs 5.1a → 5.1b); zero mudança de regra de negócio |
| **5.2** | Núcleo i18n/locale/formatting no mesmo shared-core; pt-BR/zh-CN/en-US; 1 fluxo piloto; formatting centralizado em código novo |
| **5.3** | Backlog priorizado em issues/ADR; CI com diagnóstico e plano — itens D-A* fechados em PRs próprios |

---

## Ordem de execução recomendada

1. ~~Aceite deste documento~~ — **feito** 2026-07-18 (ADR-005 + Missão 5).  
2. ~~**PR 5.1a:** inventário + boundary guards~~ — entregue nesta branch.  
3. **PR 5.1b:** scaffold mínimo sob `@fastproduct/shared-core`.  
4. PRs seguintes: mover contratos pequenos.  
5. Scaffold i18n (5.2) após scaffold 5.1b.  
6. Trilha CI (5.3) em paralelo desde o dia 1.  
7. D-A3 / D-A1 quando houver capacidade — **PRs isolados**.

---

## Relacionados

- **ADR-005 (5.1):** [`docs/adr/ADR-005-fronteiras-dominio-shared-core.md`](../adr/ADR-005-fronteiras-dominio-shared-core.md)
- **Inventário 5.1a:** [`docs/architecture/inventario_dominio_modulo_tabela_writer.md`](../architecture/inventario_dominio_modulo_tabela_writer.md)
- **Boundary guard:** [`scripts/domain-boundary-guard.mjs`](../../scripts/domain-boundary-guard.mjs) (`npm run guard:domain`)
- ADR-CAIXA-002: [`docs/adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md`](../adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md)
- Consolidação Missão 4: [`backend/artifacts/missao4_5_consolidacao_ciclo_comercial_20260718.md`](../../backend/artifacts/missao4_5_consolidacao_ciclo_comercial_20260718.md)
- Mapa autoridade caixa: [`backend/artifacts/mapa_autoridade_caixa_20260718.md`](../../backend/artifacts/mapa_autoridade_caixa_20260718.md)
- Entity SSoT: `.cursor/rules/entity-ssot.mdc`
- PR merge ciclo comercial: [#217](https://github.com/nocodenn-cell/fastproduct/pull/217)

---

## Sign-off

| Papel | Nome | Data |
|---|---|---|
| Produto | Aceite Missão 5 (5.1 / 5.2 / 5.3) + ADR-005 | 2026-07-18 |
| Eng lead | Path `@fastproduct/shared-core` (ADR-005) + Missão 5 | 2026-07-18 |

**Decisão path 5.1:** aceita — único núcleo `@fastproduct/shared-core` (ver ADR-005).  
**Decisão Missão 5 agregada:** **aceita** — divisão 5.1 → 5.2 → 5.3; PR 5.1a = inventário + boundary guards (sem scaffold).

---

## Próxima ação

1. ~~PR 5.1a~~ — inventário + `guard:domain` entregues nesta branch.  
2. **PR 5.1b** — scaffold mínimo sob `@fastproduct/shared-core` (sem mover comportamento).  
3. Manter `consolidate/missao3-20260718` como referência.
