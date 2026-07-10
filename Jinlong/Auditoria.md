# 🔍 Auditoria Arquitetural — Jīn Lóng

> [[Home]] | [[Dívida Técnica]] | [[Decisoes]]

---

## Single Source of Truth (SSoT)

### Violações Resolvidas

| Domínio | Violação (passado) | Resolução |
|---|---|---|
| `variantesChaveLeitura` | Web e desktop com implementações separadas | ✅ Movido para `shared-core/src/caixa/variantesChaveLeitura.ts` |
| GRANTs de banco | Aplicados manualmente no dashboard, não em migrations | ✅ Capturado em `migrations/255_grant_baseline_authenticated.sql` |
| RPCs de finalização | 4 versões de `finalizar_venda_*` ativas simultaneamente | ✅ v2/v3 bloqueadas; v4 é o padrão; v1 (legada) mantida só para desktop antigo |

### Violações Ativas

| Domínio | Evidência | Impacto |
|---|---|---|
| Arredondamento monetário | `roundAbnt` em `shared-core`, mas `Math.round`/`toFixed` possivelmente fora do motor | Diferença de centavos web × banco |
| `MetricCard` duplicado | Existe em 2 locais com código diferente | Inconsistência visual entre gerente e admin v2 |
| `unifiedCartStore` vs `carrinhoStore` | Dois stores de carrinho — experimental convive com o padrão | Confusão sobre qual store é autoritativo |
| Comportamento offline não documentado | `MATRIZ_OFFLINE_PDV.md` não existe | Ambiguidade entre web e desktop |

---

## Acoplamentos Identificados

### Acoplamento Positivo (Intencional)

| Componente A | Componente B | Tipo |
|---|---|---|
| `pdv-importados/core/pricing/` | `shared-core/pricing/` | Reexportação — A usa B |
| `pdv-local/src/catalogoLookup.ts` | `shared-core/src/caixa/variantesChaveLeitura.ts` | Import direto via `@core` |
| `app/caixa/actions.ts` | RPC `finalizar_venda_canonica_v4` | Server Action chama RPC — correto |

### Acoplamentos de Risco

| Componente A | Componente B | Risco |
|---|---|---|
| `pdv-local` | `registrar_venda_com_itens` (legada) | Desktop usa RPC legada; se for removida, desktop quebra |
| `fiscal-worker` | `documentos_fiscais_pendentes` | Worker depende do schema específico da tabela; mudanças no schema exigem mudança no worker |
| `sync-outbox` Edge | `SYNC_KEY` secret | Se o secret for rotacionado sem atualizar o desktop, sync para |

---

## Dependências Circulares

Não foram identificadas dependências circulares entre módulos no nível de `import`. Os guards arquiteturais (`guard:core`) previnem que `shared-core` importe do `pdv-importados` ou `pdv-local`.

---

## Violações Arquiteturais Históricas (Corrigidas)

| Violação | Documentação | Status |
|---|---|---|
| Drift de schema entre repositório e Supabase remoto | `docs/AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` | ✅ Corrigido |
| Campos fiscais ausentes em produção | `docs/AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` §6 | ✅ Corrigido via migration 210 |
| RPC `decrementar_estoque_idempotente` acessível para `authenticated` | Migrations 070/071 | ✅ Revogado para `authenticated`; mantido para `service_role` |
| Overloads `finalizar_venda_*` v2 e v3 acessíveis | Migrations `20260619…`/`20260620…` | ✅ Bloqueados |

---

## Regras Duplicadas

| Regra | Locais onde aparece |
|---|---|
| Cálculo de margem | `ComercialSection.tsx` (UI) + constraint no banco (`guard_margem_negativa`) |
| Validação de estoque | `CartEngine` (UI) + `decrementar_estoque_seguro` (banco) |
| Prioridade de preço | `shared-core/pricing/resolution.ts` + documentada em `CONTEXT.md` |
| Idioma padrão do operador = PT | `middleware.ts` + `LanguageContext` + `CONTEXT.md` |

**Nota:** Regras no banco + na UI é intencional para performance (feedback imediato) + segurança (banco é autoritativo). A duplicação aqui é arquitetural necessária, não dívida.

---

## Lógica Espalhada (Não Consolidada)

| Lógica | Arquivos | Ação |
|---|---|---|
| Arredondamento monetário | `shared-core/money/roundAbnt.ts` + possivelmente `Math.round` em `app/` | Auditar e consolidar |
| Configuração de desconto | `migrations/122_limite_desconto_manual_itens.sql` + `managerDiscount.ts` (Zustand) + `validar-gerente` Edge | Documentar fluxo canônico |
| Status de caixa | `migrations/230_caixa_status_fechamento.sql` + `stores/` | Fonte única é o banco; store é cache |

