# Missão 3 — Matriz GO/NO-GO Produção Jinlong

**Data:** 2026-07-18  
**Ambiente:** código monorepo + evidências Missão 1 em Supabase `jinlong` (`kbabmewnahysfvlybiak`)  
**Critério:** *Um operador consegue trabalhar sem intervenção técnica, e a empresa consegue confiar nos dados gerados?*

---

## Veredito: **NO-GO** (operação real completa)

| Dimensão | Resultado |
|---|---|
| Operador vende sem TI | **Sim** (herdado Missão 1 — PDV GO) |
| Empresa confia nos dados gerados | **Não** (auditoria de preço/CRUD, papéis e conferência multi-meio) |
| Saída Missão 3 | **NO-GO** até fechar bloqueadores R1–R3 (ou aceite formal escrito) |

**Não iniciar gestão de funcionários** antes de fechar permissões (3.4).

---

## Matriz de saída

| Área | Critério | Status | Notas |
|---|---|---|---|
| PDV | Venda real sem intervenção | **GO** | Login, abertura, venda simples/fracionada, multi-pagamento, baixa estoque (153→142,5; 19 pagamentos) |
| Caixa | Fecha e confere | **PARTIAL** | Dinheiro esperado×contado GO; PIX/cartão **ausentes**; sem reabertura autorizada |
| Estoque | Rastreável | **PARTIAL** | Entrada/ajuste/baixa RPC; inventário só rótulo; kardex UI sem “quem”; sem saldo antes/depois |
| Produto | Preço confiável | **PARTIAL** | SSoT na venda (`calcular_preco_produto`) GO; edição de preço sem trilha |
| Auditoria | Tudo explicado | **NO-GO** | Venda/cancel/desconto/estoque-delta ok; preço 10→12 e CRUD produto **sem ledger** |
| Permissões | Usuário limitado corretamente | **NO-GO** | 4 perfis (`OPERADOR`/`GERENTE`/`DONO`/`ADMIN`); sem FINANCEIRO/ESTOQUE/VENDEDOR |
| Financeiro | Valores conciliáveis | **PARTIAL** | AR/AP usable; KPI capped; sem conciliação bancária em `/admin/financeiro` |

Relatórios (3.7): **PARTIAL** — RPCs de vendas/estoque úteis; donut de pagamentos com fatia `ajustes` fabricada (não usar para decisão).

---

## Fase a fase (ordem recomendada)

### 3.1 Caixa completo — A VALIDAR / PARTIAL

**Existe:** abertura, sangria, suprimento, fechamento atômico, diferença dinheiro, operador vinculado, ledger `movimentacoes_caixa`, blind closure.

**Falta vs documento:** conferência por forma (PIX/cartão), reabertura autorizada, movimentos de caixa na UI `/admin/auditoria`.

**Teste obrigatório ainda não fechado nesta missão (execução UI):**  
10 vendas + 1 sangria + 1 suprimento → fechar → comparar esperado×realizado por meio.

**P1 residual (não bloqueante loja):** E2E sangria preset `R$ 50.00` vs UI `R$ 50,00`.

### 3.2 Estoque completo — PARCIAL

| Capacidade | Status |
|---|---|
| Baixa venda | GO (Missão 1) |
| Entrada mercadoria | GO (recebimento / NF-e / OC) |
| Ajuste manual | GO (`ajustar_estoque_manual`) |
| Inventário | PARTIAL (motivo, não módulo) |
| Estoque mínimo | GO (filtro crítico) |
| Trilha who/when/why/before/after | PARTIAL (who/when/why no DB; before/after e “quem” na UI fracos) |

**Teste canônico pendente:** 100 → +50 → −10 → venda −5 = **135** + evidência de trilha.

### 3.3 Auditoria — NO-GO (maior risco pós–go-live)

`/admin/auditoria` une: `venda_eventos`, cancelamentos, `movimentos_estoque_log`, alertas, descontos.  
**Não cobre:** alteração de preço/cadastro, financeiro completo, `movimentacoes_caixa`.

**Teste falha esperada hoje:** Produto X 10→12 — sem registro usuário/data/antes/depois.

### 3.4 Permissões — NO-GO para modelo de 6 papéis

Modelo real: binário OPERADOR vs painel gerencial.  
Qualquer GERENTE/DONO/ADMIN acessa catálogo + estoque + financeiro + cancelamentos (sujeito a RPC).

**Ordem:** fechar ACL (ou aceite escrito do modelo 4-perfis) **antes** de gestão de funcionários.

### 3.5 Produtos completo — VALIDAR (preço na venda OK)

Cadastro completo em `/admin/catalogo` (campos presentes).  
Autoridade de preço na venda: Postgres RPC (+ mirror offline testado) — **não duplicar regra no React**.

**Teste pendente UI:** varejo 10 / atacado 8 qtd≥10 → 9 un = 10, 10 un = 8.

### 3.6 Financeiro básico — PARTIAL

Receber/pagar/fiscal em `/admin/financeiro`. Liquidação via RPC.  
Gaps: KPI com cap, listas truncadas, sem conciliação bancária.

### 3.7 Relatórios — PARTIAL

`/admin/relatorios` com RPCs reais; **não confiar** no mix de pagamentos fabricado.

---

## Bloqueadores para inverter o veredito

| ID | Bloqueador | Sev | Caminho mínimo |
|---|---|---|---|
| R1 | Sem trilha preço/CRUD | P0 | Ledger append-only + wire em `/admin/auditoria` |
| R2 | Papéis ≠ 6 (ou sem aceite) | P0 | Roles FINANCEIRO/ESTOQUE/VENDEDOR + policy **ou** aceite formal 4-perfis |
| R3 | Fechamento só dinheiro | P0 | Conferência PIX/cartão no fechar **ou** aceite “só dinheiro confere” |
| R4 | Inventário rótulo | P1 | Sessão de contagem com fechamento |
| R5 | Relatório pagamentos fake | P1 | Remover fatia fabricada ou marcar “não oficial” |
| R6 | Sangria E2E drift | P1 | Alinhar selector ao `50,00` |

---

## O que já pode rodar (escopo estreito)

1. Abrir caixa → vender → receber → baixar estoque → fechar com conferência de **dinheiro**.  
2. Sangria/suprimento com gate de gerente.  
3. Cadastro rápido PDV (já smoke Missão 1).

## O que não declarar pronto

- Confiança total em dados mestres (preço/cadastro).  
- Quadro multi-função com least-privilege.  
- Inventário físico formal.  
- Relatórios de mix de pagamento como verdade.  
- Gestão de funcionários.

---

## Próximo

1. Executar teste operacional 3.1 (fecho com 10 vendas + sangria + suprimento) e registrar evidência.  
2. Decidir aceite escrito vs implementação em R1–R3.  
3. Só após 3.4: gestão de funcionários.

Artefato visual: canvas `missao3-go-nogo-producao-jinlong.canvas.tsx` (Cursor canvases).  
Base Missão 1: `backend/artifacts/missao1_go_nogo_fluxo_venda_20260718_rehomolog.md`.
