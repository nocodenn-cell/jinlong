# ⚖️ Decisões Arquiteturais — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[07_DECISOES_ARQUITETURAIS]] (2026-07-10)
> [[Home]] | [[Arquitetura]]

---

## DEC-001: Monorepo com npm Workspaces + Turborepo

**Decisão:** Organizar o projeto como monorepo com 4 workspaces: `pdv-importados`, `pdv-local`, `backend`, `shared-core`.

**Motivo:** Compartilhar código de domínio (`shared-core`) entre web e desktop sem duplicação. Turborepo garante cache remoto e build paralelo eficiente.

**Alternativas:** Repos separados (sem compartilhamento); polyrepo com pacote npm publicado (overhead de publicação).

**Consequências:**
- ✅ `PricingService`, `CartEngine`, `variantesChaveLeitura` compartilhados sem cópia
- ✅ Um `package-lock.json` único
- ⚠️ Complexidade de configuração de paths/aliases

---

## DEC-002: Supabase como Backend

**Decisão:** Usar Supabase (PostgreSQL + Auth + RLS + PostgREST + Edge Functions) como único backend.

**Motivo:** Banco + autenticação + API + RLS prontos em minutos, sem servidor para gerenciar. Reduz surface area operacional para um time pequeno.

**Alternativas:** NestJS custom + PostgreSQL; Firebase (sem SQL relacional); PlanetScale + Auth0.

**Consequências:**
- ✅ RLS no banco = segurança por design, sem lógica de autorização no código
- ✅ PostgREST auto-gera CRUD básico
- ⚠️ Edge Functions em Deno (ecossistema diferente do Node)
- ⚠️ Vendor lock-in moderado (PostgREST + Edge Functions são Supabase-specific)

---

## DEC-003: Next.js 15 com App Router e Server Components

**Decisão:** Usar App Router com Server Components como padrão; Server Actions para mutações.

**Motivo:** Menos código cliente; dados carregados no servidor sem roundtrip; Server Actions eliminam endpoints de API para operações simples.

**Alternativas:** Pages Router (Next.js 12/13 clássico); SPA com API separada (Vite + Express).

**Consequências:**
- ✅ Carregamento inicial mais rápido
- ✅ Server Actions = sem endpoints manuais para CRUD
- ⚠️ Curva de aprendizado do App Router
- ⚠️ Hidratação e `"use client"` exige atenção

---

## DEC-004: PDV Desktop com Tauri 2 + SQLite

**Decisão:** Aplicativo desktop nativo com Tauri 2 (Rust backend + WebView) e SQLite para armazenamento local.

**Motivo:** Cliente precisa vender sem internet. PWA + IndexedDB foi descartado por limitações de storage e sincronização. Tauri é mais leve que Electron.

**Alternativas:** Electron; PWA com IndexedDB; App web com modo offline via Service Worker.

**Consequências:**
- ✅ Funciona completamente offline
- ✅ SQLite = banco real com índices, ACID
- ✅ Tauri menor que Electron (bundle ~5MB vs ~100MB)
- ⚠️ Build pipeline separado (Rust + Vite)
- ⚠️ Auto-update pendente (P3)

---

## DEC-005: Sync Outbox com HMAC SHA256 + Nonce Anti-replay

**Decisão:** Desktop sincroniza com Supabase via Edge Function com autenticação por HMAC SHA256 (não JWT) e proteção anti-replay por nonce.

**Motivo:** PDV desktop não tem sessão Supabase ativa quando está offline. HMAC com chave compartilhada (`SYNC_KEY`) é mais adequado. Nonce previne replay attacks e garante idempotência.

**Alternativas:** JWT de vida longa (risco de expiração offline); sem autenticação (inseguro).

**Consequências:**
- ✅ Seguro sem necessidade de sessão ativa
- ✅ Idempotência: venda reenviada não duplica
- ⚠️ `SYNC_KEY` é um segredo crítico (não pode ser versionado)
- ⚠️ Drift de relógio > 5 minutos → sync recusado

---

## DEC-006: RPC Canônica v4 como Padrão de Finalização de Venda

**Decisão:** Toda finalização de venda usa `finalizar_venda_transacional_canonica_v4`. RPCs v2 e v3 estão bloqueadas.

**Motivo:** Evolução para incluir captura de eventos no ledger, idempotência via `idempotency_key`, e guard de preço autoritativo. Versões legadas foram vetores de inconsistência.

**Alternativas:** Manter múltiplas versões ativas (risco de uso acidental do legado); remover os overloads completamente.

**Consequências:**
- ✅ Um único ponto de finalização = mais fácil auditar
- ✅ Todas as vendas geram eventos no ledger
- ⚠️ Desktop antigo ainda usa `registrar_venda_com_itens` (legado mantido por compatibilidade)

