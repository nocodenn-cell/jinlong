# Backlog Priorizado Pós-Onda 2

**Data:** 2026-08-31 · **Atualizado:** 2026-09-01 (Onda 2B concluída)
**Autoridade:** Reconciliação de prontidão + PR #360 em staging  
**Próxima:** Onda 3 (fechamento por forma) — Onda 2B já concluída, ver abaixo

---

## P0 — Bloqueadores de Operação / Segurança / Dinheiro

### Backup / Restore (IDs 183–187) — **CONSCIENTE ADIADO para Onda 7**
- **Status:** NÃO IMPLEMENTADO (Org Supabase FREE; sem PITR automático)
- **Decisão:** Adiado conscientemente (sem contrato Pro). Onda 7 via `pg_dump`/agendamento/restore drill
- **Risco:** Dados — sem backup automático hoje
- **Runbook:** [`docs/runbooks/BACKUP_RESTORE_CANONICO.md`](runbooks/BACKUP_RESTORE_CANONICO.md)
- **Ação:** Não iniciar agora; aguardar aprovação contratual Pro ou Onda 7

### Fechamento por Forma (IDs 100, 92, 99, 206, 199, 205) — **Onda 3 DIAGNOSTICADA (2026-09-01)**
- **Status:** Diagnóstico completo via mapeamento de código real (não implementado). Ver [`docs/ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md`](ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md)
- **Achado central:** dos 6 IDs, só existem 2 correções reais — (1) reconciliação/UI por forma no fechamento (92, 100, 199) e (2) relatório histórico agregado de diferenças (99, 205, 206)
- **Causa raiz confirmada:** `calcular_valor_sistema_dinheiro_caixa` e `fechar_caixa_atomico` são **dinheiro-only por design intencional** (Gate 3 do teste adversarial garante isso para o saldo físico da gaveta) — nunca foi construído um SSOT irmão para PIX/cartão
- **Risco:** Financeiro diário real — PIX/cartão nunca são reconciliados no fechamento; uma venda registrada como PIX mas nunca paga fecha o caixa sem detecção
- **Esforço:** M-L (SSOT novo + extensão de RPC + UI + relatório; sequência de PRs pequenas e testáveis isoladamente — ver plano no diagnóstico)
- **Primeira PR recomendada:** apenas a função `calcular_valor_sistema_por_forma_caixa` (só leitura, zero risco, testável isoladamente antes de tocar `fechar_caixa_atomico` ou UI)
- **Recomendação:** Priorizar após decisão do ID 50 e merge #360

---

## P1 — Importante antes/logo após piloto

### ✅ Onda 2B — CONCLUÍDA (2026-09-01)

- **ID 40:** Fechado. RPC estendida para devolver `quantidade_minima`; fio completo até o badge. 24 testes unitários relevantes passam.
- **ID 44:** Fechado + bug crítico corrigido. A migration original usava CHECK com subquery cross-table — inválida no Postgres, teria falhado ao aplicar. Reescrita como trigger.
- **ID 51:** Fechado + bug corrigido. RLS estava ausente na tabela nova (`historico_tiers_crud`), quebrando o padrão da tabela irmã. Corrigido. Escopo confirmado como "trilha auditável" — UI de leitura não é requisito obrigatório, fica como P2 opcional.