---

## Componentes Gigantes

| Componente | Evidência | Risco |
|---|---|---|
| `CaixaPageClient.tsx` | Integra scan pipeline, carrinho, pagamento, desconto, modais | Difícil de testar isoladamente; mudanças têm alto blast radius |
| `ProdutoFormModal.tsx` | 5 seções de formulário | Rerenderização total em cada mudança de campo |
| `DataTablePage.tsx` | Genérico para múltiplas telas | Props excessivas podem virar "God Object" |

---

## Segurança — Auditoria RLS

### Matriz de Políticas Verificadas

| Tabela | SELECT | INSERT | UPDATE | DELETE | Observação |
|---|---|---|---|---|---|
| `usuarios` | Próprio + dono vê loja | — | Próprio | — | OK |
| `produtos` | Autenticado | Gerente+ | Gerente+ | Gerente+ | OK |
| `estoque` | Mesma loja | Via RPC | Via RPC | — | OK — mutação só por RPC |
| `vendas` | Própria/loja | Via RPC | — | — | OK — INSERT só por RPC canônica |
| `itens_venda` | Via join | Via RPC | — | — | OK |
| `caixas` | Autenticado | Via RPC | Via RPC | — | OK |
| `contas_receber` | Gerente+ | — | Gerente+ | — | OK |
| `documentos_fiscais_pendentes` | Gerente+ | Via RPC | Via worker | — | OK |
| `vendas_eventos_ledger` | Gerente+ | Imutável (trigger) | Bloqueado | Bloqueado | ✅ Forte |
| `sync_request_nonces` | Edge only | Edge only | — | — | OK |

**Documento de referência:** `docs/AUTHORIZATION_MATRIX.md`

---

## Segurança — Anti-fraude

| Proteção | Implementação | Status |
|---|---|---|
| Preço autoritativo | Banco recalcula preço no commit da venda | ✅ Ativo (migration 123, 234, 250, 254) |
| Anti-replay (desktop) | HMAC SHA256 + nonce por request | ✅ Ativo (migration 024) |
| Rate limit de desconto | Por escopo + por operador | ✅ Ativo (migration 022) |
| Token de desconto com revogação | JWT curto-prazo + tabela de auditoria | ✅ Ativo (migration 018) |
| Anti-oversell | `FOR UPDATE + version` na baixa de estoque | ✅ Ativo (migration 016, 029, 038) |
| RLS em todas as tabelas | PostgreSQL Row Level Security | ✅ Ativo |
| HTTPS/SSL | Vercel (web) + Supabase (banco) | ✅ Por padrão |
| Secrets não versionados | `.env` local + Vercel env + Supabase secrets | ✅ Confirmado |

---

## CI/CD — Auditoria

| Gate | O que bloqueia | Status |
|---|---|---|
| `build-and-test` | Lint + Vitest + build Next | 🟢 Bloqueante |
| `validate-production` | Deployment ID ↔ `/api/health` (SSRA) | 🟢 Bloqueante |
| `e2e-critical` | Playwright (caixa, sync, multi-pagamento) | 🟡 Não bloqueante (risco) |
| `deno-check` | Type-check das Edge Functions | 🟢 Bloqueante |
| `supabase-local-rls-smoke` | Smoke SQL com RLS local | 🟢 Bloqueante |
| `guard:all` | Guards arquiteturais (core, pdv, routes, rpc, pricing, deps, migrations) | 🟢 Bloqueante |

**Risco:** E2E não bloqueia o deploy. Uma falha de E2E é sinalizada mas não impede produção. Isso é uma decisão deliberada (SSRA), mas exige monitoramento ativo.

---

## Observabilidade

| O que | Onde | Status |
|---|---|---|
| Logs de Edge Function | JSON estruturado em `sync-outbox` e `validar-gerente` | 🟢 Ativo |
| Telemetria de scan | `app/api/caixa/scan-telemetry/` + migrations 095-097 | 🟢 Ativo |
| Ledger de eventos de venda | `vendas_eventos_ledger` | 🟢 Ativo |
| Auditoria de consistência | `migrations/244` | 🟢 Ativo |
| Métricas de sync desktop | `pdv-local/src/lib/logger.ts` | 🟡 Logs locais; sem envio para servidor |
| APM / Sentry | Não encontrado | 🔴 Ausente |
| Alertas de erro em produção | Não encontrado | 🔴 Ausente |

---

> Ver dívida técnica em [[Dívida Técnica]] · Decisões que geraram esses padrões em [[Decisoes]]
