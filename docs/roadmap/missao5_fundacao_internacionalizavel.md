# Missão 5 — Fundação Arquitetural Internacionalizável

| Campo | Valor |
|--------|--------|
| **ID** | MISSÃO-5 |
| **Status** | Draft — documento antes de qualquer implementação |
| **Data** | 2026-07-18 |
| **Pré-requisito** | Missão 3.1 + Missão 4.1–4.5 **GO** · merge em `main` via [#217](https://github.com/nocodenn-cell/fastproduct/pull/217) (`2becdf39`) |
| **Branch de referência (manter)** | `consolidate/missao3-20260718` — **não apagar** até `main` estável por alguns dias |
| **Regra** | **Não codar** até este roadmap ser aceito (produto + eng) |

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

### Estrutura alvo (proposta)

```
modules/
  sales/        # venda, itens, pagamentos da venda, cancel/devolver (contratos)
  inventory/    # estoque, kardex, reposições, ajustes
  cash/         # caixa, E(c), sangria/suprimento, fechamento
  products/     # catálogo, GTIN, cadastro, publicação
  shared/       # tipos, erros, auth context, ports transversais
```

> Nota de encaixe no monorepo: a árvore `modules/` pode viver sob `pdv-importados/` (ou pacote workspace) — **decisão de path no aceite de 5.1**. O importante é a fronteira, não o nome absoluto no primeiro PR.

### Por domínio: dono dos dados · eventos · contratos

| Módulo | Dono dos dados (SSoT) | Eventos (exemplos) | Contratos (interfaces / RPCs) |
|---|---|---|---|
| **sales** | `vendas`, `itens_venda`, `vendas_pagamentos`, `devolucoes` (pós-venda), auditoria de cancel | `SALE_REGISTERED`, `SALE_CANCELLED`, `SALE_PARTIAL_RETURN` | `finalizar_venda_*`, `cancelar_venda_*`, `devolver_ou_trocar_*`; ports de venda |
| **inventory** | `estoque`, `movimentos_estoque_log`, `estoque_reposicoes_cancelamento` | baixa/entrada (kardex unificado) | `criar_produto_com_estoque_inicial` (parte estoque), ajustes `/admin/estoque` |
| **cash** | `caixas`, `movimentacoes_caixa`, \(E(c)\) via RPC | abertura/fechamento; sangria/suprimento (não venda) | `calcular_valor_sistema_dinheiro_caixa`, `fechar_caixa_*`, `registrar_movimentacao` |
| **products** | `produtos`, cache GTIN, status publicação | cadastro / publicação (a definir no ADR de catálogo) | CRUD catálogo SSoT `/admin/catalogo`; sugestão GTIN |
| **shared** | — (sem entidade de negócio) | — | auth/loja, erros usuário, money helpers (até 5.2 migrar formatting) |

### Regras de fronteira (5.1)

1. **Um módulo escreve suas tabelas**; outros só leem via contrato/port ou evento.
2. **Venda não escreve** `movimentacoes_caixa` (já validado na Missão 4).
3. **Caixa não é SSoT de pagamento** — `vendas_pagamentos` permanece em **sales**.
4. **\(E(c)\) permanece autoridade de esperado** (ADR-CAIXA-002) — dono **cash**.
5. **SSoT de entidade UI** (entity-ssot) continua: produto só em `/admin/catalogo`, etc.
6. Nenhum “god import” de `app/caixa` para `products` sem passar por `shared` ou port.

### Entregáveis 5.1 (quando implementar)

- [ ] Mapa `módulo → tabelas → writers atuais` (inventário)
- [ ] ADR curto: “Fronteiras modules/*”
- [ ] Scaffold `modules/{sales,inventory,cash,products,shared}` + regras de import (lint/boundary check)
- [ ] Mover **apenas** 1–2 ports/helpers por PR (sem mudar comportamento)

### Fora de 5.1

- Rewrite de RPCs
- Novo modelo de caixa / materializar `saldo_atual`
- Tradução completa da UI

---

## 5.2 — Internacionalização base

### Objetivo

Criar **núcleo** internacionalizável. **Não** traduzir tudo.

### Estrutura alvo

```
shared-core/
  i18n/         # catalog, keys, fallback, missing-key policy
  locale/       # locale negotiation (BCP 47)
  currency/     # código moeda, arredondamento (ABNT vs outros — decisão futura)
  timezone/     # fuso da loja / display
  formatting/   # número, data, dinheiro para UI
```

### Idiomas iniciais

| Locale | Completude alvo na 5.2 |
|---|---|
| **pt-BR** | Completo (fonte atual) |
| **zh-CN** | Estrutura + chaves críticas PDV (pode herdar parcial do `zh` existente) |
| **en-US** | Estrutura + fallback; strings podem apontar para pt-BR temporariamente |

### Princípios

1. **Keys estáveis** (`sales.cancel.motivo_obrigatorio`) — não string solta na UI nova.
2. **Fallback:** `requested → pt-BR → key`.
3. **Formatting ≠ translation:** moeda/número/data sempre via `formatting/`, nunca `toLocaleString` ad hoc em código novo.
4. **Timezone da loja** como input de relatório/fechamento (não hardcode `-03`).
5. Reaproveitar i18n existente (`pt.json` / `zh.json`) como **fonte de migração**, não como destino final.

### Entregáveis 5.2

- [ ] Scaffold `shared-core/*` + 3 locales
- [ ] ADR: “i18n + formatting policy”
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
| **5.1** | Scaffold + boundary check; inventário dono/evento/contrato publicado; zero mudança de regra de negócio |
| **5.2** | `shared-core` com pt-BR/zh-CN/en-US; 1 fluxo piloto; formatting centralizado em código novo |
| **5.3** | Backlog priorizado em issues/ADR; CI com diagnóstico e plano — itens D-A* fechados em PRs próprios |

---

## Ordem de execução recomendada

1. **Aceite deste documento** (sign-off abaixo).  
2. Issue/ADR 5.1 (fronteiras) — só então agente de código.  
3. Scaffold modules + boundary lint.  
4. Scaffold shared-core i18n (5.2) em paralelo leve após 5.1 scaffold.  
5. Trilha CI (5.3) em paralelo desde o dia 1.  
6. D-A3 / D-A1 quando houver capacidade — **PRs isolados**.

---

## Relacionados

- ADR-CAIXA-002: [`docs/adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md`](../adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md)
- Consolidação Missão 4: [`backend/artifacts/missao4_5_consolidacao_ciclo_comercial_20260718.md`](../../backend/artifacts/missao4_5_consolidacao_ciclo_comercial_20260718.md)
- Mapa autoridade caixa: [`backend/artifacts/mapa_autoridade_caixa_20260718.md`](../../backend/artifacts/mapa_autoridade_caixa_20260718.md)
- Entity SSoT: `.cursor/rules/entity-ssot.mdc`
- PR merge: [#217](https://github.com/nocodenn-cell/fastproduct/pull/217)

---

## Sign-off

| Papel | Nome | Data |
|---|---|---|
| Produto | | |
| Eng lead | | |

**Decisão:** _[aceitar Missão 5 nesta divisão 5.1/5.2/5.3 — ou ajustar path `modules/` / `shared-core/`]_

---

## Próxima ação (humana)

1. Revisar e aceitar este roadmap.  
2. **Não** disparar agente de implementação antes do sign-off.  
3. Manter `consolidate/missao3-20260718` como referência.
