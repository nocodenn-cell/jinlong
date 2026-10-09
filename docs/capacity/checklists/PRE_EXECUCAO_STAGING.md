# Checklist — Pré-execução FASE 3 (custo zero)

Base: [STG01_HOMOLOGACAO_ISOLADA.md](../STG01_HOMOLOGACAO_ISOLADA.md) §6.  
**Orçamento adicional: R$ 0.** Sem Pro, sem Vercel Preview nesta fase.

## Autorização (obrigatório)

- [ ] Checklist §6 do STG-01 assinado (Trilha F e/ou L)
- [ ] Confirmado: não alterar produção `jinlong`
- [ ] Confirmado: não sobrescrever `.env.local`

## Trilha escolhida

- [ ] **F** — Free remoto `jinlong-staging` **ou**
- [ ] **L** — Docker `fastproduct-capacity` (ports isoladas) **ou**
- [ ] **F→L** — tentar F; se limite de projetos, cair para L

## Ambiente (Trilha F)

- [ ] Projeto `jinlong-staging` criado (Free, US$ 0/mês) — ref ≠ produção
- [ ] Produção `jinlong` intacta; `ageguard` não apagado sem autorização
- [ ] `.env.capacity` a partir de `.env.staging.example`
- [ ] `CAPACITY_BLOCKED_PROJECT_REFS` = ref produção (não versionado)
- [ ] `npm run capacity:assert-target` OK
- [ ] Migrations + Edge só no staging (`CAPACITY_CONFIRM_DB_PUSH=yes`)
- [ ] Seed `CAPACITY_LOJAS` ∈ {1,5,10}

## Ambiente (Trilha L)

- [ ] Config/ports `fastproduct-capacity` criados (sem tocar stack `fastproduct`)
- [ ] Stack capacidade no ar; DEV existente intacto
- [ ] `CAPACITY_ENV=local` + URL `127.0.0.1:<porta capacidade>`
- [ ] Seed sintético OK

## App e carga (ambas)

- [ ] Next.js **local** (`dev:web`) — sem Preview Vercel
- [ ] k6 **local**
- [ ] Escada: Smoke → 1 → 5 → 10 lojas; abortar no primeiro limite
- [ ] Relatório distingue C1 / C2 / C3 (STG-01 §2.2)

## Segurança

- [ ] Guards verdes (`guard:capacity-target`, `guard:no-prod-target`)
- [ ] Zero PII de cliente nos seeds
- [ ] `SYNC_KEY` staging/local distinto de produção (se Edge usada)

## Aprovação final para rodar k6

| Papel | Nome | Data |
|-------|------|------|
| Product | | |
| Engenharia | | |

**Sem assinatura: NO-GO para carga.**
