# Regras de negócio

Registro canônico de obrigações comerciais e **governança de domínio** do Jinlong.

| Documento | Conteúdo |
|-----------|----------|
| [GOVERNANCA_REGRAS_NEGOCIO.md](./GOVERNANCA_REGRAS_NEGOCIO.md) | Diretriz obrigatória: um dono, sem duplicação, contratos, gate |
| [MAPA_DOMINIOS_REGRAS_NEGOCIO.md](./MAPA_DOMINIOS_REGRAS_NEGOCIO.md) | Mapa Domínio → entidade → dado → dono → regra → eventos |
| [ESTADO_POS_GATE_SSoT.md](./ESTADO_POS_GATE_SSoT.md) | Fundação fechada: stack #473–#476, invariantes, merge |
| [PROXIMA_FASE_POS_GATE.md](./PROXIMA_FASE_POS_GATE.md) | Dívidas, matriz, DAG, **próxima capacidade** + MVP |
| [INVENTARIO_IMPLEMENTACAO_DOMINIOS.md](./INVENTARIO_IMPLEMENTACAO_DOMINIOS.md) | Inventário real (tabelas/RPCs/app) confrontado com o mapa |
| [AUDITORIA_SSoT_DOMINIOS.md](./AUDITORIA_SSoT_DOMINIOS.md) | Auditoria SSoT (histórico) |
| [REMEDIACAO_SSOT_001_004.md](./REMEDIACAO_SSOT_001_004.md) | Gate final SSOT-001…004 — **GO** |
| [SSOT_CAIXA_SALDO_CONTRATO.md](./SSOT_CAIXA_SALDO_CONTRATO.md) | E(c) vs `saldo_atual` (cache) |
| [CONTRATO_FECHAMENTO_POR_FORMA.md](./CONTRATO_FECHAMENTO_POR_FORMA.md) | Read model fechamento por forma (PR A) |
| [GATE_FECHAMENTO_POR_FORMA_PR_A.md](./GATE_FECHAMENTO_POR_FORMA_PR_A.md) | Gate **READY FOR CLOSURE UI** |
| [GATE_FECHAMENTO_POR_FORMA_PR_B.md](./GATE_FECHAMENTO_POR_FORMA_PR_B.md) | Gate UX/snapshot PR B |
| [STACK_INTEGRACAO_473_478.md](./STACK_INTEGRACAO_473_478.md) | Estratégia de merge da stack |
| [SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md](./SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md) | OC/remessa/NF-e → obrigação |
| [CHECKLIST_FEATURE_DOMINIO.md](./CHECKLIST_FEATURE_DOMINIO.md) | 13 perguntas obrigatórias antes de implementar |
| [MATRIZ_AUTORIDADES_P1.md](./MATRIZ_AUTORIDADES_P1.md) | Matriz de autoridades (critério de encerramento P1) |
| [CONSOLIDACAO_P1_NUCLEO_PDV.md](./CONSOLIDACAO_P1_NUCLEO_PDV.md) | Preço · parcial · espera · estoque · fechamento |
| [PLANO_AUTORIDADE_1_PRECO.md](./PLANO_AUTORIDADE_1_PRECO.md) | Plano técnico #182 (sem implementação) |
| [VALIDACAO_AUT1_PRECO_182.md](./VALIDACAO_AUT1_PRECO_182.md) | Validação autoridade preço |

**Premissa:** uma regra, uma autoridade, um algoritmo por domínio.

Não substituem [venda-golden-flow.md](../venda-golden-flow.md) (congelado) nem os ADRs em `docs/adr/`.
