# F6.1 — Expansão Operacional (complemento da Frente 6)

> Objetivo: fechar **confiança operacional** antes do Go-Live, não criar documentação
> infinita. Foco em 4 módulos críticos, na sequência definida pela direção:
> **Estoque → Vendas Admin → Produto → Relatórios**.
> Análise de código (leitura), sem alteração. Gerado por Hermes em 2026-08-03.

## Sequência e vereditos-resumo

| # | Módulo | Prioridade | Veredito | Falhas 🔴 |
|---|---|:--:|---|:--:|
| 1 | Estoque | 🔴 | Maduro e coerente | 0 |
| 2 | Vendas Admin | 🔴 | 1 falha (KPI página parcial) | 1 |
| 3 | Produto (pós-cadastro) | 🟡 | Consistente; 1 gap herdado F2 | 0 |
| 4 | Relatórios/Dashboard | 🟡 | Cálculo certo; risco de dado (F3) | 0* |

\* 0 falha de código; 1 risco de Go-Live por dado de teste (herdado F3).

---

## 1. F6.1-ESTOQUE 🔴 — Módulo maduro

**Fluxo:** Tela `app/admin/estoque/*` → `AjusteSaldoModal`/`transferencias` →
`app/gerente/estoque/actions.ts` → `InventoryMovementWriter`/`InventoryAdjustmentService`
→ RPCs (`ajustar_estoque_manual`, `receber_ordem_compra`, `transferir_estoque_seguro`,
`confirmar_remessa_entrada`, `importar_nfe_transacao`) → `movimentos_estoque_log` + `estoque`.

**Respostas às 5 perguntas críticas:**

| Pergunta | Resposta | Evidência |
|---|:--:|---|
| Ajuste manual aparece no histórico? | ✅ SIM | `ajustar_estoque_manual` grava `movimentos_estoque_log` com `usuario_id`, `observacao`, `motivo` (F5: 51 regs tipo AJUSTE) |
| Entrada de recebimento altera saldo? | ✅ SIM | `receber_ordem_compra` via `InventoryMovementWriter.receiveOrdemCompra` |
| Transferência gera origem/destino? | ✅ SIM | `transferir_estoque_seguro(p_loja_origem, p_loja_destino)` + `p_idempotency_key` |
| Exclusão/cancelamento deixa rastro? | ✅ SIM | Ajuste/recebimento via RPC log; cancelamento de venda em `vendas_canceladas_auditoria` (F5) |
| Operador faz o que deveria exigir gerente? | ✅ NÃO | `atualizarEstoqueProduto` usa `assertGerenteSession()` (bloqueia OPERADOR) |

**Conclusão:** módulo bem instrumentado — trilha, validação, idempotência e separação
sales-led/inventory-led (ADR-008). **Único gap:** `movimentos_estoque_log` não grava
`saldo_anterior`/`saldo_resultante` (já coberto em **F5-VAL-05**). Zero falhas novas.

---

## 2. F6.1-VENDAS ADMIN 🔴 — 1 falha

**Fluxo:** `app/admin/vendas/page.tsx` (Server Component, read-only) → `VendasTable`
→ `VendaCancelarModal` / `VendaDetailSheet` → `buscarVendasPaginadasAction` (mesma do PDV).

**Achados:**
- ✅ **Cancelamento admin = mesma action do PDV.** `VendasTable` (l.280) usa
  `VendaCancelarModal` de `@/app/gerente/vendas` → mesma trilha `vendas_canceladas_auditoria`.
  Sem divergência PDV↔Admin.
- 🔴 **KPI calculado sobre a página parcial, não o período (info falsa).** Os `MetricCard`
  (faturado, concluídas, canceladas, ticket médio) somam `vendas` = **só a página visível**.
  A action retorna `hasMore` (cursor, sem total) → o card "Faturado R$ X" reflete apenas as
  vendas carregadas, não o filtro de período. Para loja de importados com muitas vendas, o
  indicador administrativo fica visivelmente subestimado.
  → **Ticket F6.1-VEN-001** (corrigir: KPI deve vir de agregação server-side por período).
