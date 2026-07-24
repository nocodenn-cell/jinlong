# RETROSPECTIVA DA SPRINT — Regras de Desconto FastProduct

**Data**: 2026-07-24
**Branch**: `claude/auditoria-final-desconto-7o1vy9`
**PR**: #231

---

## 1. Objetivos planejados × entregues

| Objetivo planejado | Entregue | Observação |
|---|:---:|---|
| MVF #1 — validação de limite de desconto | ✅ | `shared-core` (Web+Local), 3 testes |
| MVF #2 — motivo de desconto | 🟡 parcial | Frontend completo; persistência depende de BL-1 |
| MVF #3 — promoções | ❌ adiado | Requer alteração estrutural (BL-2) |
| Documentação canônica congelada | ✅ | Contrato, invariantes, matriz |
| Contrato de cálculo de preço | ✅ | |
| Política oficial de não acúmulo | ✅ | |
| Separação Pipeline Preço / Comercial | ✅ | |
| Invariantes C1–C6 | ✅ | Preservados pelos MVFs implementados |
| Matriz de compatibilidade | ✅ | |

**Conclusão**: ~70% do escopo. Todo o trabalho seguro (frontend + arquitetura/documentação) concluído; 30% restantes exigem alteração estrutural de RPC + reconciliação repo↔banco, deliberadamente adiados.

---

## 2. O que aprendemos

- **O corpo da RPC importa mais que sua existência.** Uma função pode existir, ter a assinatura correta e ainda assim ter perdido comportamento crítico. Auditorias que só checam "a função existe" são cegas para regressões internas.
- **Blueprint congelado ≠ estado do código.** O documento canônico assumia `v3` com insert de auditoria existente; a realidade era `v4` sem ele. Congelar arquitetura no papel não garante que o código a implemente.
- **Migrations baselined escondem histórico.** O banco foi consolidado (~258); os 184 arquivos legado do repo não são individualmente rastreáveis no banco — a "verdade" do schema está no banco vivo, não na sequência de arquivos.
- **Validar contra o banco vivo é indispensável.** Cada premissa só ficou confiável após `pg_get_functiondef`/`information_schema`. Suposições a partir dos arquivos teriam gerado uma migration que falharia em produção.
- **Parar cedo evita retrabalho.** Interromper o backend do MVF #2 ao detectar a divergência evitou escrever uma migration inválida contra o ambiente de Go-Live.

---

## 3. Premissas que estavam erradas

| Premissa (blueprint) | Realidade (verificada no banco) |
|---|---|
| RPC de finalização é `v3` | É `finalizar_venda_transacional_canonica_v4` |
| A v4 já insere em `descontos_venda` | Não insere (PASSO 5 removido) |
| O token de gerente é consumido (`usado=true`) | Nunca é marcado → reutilizável |
| `descontos_venda` tem `operador_id`/`aplicado_em` (migration 113) | Só 4 colunas; 113 nunca refletida no banco |
| Repo e banco em sincronia sequencial | Divergência bidirecional; banco baselined em ~258 |
| `calcular_preco_produto` trata promoções | Não lê `regras_preco` nem `PROMOCAO` |
| Bastaria "adicionar coluna motivo + 2 params" (MVF #2) | Requer restaurar PASSO 5 antes de haver o que auditar |

---

## 4. Decisões arquiteturais tomadas e motivos

1. **Não implementar backend sem reconciliação** — evitar DDL inconsistente contra o ambiente de Go-Live. Motivo: divergência schema repo↔banco confirmada.
2. **Motivo via ENUM (não texto livre)** — auditabilidade e BI exatos; texto livre só em `OUTROS`. Motivo: evitar N variações do mesmo motivo.
3. **Estender, nunca duplicar RPC** — reconciliação da v4 será `ALTER`/`CREATE OR REPLACE` de overload único, preservando SSOT. Motivo: invariante C1.
4. **Validação de limite no frontend como defesa em profundidade** — o trigger de backend (migration 122) continua autoritativo. Motivo: prevenir venda inválida sem duplicar a regra de negócio.
5. **Isolar o fix fiscal (metadados) do fix de desconto** — não misturar domínios numa migration. Motivo: reversibilidade e revisão focada.
6. **Motivo obrigatório real na UI** — `NAO_ESPECIFICADO` (placeholder) não avança. Motivo: intenção de auditabilidade do MVF #2.

---

## 5. Dívida técnica

### Criada nesta sprint
- **Motivo capturado mas não persistido** — a UI coleta/valida o motivo, mas o boundary do servidor não o envia à RPC (resolvido junto com BL-1).
- **Guard de limite fixo em 15% no frontend** — não lê `pdv_config.max_desconto_manual_item_percentual`; aceitável como defesa em profundidade (backend é autoritativo), mas diverge para lojas com limite < 15%.

### Eliminada / evitada nesta sprint
- **Migration inválida evitada** — o rascunho `123_desconto_motivo_enum.sql` (apontava para v3) foi removido antes de qualquer commit; nenhuma DDL incorreta entrou.
- **Divergência silenciosa exposta** — a regressão do PASSO 5 (token + auditoria), antes invisível, agora está documentada com laudo forense e plano de correção.
- **Ambiguidade doc↔código eliminada** — adendo de implementação no canônico reconcilia blueprint vs realidade.

---

## 6. Riscos remanescentes para o Go-Live

| Risco | Sev. | Fecha com |
|---|---|---|
| Token de gerente reutilizável | 🔴 P0 | BL-1 |
| Descontos de gerente sem auditoria | 🔴 P0 | BL-1 |
| Motivo não persistido | 🟠 P1 | BL-1 |
| Promoções não funcionam | 🟠 P1 | BL-2 |
| Metadados fiscais não propagados | 🟡 P2 | BL-3 |
| Divergência repo↔banco / drift sem guard por corpo | 🟡 P2 | BL-4 |
| Guard de limite fixo (15%) no frontend | 🟡 P3 | evolução |

---

## 7. Ações obrigatórias da próxima sprint (priorizadas)

1. **BL-1 (P0)** — reconciliação da v4: restaurar consumo de token + auditoria `descontos_venda` + persistir motivo. **Primeiro item.** Plano: `docs/BL1_PLANO_RECONCILIACAO_V4.md`.
2. **BL-2 (P1)** — MVF #3 promoções: estender `calcular_preco_produto` + equivalência offline + sync.
3. **BL-3 (P2)** — restaurar enqueue fiscal rico (metadados de auditoria).
4. **BL-4 (P2)** — guard de drift por corpo de função (`md5(pg_get_functiondef)`) no pipeline.
5. **P3** — refletir `pdv_config` no guard de limite do frontend.

---

## 8. Lições para não repetir

- **Auditar corpo, não só existência.** Adicionar ao pipeline comparação de `md5(pg_get_functiondef)` contra corpo canônico versionado (BL-4).
- **Toda migration de RPC deve declarar o que preserva.** Reescritas `CREATE OR REPLACE` de corpo inteiro devem listar explicitamente os PASSOS mantidos, para que uma omissão seja revisável no diff.
- **Blueprint deve citar a versão real do objeto.** Referenciar `v4` (não `v3`) e validar contra o banco antes de congelar.
- **Confirmar o ambiente-alvo antes de qualquer DDL.** Prod vs staging deve ser explícito no runbook.
- **Não meio-implementar itens com equivalência offline.** A parte offline sozinha (promoções) violaria C4; itens estruturais entram inteiros ou ficam no backlog.

---

**Status**: Sprint formalmente encerrada. Branch congelada após a entrega deste documento e do backlog priorizado.