### 🔴 ID 50 — Bloqueado, requer decisão de negócio (não é mais "Onda 2B pendente")
- **Status real:** Schema existe (`itens_venda.motivo_override`), mas **não há nenhum fluxo de produção que crie um item com `tipoPreco='MANUAL'`** — o tipo é aceito passivamente pelo backend, mas nenhuma tela do frontend o define hoje.
- **O que já existe (e pode já ser a resposta):** Auditoria de motivo completa para desconto percentual do gerente (`descontos_venda.motivo_desconto` + `motivo_descricao_livre`, via `CaixaGerenteModal.tsx` → RPC v4).
- **Decisão necessária:** (A) considerar ID 50 já coberto pela auditoria de desconto-gerente existente — fechar apontando para essa infra; ou (B) tratar como feature nova (override manual por item) — precisa de escopo próprio (UI, quando é permitido, quem autoriza), não cabe como conclusão de gap.
- **Recomendação:** (A) é a leitura mais provável, mas é uma decisão do dono do produto.
- **Detalhes completos:** [`docs/ONDA2_RECONCILIACAO_POS_PR360.md`](ONDA2_RECONCILIACAO_POS_PR360.md#-id-50-auditoria--motivo-de-override--bloqueado-decisão-de-negócio-necessária)

### Resíduos I18n (IDs 219, 220) — QUASE COMPLETO
- **Status:** Implementado parcialmente (server actions caixa migrados, admin/gerente resíduos)
- **Resíduos:** Mensagens Zod em `finalizarVendaValidation.ts`, erros RPC/PostgREST podem vazar PT
- **Prioridade:** Antes do piloto em produção (se requisito ZH é mandatório)
- **Esforço:** S (encontrar + migrar hardcodes PT)

---

## P2 — Melhoria (não bloqueia piloto)

### UX Polish — Onda 8
- ID 214: Cliques adequados (superfície pequena)
- ID 46: Limites inf/sup (preço)
- ID 115: Imagem produto
- Esforço: 5–10 IDs, 2–3 sprints
- Prioridade: Após estabilização core

### Configuração / Relatórios Avançados — Onda 8
- IDs 71–81: Hardware (barcode, impressora, gaveta — após software sólido)
- IDs 131, 140, 168–198: Auditoria/relatórios/inventário
- Esforço: 15+ IDs
- Prioridade: Post-piloto; depende feedback operador

---

## Deferred

### P3 — Futuro
- Orçamento, variantes, etiquetas, DANFE, e-commerce, fidelidade, gift cards, marketplaces, integrações bancárias, BI avançado
- Esforço: 20+ IDs, vários sprints
- Prioridade: Roadmap pós-Q3

---

## Recomendação de Próxima Onda

| Opção | Composição | Tempo Est. | Risco | Valor |
|-------|-----------|-----------|-------|-------|
| **2B (Onda 2 Completion)** | IDs 40 (wiring) + 50, 51 (UI) | 1 sprint | Baixo | Compliance + UX |
| **3 (Fechamento)** | IDs 100, 92, 99, 206, 199, 205 | 2–3 sprints | Médio | **Risco financeiro** ← P0 |
| **2B → 3 (Sequencial)** | Onda 2B (1 sprint) + Onda 3 (2 sprints) | 3 sprints | Baixo→Médio | Seguro + Compliance |

**Recomendação:** 
1. ✅ Merge #360 imediatamente (pré-merge review + build OK)
2. ✅ Onda 2B (1 sprint): ID 40 wiring + IDs 50, 51 UI
3. ✅ Onda 3 (2–3 sprints): Fechamento por forma (P0 financeiro)
4. ⏸️ Onda 7 (quando aprovado Pro): Backup automático + restore drill

**Aguardar antes de Onda 3:** Feedback piloto Onda 1–2 estabilizado.

---

## Checklist Pré-Piloto (MVP Operacional)

| Requisito | Status | ID | Onda |
|-----------|--------|----|----|
| PDV básico (scan, qtd, preço VAREJO) | ✅ | Core | 0 |
| Atacado com quantidade mínima | ✅ | 36 | 2 |
| Desconto gerente | ✅ | Core | 0 |
| Pagamento (dinheiro, PIX) | ✅ | Core | 0 |
| Histórico vendas operador | ✅ | 27 | 1 |
| Reimpressão cupom histórico | ✅ | 28 | 1 |
| **Fechamento caixa por forma** | ⚠️ PARCIAL | 100, 92, 99 | **3** ← BLOQUEADOR OPERACIONAL |
| Backup dados | ❌ ADIADO | 183–187 | 7 |
| i18n PT/ZH caixa | ⚠️ PARCIAL | 219, 220 | 1 |

**Bloqueador identificado:** Fechamento por forma (Onda 3) — operador não consegue conferir diferenças PIX/cartão → risco financeiro diário.

**Recomendação:** Priorizar Onda 3 logo após Onda 2B.

---

## Documentação Relacionada

- [`docs/ONDA2_RECONCILIACAO_POS_PR360.md`](ONDA2_RECONCILIACAO_POS_PR360.md) — Detalhes Onda 2
- [`docs/AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md`](AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md) — Matriz completa 250 IDs (autoridade)
- [`docs/architecture/GO_LIVE_READINESS.md`](architecture/GO_LIVE_READINESS.md) — Prontidão deploy
- [`docs/runbooks/BACKUP_RESTORE_CANONICO.md`](runbooks/BACKUP_RESTORE_CANONICO.md) — Runbook backup

---

**Preparado por:** Claude Code  
**Próxima atualização:** Após merge #360 + validação staging
