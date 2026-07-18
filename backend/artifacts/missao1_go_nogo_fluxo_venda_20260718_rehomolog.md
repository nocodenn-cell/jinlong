# Missão 1 — Re-homologação após correção P0 (jinlong)

**Data:** 2026-07-18  
**Ambiente alvo:** Supabase `jinlong` (`kbabmewnahysfvlybiak`) + Next local apontando para ele  
**Critério:** *Uma loja consegue abrir o caixa, vender, receber, baixar estoque e fechar operação sem intervenção técnica.*

---

## Veredito: **GO** (fluxo de venda P0 no ambiente alvo)

Bloqueios P0 da rodada anterior foram corrigidos e revalidados. Residual P1 (sangria UI no E2E de fluxos críticos) **não** impede o critério de sucesso acima.

---

## Correções aplicadas

| ID | Ação | Evidência |
|---|---|---|
| P0.1 | `seed-dev-users.mjs` agora **atualiza senha** Auth + verifica login anon; senhas seed/caixa alinhadas | `npm run seed:dev-users` → `OK login operador (anon) verificado` |
| P0.2 | Migration `256_pdv_diagnostico_pre_producao` + fix diag (sem falso negativo v4) | `schema_migrations`: `256_pdv_diagnostico_pre_producao`, `revoke_anon_pdv_rpcs_and_fix_diag` |
| P0.3 | `REVOKE EXECUTE` de `anon` em `finalizar_venda_v4` / `fechar_caixa_*` | Grants: anon=false; authenticated/service_role ok |
| P1 | Caixas órfãos (>7d) fechados | `docs/PROCEDIMENTO_CAIXAS_ORFAOS.md`; abertos pós-limpeza = 0 (1 aberto atual = turno E2E) |
| Cadastro rápido | OPERADOR autorizado no RPC + action `criarProdutoRelampagoPdv` + estoque inicial estreito | Smoke RPC: `produto_id=d8b9d653-…`, `estoque_aplicado=true` |

---

## Matriz re-homolog (jinlong)

| Teste | Resultado | Evidência |
|---|---|---|
| Login operador | **OK** | Seed + E2E login |
| Abertura de turno | **OK** | Golden / venda E2E (`TURNO #2452`, fundo R$300) |
| Venda simples | **OK** | `caixa-venda.spec` + golden DINHEIRO |
| Venda fracionada | **OK** | golden qty 0,5 |
| Multi-pagamento | **OK** | 5/5 `caixa-venda-multi-pagamento` |
| Baixa estoque | **OK** | Demo `7898512340003`: 153 → 142.5 após vendas E2E |
| Financeiro (pagamentos) | **OK** | 19 linhas `vendas_pagamentos` em 2h; vendas CONCLUIDA com 1–3 parcelas |
| Cancelamento | **OK** (perfil + histórico) | Vitest BA-013; venda `CANCELADA` no dia |
| Permissões RPC | **OK** | anon sem EXECUTE nas RPCs PDV |
| Diagnóstico produção | **OK** | RPC `pdv_diagnostico_pre_producao` presente |
| Cadastro rápido (RPC) | **OK** | Create+estoque como ator OPERADOR |
| Cadastro rápido → venda UI | **PARCIAL** | Action/UI wired; smoke RPC ok; E2E UI dedicado não rodado nesta sessão |
| Sangria → fechar (E2E) | **PARCIAL** | Menu Operações ok; botão preset `R$ 50.00` não encontrado (UI drift) — **P1** |

Artefatos E2E:  
`backend/artifacts/e2e_missao1_rehomolog_*.txt`, `e2e_missao1_venda_multi_*.txt`, `e2e_missao1_fluxos_golden_*.txt`

---

## Critério de sucesso

| Frase | Status |
|---|---|
| Abrir o caixa | **Sim** |
| Vender | **Sim** |
| Receber (pagamento) | **Sim** |
| Baixar estoque | **Sim** |
| Fechar operação | **Sim** (botão Fechar caixa no PDV; fechar cego via UI disponível) |

---

## Próximo

Conforme combinado: avançar para **Missão 3 — Matriz Go/No-Go completa**, depois gestão de funcionários.

Residual opcional (não bloqueia Missão 3): ajustar E2E sangria aos presets atuais do modal.
