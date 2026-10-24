# Checklist — Pré-execução FASE 3/4 (gate humano)

Marcar **todos** os itens antes de qualquer script de carga ou falha.

## Ambiente

- [ ] Projeto Supabase de homologação criado (**ref diferente** de produção `jinlong`)
- [ ] Plano/compute documentado (Free / Micro / Small / …) — limita extrapolação
- [ ] Migrations aplicadas a partir do Git (`db reset` ou `db push` limpo)
- [ ] Edge Functions deployadas no projeto de homolog (`sync-outbox`, `validar-gerente`, `fiscal-worker`)
- [ ] Preview/homolog Vercel apontando **somente** para o ref de staging
- [ ] Confirmação escrita: **não** usar `jinlong.app` produção nem DB do cliente

## Dados e credenciais

- [ ] Seeds sintéticos: N lojas, 2 operadores/loja, catálogo, estoque generoso + 1 SKU com qty=1 para C8
- [ ] Zero CPF/CNPJ/nome real de cliente
- [ ] `.env.local` de desenvolvimento **não** sobrescrito sem autorização
- [ ] Shell de teste sem `SUPABASE_SERVICE_ROLE_KEY` de produção
- [ ] `GATE_ENV=staging` e `GATE_STAGING_PROJECT_REF=<ref>` definidos
- [ ] `npm run guard:no-prod-target` passa com as URLs do shell

## Observabilidade

- [ ] Dashboard Supabase (CPU, conexões, logs) acessível
- [ ] Sentry/projeto staging ou environment tag `staging`
- [ ] Destino de artefatos k6 (JSON/HTML) definido sob `/opt/cursor/artifacts/` ou CI artifacts

## Escopo autorizado

- [ ] Cenário inicial: **Smoke → Piloto** apenas
- [ ] Soak 8–12 h agendado só após Piloto APROVADO
- [ ] Correções estruturais **fora** do escopo até relatório FASE 5

## Aprovação

| Papel | Nome | Data | Assinatura |
|-------|------|------|------------|
| Product / dono | | | |
| Engenharia | | | |

**Sem esta checklist completa: NO-GO para FASE 3.**
