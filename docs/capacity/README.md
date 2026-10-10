# Auditoria de Capacidade, Resiliência e Continuidade — Jinlong

**Prioridade:** P0  
**Orçamento adicional STG-01:** **R$ 0**  
**Proibido até autorização:** provisionar, upgrade pago, carga em produção

| Documento | Conteúdo |
|-----------|----------|
| [FASE1_INVENTARIO_CAPACIDADE_RESILIENCIA.md](./FASE1_INVENTARIO_CAPACIDADE_RESILIENCIA.md) | Inventário |
| [FASE2_PLANO_ENSAIOS_CARGA.md](./FASE2_PLANO_ENSAIOS_CARGA.md) | Plano k6 (escada completa; execução inicial 1/5/10) |
| [STG01_HOMOLOGACAO_ISOLADA.md](./STG01_HOMOLOGACAO_ISOLADA.md) | **Gate humano custo zero** — Trilha F (Free) / L (Docker) |
| [staging/prod-denylist.json](./staging/prod-denylist.json) | Hosts de produção bloqueados |
| [k6/](./k6/) | Esqueleto k6 |
| [checklists/PRE_EXECUCAO_STAGING.md](./checklists/PRE_EXECUCAO_STAGING.md) | Checklist pré-carga |

## Capacidade (três camadas)

| Camada | Significado | Agora |
|--------|-------------|-------|
| C1 Funcional | Piloto 1 loja + corretude | Comprovada em parte |
| C2 Free/local | k6 em 1/5/10 lojas | **Não medida** |
| C3 Produção | Compute real multi-loja | **Desconhecida** |

## Decisão

**NO-GO** comercialização em escala.  
**GO CONDICIONAL** piloto.  
**STG-01:** aguardando autorização Trilha F e/ou L (R$ 0).
