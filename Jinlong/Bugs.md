# 🐛 Bugs — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[08_PROBLEMAS_E_SOLUCOES]] (2026-07-10)
> [[Home]] | [[Dashboard]] | [[Dívida Técnica]]

---

## P0 — Críticos (Bloqueiam go-live ou causam perda de dados)

### BUG-P0-001: Drift de GRANT no Supabase
- **Descrição:** GRANTs de permissão para `authenticated` foram aplicados manualmente no dashboard Supabase em vez de via migrations. Ambientes novos (staging, produção de novo cliente) não recebem esses GRANTs automaticamente.
- **Impacto:** Deploy em ambiente novo → funcionalidades bloqueadas para usuários autenticados (venda falha, relatórios bloqueados)
- **Arquivo:** `backend/supabase/migrations/255_grant_baseline_authenticated.sql`
- **Status:** 🟡 Parcialmente resolvido — migration 255 captura o baseline. Mas requer execução manual em ambientes existentes com drift.
- **Ação:** Verificar com `verify_p0_producao.sql` e `migration list` antes de produção

### BUG-P0-002: RPC Legada `finalizar_venda_*` v2/v3 Acessível
- **Descrição:** RPCs legadas de finalização de venda (v2, v3) estavam acessíveis mesmo após criação da canônica v4. Poderiam ser chamadas sem as validações mais recentes.
- **Impacto:** Venda sem guard de preço, sem captura de eventos, potencial duplicação
- **Arquivo:** `migrations/20260619…block_v2.sql`, `migrations/20260620…block_v3.sql`
- **Status:** ✔ Resolvido — bloqueadas por migrations recentes

### BUG-P0-003: Anti-replay Apenas na Edge (não no web)
- **Descrição:** O mecanismo de nonce anti-replay (tabela `sync_request_nonces`) protege apenas o sync desktop via Edge Function. A finalização web via Server Action não tem proteção de idempotência equivalente visível.
- **Impacto:** Em caso de duplo clique ou retry de rede, pode criar venda duplicada na web
- **Arquivo:** `pdv-importados/app/caixa/actions.ts` + `migrations/061_venda_idempotency.sql`
- **Status:** 🟡 Parcial — migration 061 existe (`venda_idempotency`); verificar se Server Action usa a chave de idempotência
- **Ação:** Confirmar que `actions.ts` passa `idempotency_key` para a RPC

---

## P1 — Importantes (Degradam experiência ou causam inconsistência)

### BUG-P1-001: Buraco no Kardex em Devolução/Troca
- **Descrição:** Ajuste manual de estoque, trocas e devoluções pós-venda não passam por uma RPC única. Cada operação pode atualizar o saldo sem registrar corretamente no kardex.
- **Impacto:** Kardex com buracos → relatórios de estoque incorretos → decisões de recompra erradas
- **Arquivo:** `backend/supabase/migrations/048_devolucoes.sql` (incompleto)
- **Status:** 🟡 Parcial — `docs/BACKLOG_TECNICO.md` item 3 documenta o risco

### BUG-P1-002: TODO Bling não Implementado
- **Descrição:** O adaptador fiscal do `fiscal-worker` tem um TODO explícito para integração com Bling. A função existe mas não funciona para esse provider.
- **Impacto:** Clientes que usam Bling para NF-e não têm suporte fiscal
- **Arquivo:** `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts:TODO: Implementar integração específica com Bling`
- **Status:** 🔴 Pendente

### BUG-P1-003: ADR-PDV-001 com Status "Proposto"
- **Descrição:** O ADR sobre o pipeline de bip (scan → carrinho) está com status "Proposto", mas a implementação já existe. O ADR desatualizado pode causar confusão sobre quais decisões foram tomadas.
- **Impacto:** Governança informal — mudanças no pipeline podem ocorrer sem revisão do ADR
- **Arquivo:** `docs/adr/ADR-PDV-centro-de-gravidade.md`
- **Status:** 🔴 Pendente sign-off