---

## DEC-007: i18n Manual (PT/ZH) sem next-intl

**Decisão:** Implementar i18n com arquivos JSON (`pt.json`, `zh.json`) e `getMessages()` helper próprio. URLs sem prefixo de locale (`/login`, não `/pt/login`).

**Motivo:** next-intl forçaria URLs com prefixo de locale, mudando toda a estrutura de rotas. Bilíngue só é necessário no painel gerente/dono (não no caixa, que é sempre PT).

**Alternativas:** next-intl; react-i18next; URLs com prefixo de locale.

**Consequências:**
- ✅ URLs limpas e sem mudança de estrutura de rota
- ✅ Operador sempre em PT (sem lógica de idioma no caixa)
- ⚠️ Normalização manual: `zh-HK` → `zh`
- ⚠️ Sem ferramentas de extração de mensagens

---

## DEC-008: shadcn/ui como Base de Componentes

**Decisão:** Usar shadcn/ui (componentes que o desenvolvedor owna, não uma lib de runtime) como base de design.

**Motivo:** O desenvolvedor controla o código dos componentes. Sem dependência de versão; customização total sem overrides CSS.

**Alternativas:** MUI (Material UI); Chakra UI; Mantine.

**Consequências:**
- ✅ Zero risco de breaking changes de lib externa
- ✅ Fácil de customizar com tokens `--fp-*`
- ⚠️ Cada componente precisa ser adicionado manualmente via CLI do shadcn
- ⚠️ Duplicação eventual se o componente for adicionado mais de uma vez

---

## DEC-009: Preço Autoritativo no Servidor

**Decisão:** O preço final de cada item na venda é recalculado pelo banco (RPC) no momento do commit. O cliente (browser/desktop) não pode ditar o preço final.

**Motivo:** Anti-fraude. Com tráfego interceptado ou manipulação de dados, o cliente poderia enviar preços menores.

**Alternativas:** Confiar no preço enviado pelo cliente (mais simples, inseguro); hash de preço (complexo).

**Consequências:**
- ✅ Venda com preço correto mesmo que o cliente tente manipular
- ✅ Consistência entre web e desktop
- ⚠️ Pequena latência adicional no commit (RPC extra)

---

## DEC-010: Feature Freeze para Piloto do 1º Cliente

**Decisão:** Declarar feature freeze até encerramento da Fase 4 (primeiro cliente em produção estável). Nenhuma nova feature entra sem aprovação explícita.

**Motivo:** Evitar scope creep que atrasa o go-live. MVP está funcional; riscos de expansão são maiores do que os riscos de segurar features.

**Alternativas:** Continuar desenvolvendo em paralelo ao go-live; mini-sprints com features pequenas.

**Consequências:**
- ✅ Foco total em estabilidade e onboarding do 1º cliente
- ⚠️ Venda em Espera, NFC-e real, auto-update congelados
- ⚠️ Pressão acumulada de features para pós-piloto

---

## DEC-011: Sem next-intl / URLs sem Prefixo de Locale

> Já coberta em DEC-007. Mantida aqui como referência rápida.

---

## DEC-012: `shared-core` como Fonte Única de Domínio

**Decisão:** Lógica de negócio pura (PricingService, CartEngine, variantesChaveLeitura) reside em `shared-core` e é importada por web e desktop.

**Motivo:** Paridade garantida. A divergência de `variantesChaveLeitura` (web e desktop com implementações diferentes) causou um bug real — resolvido movendo para `shared-core`.

**Alternativas:** Copiar lógica em cada workspace; publicar como pacote npm interno.

**Consequências:**
- ✅ Paridade web × desktop garantida em tempo de build
- ✅ Testes unitários em `shared-core` valem para ambas as plataformas
- ⚠️ Mudanças em `shared-core` afetam ambas as plataformas (testar bem antes de mergar)

---

## DEC-013: Piloto Web Only (sem Desktop no D0)

**Decisão:** O primeiro cliente pagante usa apenas a versão web (`pdv-importados`). O app Tauri não está no escopo do D0.

**Motivo:** Reduzir complexidade operacional do onboarding. Web requer zero instalação; evita suporte a Tauri no D0.

**Alternativas:** Incluir desktop no D0; decidir por cliente.

**Consequências:**
- ✅ Onboarding mais simples
- ✅ Sem necessidade de configurar `SYNC_KEY` e `pdv-local/.env` no D0
- ⚠️ Clientes sem internet não são atendidos no D0

---

> Ver impactos em [[Arquitetura]] · Riscos em [[Auditoria]] · Bugs relacionados em [[Bugs]]
