# Auditoria de Completude dos Módulos — Fechamento para Produção

**Papéis:** Principal Engineer · Product Owner · QA Lead · Release Manager
**Data:** 2026-07-16
**Escopo:** fechar os módulos existentes para produção. **Sem novas features, sem refatoração estética, sem abrir novas frentes.**

> **Método:** matriz baseada em **evidência real** coletada nesta sessão (suíte de testes, typecheck, guards arquiteturais, build Vercel), não em suposição. Onde a completude depende de validação funcional (e2e/manual) que a automação não cobre, isto é declarado explicitamente — não inflo status para "100%".

---

## 0. Evidência-base (executada nesta sessão)

| Verificação | Comando | Resultado |
|---|---|---|
| Testes web | `npm run test -w pdv-importados` | **530 passed / 103 files** · exit 0 ✅ |
| Testes shared-core | `npm run test -w shared-core` | **76 passed / 13 files** · exit 0 ✅ |
| Testes desktop | `npm run test -w pdv-local` | **57 passed / 11 files** · exit 0 ✅ |
| **Total de testes** | — | **663 passed · 0 failed · 0 skipped** ✅ |
| Typecheck | `npm run typecheck -w pdv-importados` | exit 0 ✅ |
| Guards arquiteturais | `npm run guard:all` | 7/7 OK · exit 0 ✅ |
| Regra de negócio na UI | `guard:core` | OK — core decide, UI apresenta ✅ |
| Fluxo de venda único | `guard:rpc` | OK — v4 (web) \| `registrar_venda_com_itens` (local) ✅ |
| Rotas admin | `guard:routes` | OK — 23 rotas `/admin` com página ✅ |
| SSOT de entidade | `check:entity-ssot` | OK — 7 avisos legado (ver §3) ⚠️ |
| Dívida técnica marcada | `grep TODO/FIXME` em core/lib | **0** ✅ |
| Build autoritativo | Vercel Preview (PR #198) | **READY** ✅ |

**Leitura de Release Manager:** todos os portões **automatizados** estão verdes. As lacunas para "100%" restantes são **funcionais/de produto** (exigem e2e ou validação manual) e **arquiteturais-legado** (UI dupla gerente↔Admin V2), detalhadas abaixo.

---

## 1. FASE 1 — Matriz de completude

Legenda de status: 🟢 pronto (fluxo + testes + guards) · 🟡 funcional com pendência conhecida · 🟠 parcial/depende de validação · 🔴 bloqueador.

### 1. PDV Caixa — 🟢
- **O que existe:** fluxo de venda ponta a ponta (v4 web / RPC local), scanner pipeline (golden/invariants/transitions), atalhos keyboard-first, métodos de pagamento, troco, sangria/suprimento, reconnect/replay.
- **Testes:** ~31 (20 `app/caixa` + 2 `core/caixa` + 9 `shared-core/pdv` + invariantes).
- **O que falta:** validação e2e Playwright em CI (bloqueada por quota GitHub — Vercel é autoritativo).
- **Bugs conhecidos:** nenhum aberto na suíte.
- **Critério de pronto:** ✅ fluxo, ✅ testes, ✅ guards pdv/rpc, ✅ invariantes.

### 2. Produtos — 🟡
- **O que existe:** CRUD, form modal, duplicar, Bulk Import consolidado (fonte única `parseAndValidateImportRow`), status de publicação canônico (`isRascunho`).
- **Testes:** ~14 (6 `components/gerente/produtos` + 1 `core/catalog` + 7 `lib/gerente`).
- **O que falta:** UI incremental de Bulk Import (domínio/validação/gate prontos e testados; interface em construção). Consolidar UI dupla (§3).
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** ✅ fluxo, ✅ testes, ⚠️ UI dupla gerente/admin.

### 3. Estoque — 🟠
- **O que existe:** ajuste de estoque, importar-NFe, devolução/troca (migration 248, RPC `devolver_ou_trocar_venda`), kardex (view `v_kardex_unificado`).
- **Testes:** ~2 diretos + smoke SQL ponta a ponta (`SMOKE_OK`, ambiente **local Docker**).
- **O que falta:** migration 248 **validada só em local** — não aplicada em `jinlong` (por decisão); **kardex UI completa** é roadmap Fase 5.
- **Bugs conhecidos:** 2 bugs da RPC 248 já corrigidos no smoke (CASE record não-atribuído; typo `RETURN QUERY`).
- **Critério de pronto:** 🟠 depende de homologação remota da 248 + gate financeiro.

### 4. Financeiro — 🟡
- **O que existe:** contas a pagar/receber, ledger (`core/ledger`), documentos fiscais, timeline de eventos fiscais, comissões.
- **Testes:** ~4 (2 `gerente/financeiro` + 2 `core/ledger`).
- **O que falta:** cobertura de teste mais ampla no financeiro; consolidar UI dupla (§3).
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** ✅ fluxo, ⚠️ cobertura, ⚠️ UI dupla.

### 5. Fiscal — 🟠
- **O que existe:** `fiscal-worker` (Edge v35), fila `AUTO_ENQUEUE_FISCAL_ON_*`, provider abstrato (`FISCAL_PROVIDER_*`), timeline fiscal.
- **Testes:** 1 (`fiscalEventTimeline`).
- **O que falta:** **provider Focus real** (roadmap Fase 5 — hoje abstrato/homolog); cobertura de emissão real.
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** 🟠 integração real do provider fiscal pendente por design.

### 6. Clientes — 🟡
- **O que existe:** CRUD cliente, vínculo em vendas, vendas em espera com `cliente_id`.
- **Testes:** 0 diretos no módulo (fluxo exercitado via caixa/vendas).
- **O que falta:** `cliente_id` em `vendas_em_espera` é **débito técnico documentado** (persistido, consumo parcial) — ver `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`. Cobertura de teste dedicada.
- **Bugs conhecidos:** nenhum aberto (débito controlado).
- **Critério de pronto:** 🟡 fluxo ok, cobertura dedicada ausente.

### 7. Usuários / Permissões — 🟢
- **O que existe:** login, conta desativada canônica (`isContaDesativada`), painel gerencial, `validar-gerente` (Edge v43, `verify_jwt`), RLS, desconto gerente estrito (`STRICT_MANAGER_DISCOUNT_AUTH`).
- **Testes:** 2 (`core/auth` + `lib/auth`) + `managerDiscount` (shared-core) + RLS smoke em CI.
- **O que falta:** RLS smoke depende de CI (quota).
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** ✅ fluxo, ✅ testes, ✅ permissões.

### 8. Admin / Painel — 🟡
- **O que existe:** Admin V2 com 23 rotas (`guard:routes` OK), sidebar nav, dashboard, auditoria, diagnóstico caixa.
- **Testes:** cobertos via módulos de domínio.
- **O que falta:** **coexistência com layer legado `/gerente`** (§3) — dupla autoridade de UI a consolidar.
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** 🟡 rotas ok, consolidação de UI pendente.

### 9. Offline / Tauri (pdv-local) — 🟢
- **O que existe:** carrinho offline (`cartStore`), outbox sync, equivalência de preço online↔offline (`offlineRpcEquivalence.golden`), paridade operacional com fixture de produção.
- **Testes:** 57 (11 arquivos) — inclui golden e prod-fixture.
- **O que falta:** validação em hardware real de loja (fora de escopo de código).
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** ✅ fluxo, ✅ testes golden/paridade.

### 10. Sincronização — 🟢
- **O que existe:** `sync-outbox` (Edge v68), replay/reconnect (`docs/RECONNECT_REPLAY_POLICY.md`), device allowlist opcional, validação de evento de outbox.
- **Testes:** ~6 (outbox/sync em pdv-local) + contrato de pipeline.
- **O que falta:** allowlist de device é opcional/tuning (custom secrets).
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** ✅ fluxo, ✅ testes, ✅ replay policy documentada.

### 11. Design System — 🟡
- **O que existe:** tokens `jl-*` em 110 arquivos, componentes compartilhados, plano de acessibilidade ARIA (`FASE_3_ARIA_ACCESSIBILITY_PLAN.md`).
- **Testes:** via testes de componente.
- **O que falta:** execução completa do plano ARIA (Fase 3 em progresso).
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** 🟡 tokens consistentes, ARIA em progresso.

### 12. Observabilidade — 🟡
- **O que existe:** Sentry (client/server/edge configs), telemetria de scan (`CAIXA_SCAN_TELEMETRY_SAMPLE_RATE`), observability em shared-core.
- **Testes:** 1 (`shared-core/observability`).
- **O que falta:** confirmar `SENTRY_DSN` nos cofres de produção (ver auditoria de ambientes §7); dashboards.
- **Bugs conhecidos:** nenhum aberto.
- **Critério de pronto:** 🟡 instrumentação presente, config de produção a confirmar.

---

## 2. FASE 2 — Definição de Done (scorecard global)

| Critério de Done | Estado | Evidência |
|---|:---:|---|
| Fluxo completo funcionando | 🟡 | núcleo (caixa/venda/sync/offline) 🟢; estoque/fiscal 🟠 |
| Validação de erros | 🟢 | Result types, invariantes, `try/catch` no fluxo de venda (guard:pdv) |
| Testes automatizados | 🟢 | 663 verdes, 0 skip |
| Integração com banco correta | 🟢 | RPC única (guard:rpc); RLS; migrations sequenciais (guard:migrations) |
| Permissões corretas | 🟢 | `validar-gerente`, RLS, desconto estrito |
| Sem código duplicado | 🟡 | helpers canônicos ✅; **UI gerente/Admin V2 duplicada** ⚠️ (§3) |
| Sem regra de negócio na UI | 🟢 | `guard:core` OK |
| Documentação mínima | 🟢 | docs/ extensa + auditorias |
| Build Vercel passando | 🟢 | Preview READY |

**Veredito de Release Manager:** o produto está **verde em todos os portões automatizados** e o núcleo transacional (PDV/venda/sync/offline/permissões) atende ao Done. **Não declaro "12/12 módulos 100%"** porque Estoque(3)/Fiscal(5) dependem de homologação remota + provider real, e há dívida de UI dupla (§3). Status honesto: **núcleo production-ready; cauda (estoque remoto, fiscal real, consolidação de UI) em fechamento.**

---

## 3. Achado arquitetural — dupla autoridade de UI (gerente ↔ Admin V2)

`check:entity-ssot` reporta 5 page-clients `@legacy` migrados para Admin V2 mas ainda ativos:
`compras`, `financeiro`, `produtos`, `relatorios`, `vendas` (`app/gerente/*`).

- **Não é código morto:** `/gerente/*` tem navegação própria (`GerenteHeaderNav`) e é cross-linkado (demo-fluxo, recebimento, etc.).
- **É dívida de "autoridade única":** duas UIs para os mesmos domínios.
- **Ação correta:** consolidação **com gate de validação** ("remover após validação", conforme o próprio guard) — **não** um delete cego. Fora do escopo de correção automática desta sessão (violaria "não remover sem evidência / não refatorar por estética").
- **Rastreado como:** item **P2 (consolidação de UI)** no backlog abaixo.

---

## 4. FASE 3 — Backlog priorizado (execução)

| Prio | Item | Tipo | Evidência/gate | Estado |
|---|---|---|---|---|
| **P0** | Confirmar config de produção (Vercel/Supabase/GitHub) | auditoria de ambientes | `docs/AUDITORIA_AMBIENTES_PRODUCAO.md` §7 P1–P9 | ⏳ requer confirmação humana (dashboard) |
| **P0** | Homologar migration 248 (devolução) em `jinlong` + gate financeiro | estoque/financeiro | smoke SQL já OK em local; falta remoto | ⏳ bloqueado por plano Supabase |
| **P1** | PDV Caixa — fechar e2e crítico | qa | `test:e2e:critical` (CI quota) / Vercel autoritativo | 🟢 lógica pronta; e2e pendente por infra |
| **P2** | Produtos — UI incremental Bulk Import | produto | domínio+validação+gate prontos e testados | 🟡 em construção |
| **P2** | Consolidar UI dupla gerente→Admin V2 (§3) | arquitetura | gate de validação por módulo | ⏳ requer validação, não delete cego |
| **P3** | Estoque — kardex UI completa | produto | roadmap Fase 5 | ⏳ |
| **P4** | Financeiro — ampliar cobertura de testes | qa | — | ⏳ |
| **P5** | Fiscal — provider Focus real | integração | roadmap Fase 5 | ⏳ |
| **P6** | Offline/SYNC — validação em hardware de loja | ops | fora de escopo de código | ⏳ |

**Nota de execução honesta:** nesta sessão **não há bloqueador de código verde-para-vermelho a corrigir** — testes/typecheck/guards/build estão verdes. Os P0 restantes são **operacionais** (confirmação de cofres de produção; homologação remota bloqueada por plano Supabase), não defeitos de código. Conforme as regras da sprint, não fabrico "correções" onde a evidência mostra verde, nem removo o layer legado sem o gate de validação.

---

## 5. Checklist de lançamento (FastProduct Production Ready)

- [x] Testes verdes — 663/663
- [x] Typecheck limpo
- [x] Guards arquiteturais 7/7
- [x] Sem regra de negócio na UI (guard:core)
- [x] Fluxo de venda único (guard:rpc)
- [x] Build Vercel READY
- [x] Sem secret real versionada (auditoria de ambientes §5)
- [ ] Config de produção confirmada nos cofres — `AUDITORIA_AMBIENTES_PRODUCAO.md` §7 (dashboard)
- [ ] Migration 248 homologada em `jinlong` + gate financeiro 5/5
- [ ] e2e crítico executado (CI ou manual) — quota GitHub
- [ ] UI dupla gerente→Admin V2 consolidada (com gate)
- [ ] Provider fiscal real (Focus) ou escopo fiscal congelado no piloto

**Riscos conhecidos documentados:**
1. Dois projetos Supabase (`jinlong` prod / `ageguard` secundário) — risco de divergência (auditoria de ambientes §2).
2. UI dupla gerente/Admin V2 — dívida de autoridade única (§3).
3. Migration 248 validada só em local — não em produção.
4. Provider fiscal abstrato — emissão real pendente (por design no piloto).
5. CI GitHub bloqueado por quota — Vercel é o build autoritativo.

**Conclusão:** núcleo transacional **production-ready** por evidência automatizada; go-live final gated por itens **operacionais** (cofres + homologação remota), não por defeito de código.