### BUG-P1-004: MATRIZ_OFFLINE_PDV.md Não Existe
- **Descrição:** O arquivo `docs/MATRIZ_OFFLINE_PDV.md` é referenciado no roadmap como "Fase F1" mas não existe no repositório.
- **Impacto:** Sem matriz, comportamento em queda de rede é informal e inconsistente entre web e desktop
- **Arquivo:** `docs/MATRIZ_OFFLINE_PDV.md` (ausente)
- **Status:** 🔴 Pendente

### BUG-P1-005: Arredondamento Heterogêneo
- **Descrição:** `PricingService.ts` foi auditado e usa `roundAbnt`, mas outros pontos do código (carrinho, totais, UI) ainda podem usar `Math.round`/`toFixed` diretamente, divergindo do banco PostgreSQL (`public.round_abnt`).
- **Impacto:** Diferenças de centavos entre o que o cliente vê e o que é gravado — problema fiscal e de confiança
- **Arquivo:** `pdv-importados/core/pricing/PricingService.ts` + vários arquivos do carrinho
- **Status:** 🟡 Parcial — `docs/BACKLOG_TECNICO.md` item 2 documenta o risco

---

## P2 — Menores (Qualidade, UX, não urgentes)

### BUG-P2-001: Cores Hardcoded Fora dos Tokens
- **Descrição:** Vários componentes usam `text-green-600`, `bg-red-100`, etc. em vez dos tokens `--fp-*`. Em mudanças de tema, essas cores não acompanham.
- **Impacto:** Inconsistência visual; dificuldade de theming futuro
- **Arquivo:** Vários em `app/caixa/` e `app/gerente/`
- **Status:** 🔴 Congelado (Feature Freeze)

### BUG-P2-002: MetricCard Duplicado
- **Descrição:** Componente `MetricCard` existe em `components/gerente/MetricCard.tsx` e em `components/ui/admin-v2/MetricCard.tsx`. As duas versões podem ter comportamentos ligeiramente diferentes.
- **Impacto:** Inconsistência visual entre painel gerente e admin v2
- **Arquivo:** `components/gerente/MetricCard.tsx` + `components/ui/admin-v2/MetricCard.tsx`
- **Status:** 🔴 Congelado (Feature Freeze)

### BUG-P2-003: Mensagens de Marketing "Offline" para Web
- **Descrição:** Documentação/marketing antigas podem mencionar "funciona offline" no contexto da web (`pdv-importados`), quando o app web é online-first. Offline é exclusivo do `pdv-local` (Tauri).
- **Impacto:** Expectativa incorreta de clientes/parceiros; suporte confuso
- **Arquivo:** `pdv-importados/README.md` (e outros docs) — `docs/BACKLOG_TECNICO.md` item 5
- **Status:** 🟡 Identificado, não corrigido

### BUG-P2-004: Venda em Espera Especificada mas Não Implementada
- **Descrição:** `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` §1 especifica "Venda em Espera" mas não há nenhuma ocorrência de `em_espera` no código ou migrations.
- **Impacto:** Feature documentada e talvez prometida, mas inexistente
- **Arquivo:** `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` §1
- **Status:** 🔴 Não implementado (congelado)

---

## Bugs Resolvidos (Referência)

| Bug | Resolução | Migration/Commit |
|---|---|---|
| Oversell de estoque | `decrementar_estoque_seguro` com `FOR UPDATE + version` | `migrations/016, 029, 038` |
| Venda duplicada (retry desktop) | Anti-replay HMAC + nonce | `migrations/024` |
| Divergência de variantesChaveLeitura | Fonte única em `shared-core` | Resolvido no branch atual |
| RPC legadas acessíveis (v2/v3) | Bloqueio por migrations | `20260619…`/`20260620…` |
| Campos fiscais ausentes em produção | Capturado por auditoria e aplicado | `migrations/210, 255` |
| Desconto sem rate limit | Rate limit por escopo | `migrations/022` |

---

> Ver dívida técnica em [[Dívida Técnica]] · Roadmap de correções em [[Roadmap]]
