# Auditoria de Capacidade, Resiliência e Continuidade — Jinlong / FastProduct

**Prioridade:** P0 — prontidão para comercialização SaaS  
**Data início:** 2026-10-09  
**Escopo entregue:** FASE 1 + FASE 2 + **STG-01** (preparação homologação)  
**Proibido até autorização:** provisionar recursos pagos, carga, migrations remotas

| Documento | Conteúdo |
|-----------|----------|
| [FASE1_INVENTARIO_CAPACIDADE_RESILIENCIA.md](./FASE1_INVENTARIO_CAPACIDADE_RESILIENCIA.md) | Inventário e diagnóstico |
| [FASE2_PLANO_ENSAIOS_CARGA.md](./FASE2_PLANO_ENSAIOS_CARGA.md) | Plano k6 / cenários 1–50 |
| [STG01_HOMOLOGACAO_ISOLADA.md](./STG01_HOMOLOGACAO_ISOLADA.md) | **Gate humano:** arquitetura, custo, provisionamento, segurança |
| [staging/prod-denylist.json](./staging/prod-denylist.json) | Refs/hosts de produção bloqueados |
| [k6/](./k6/) | Esqueleto k6 (guard anti-prod) |
| [checklists/PRE_EXECUCAO_STAGING.md](./checklists/PRE_EXECUCAO_STAGING.md) | Checklist pré-FASE 3 |

## Decisão atual

**NO-GO** comercialização em escala.  
**GO CONDICIONAL** piloto 1 loja.  
**STG-01 pronto para autorização de provisionamento** (não executado).

Scripts: `npm run capacity:assert-target` · `capacity:seed` · `capacity:reset` · `guard:capacity-target`