- 🟡 **Devolução.** Botão `devolverAcao` aparece no detalhe; sem trilha dedicada (F5:
  devolução ⚪ NÃO VALIDADO). Se funcional, grava sem auditoria própria.
  → **Ticket F6.1-VEN-002** (validar handler + criar tabela de devolução).

---

## 3. F6.1-PRODUTO 🟡 (pós-cadastro)

**Pergunta:** "Depois que o produto existe, todas as telas tratam ele da mesma forma?"
Campos: categoria, marca, fornecedor opcional, preço varejo/atacado, estoque inicial, NCM,
código de barras, ativo/inativo.

**Achado:**
- ✅ **Campos opcionais tratados de forma consistente.** `ProdutoFormModal` permite
  salvar como **RASCUNHO** (`podeSalvarComoRascunho`); fornecedor/marca/NCM/categoria são
  opcionais; estoque inicial só no create via RPC `criar_produto_com_estoque_inicial`
  (mesma TX, pós-criação → `/admin/estoque`). **O fluxo NÃO bloqueia operação por dados
  que chegam depois** — exatamente o requisito de uma loja de importados.
- 🟡 **Inconsistência de obrigatoriedade (herdado F2).** Catálogo permite público sem
  categoria/NCM (F2: 82 públicos sem categoria, 105 sem NCM); o PDV/relatórios podem
  esperar esses campos. Já coberto em **F2-PROD-001** (categoria) / **F2-PROD-002** (NCM).
  → **Ticket F6.1-PROD-001** (definir regra única de obrigatoriedade Catálogo↔PDV).

---

## 4. F6.1-RELATÓRIOS/DASHBOARD 🟡

**Fluxo:** `app/admin/dashboard` + `app/admin/relatorios` → queries diretas
`vendas` / `v_estoque_baixo` / `carregarDadosRelatoriosGerente`.

**Achados:**
- ✅ **Cálculo bate com a tabela origem.** Dashboard (l.343-348) e Relatórios derivam
  KPIs/deltas/grafos das mesmas queries de `vendas` e `v_estoque_baixo`. Sem "número
  bonito inventado". Há label `custoNaoConfiavel` quando a margem é incalculável (boa prática).
- 🔴/**🟡 Risco de Go-Live por DADO (herdado F3).** Indicadores operam sobre base 100% de
  teste (56 vendas fake, 39 caixas fake — F3). Matematicamente corretos, mas **refletem
  realidade fictícia** → "informação bonita, porém errada" por interpretação.
  → **Ticket F6.1-REL-001** (bloqueio: não liberar Go-Live com dados de teste; selar
  ambiente ou limpar conforme F3).

---

## Conclusão técnica

A expansão operacional confirma que o **coração do sistema (Estoque) está maduro** e que
**Vendas Admin, Produto e Relatórios são coerentes em código**. As falhas encontradas são
específicas e localizadas:

- **1 falha de código 🔴:** KPI de Vendas Admin sobre página parcial (F6.1-VEN-001).
- **2 riscos 🟡/⚪:** devolução sem trilha (F6.1-VEN-002), obrigatoriedade categoria/NCM
  (F6.1-PROD-001).
- **1 bloqueio de Go-Live por dado 🔴:** indicadores sobre base de teste (F6.1-REL-001 = F3).

**Não se confunda ausência de teste com defeito:** Estoque e Produto funcionam; o problema
está em (a) um KPI mal dimensionado e (b) dados de teste ainda presentes. O mapa de
correções está em `tickets/GO_LIVE_TICKETS_F6_1_EXPANSAO.md`.

➡️ Fila de tickets: `docs/auditoria/tickets/GO_LIVE_TICKETS_F6_1_EXPANSAO.md`
