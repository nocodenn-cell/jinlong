# Checklist — Pré-execução FASE 3/4 (gate humano)

Marcar **todos** os itens antes de qualquer script de carga ou falha.  
Base: [STG01_HOMOLOGACAO_ISOLADA.md](../STG01_HOMOLOGACAO_ISOLADA.md).

## STG-01 — provisionamento (antes deste checklist)

- [ ] Autorizações A1–A2 (criar projeto + orçamento) assinadas
- [ ] Projeto Supabase de homologação criado (ref **diferente** de `staging/prod-denylist.json`)
- [ ] `.env.capacity` criado a partir de `.env.staging.example` (sem tocar `.env.local`)
- [ ] `npm run capacity:assert-target` OK
- [ ] Migrations + Edge aplicadas via `apply-migrations-staging.sh` com `CAPACITY_CONFIRM_DB_PUSH=yes`
- [ ] Seed sintético: `CAPACITY_CONFIRM_SEED=yes npm run capacity:seed`

## Ambiente

- [ ] Plano/compute documentado (Free / Micro / Small / …) — limita extrapolação
- [ ] Preview/homolog Vercel apontando **somente** para o ref de staging
- [ ] Confirmação escrita: **não** usar `jinlong.app` produção nem DB do cliente
- [ ] `SYNC_KEY` do staging é **novo** (não copiado de produção)

## Dados e credenciais

- [ ] Seeds sintéticos: N lojas `CAP_L*`, 2 operadores/loja, catálogo, estoque generoso + SKU qty=1
- [ ] Zero CPF/CNPJ/nome real de cliente
- [ ] `.env.local` de desenvolvimento **não** sobrescrito
- [ ] Shell de teste sem `SUPABASE_SERVICE_ROLE_KEY` de produção
- [ ] `CAPACITY_ENV=staging`, `CAPACITY_ALLOWED_PROJECT_REF=<staging>`, `CAPACITY_BLOCKED_PROJECT_REFS=<produção>` definidos
- [ ] `npm run guard:no-prod-target` e `npm run guard:capacity-target` passam

## Observabilidade

- [ ] Dashboard Supabase (CPU, conexões, logs) acessível
- [ ] Sentry/projeto staging ou environment tag `staging`
- [ ] Destino de artefatos k6 sob `/opt/cursor/artifacts/` ou CI artifacts
- [ ] `collect-metrics.sql` disponível no SQL Editor staging

## Escopo autorizado

- [ ] Cenário inicial: **Smoke → Piloto** apenas
- [ ] Soak 8–12 h agendado só após Piloto APROVADO
- [ ] Correções estruturais **fora** do escopo até relatório FASE 5
- [ ] Multiempresa **fora** de escopo

## Aprovação

| Papel | Nome | Data | Assinatura |
|-------|------|------|------------|
| Product / dono | | | |
| Engenharia | | | |

**Sem esta checklist completa: NO-GO para FASE 3.**
