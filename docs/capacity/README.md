# Auditoria de Capacidade, Resiliência e Continuidade — Jinlong / FastProduct

**Prioridade:** P0 — prontidão para comercialização SaaS  
**Data início:** 2026-10-09  
**Escopo desta entrega:** FASE 1 (inventário somente leitura) + FASE 2 (plano de ensaios)  
**Proibido nesta fase:** carga em produção, alteração de infraestrutura remota, correções estruturais sem aprovação

| Documento | Conteúdo |
|-----------|----------|
| [FASE1_INVENTARIO_CAPACIDADE_RESILIENCIA.md](./FASE1_INVENTARIO_CAPACIDADE_RESILIENCIA.md) | Arquitetura efetiva, caminho da venda, locks, offline, SPOF, isolamento |
| [FASE2_PLANO_ENSAIOS_CARGA.md](./FASE2_PLANO_ENSAIOS_CARGA.md) | Cenários 1–50 lojas, k6, continuidade, critérios GO/NO-GO |
| [k6/](./k6/) | Esqueleto de scripts k6 (não executáveis contra prod; exige staging) |
| [checklists/PRE_EXECUCAO_STAGING.md](./checklists/PRE_EXECUCAO_STAGING.md) | Gate humano antes de FASE 3/4 |

## Decisão preliminar (após FASE 1)

**NO-GO para comercialização em escala** até existir homologação isolada e números medidos.

**GO CONDICIONAL** para avançar à FASE 3 **somente após** provisionar staging separado de produção (hoje: staging inexistente — ver `docs/AMBIENTES_E_RELEASE.md`).

Capacidade comprovada hoje: **1 loja piloto** (operacional). Capacidade estimada para 5–50 lojas: **não medida**.
