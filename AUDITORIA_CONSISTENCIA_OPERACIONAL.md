# Auditoria de Consistência Operacional — Preço · PDV · Estoque como Fonte Única de Verdade

> **Escopo.** Mapear o estado real do sistema contra o princípio diretor:
> *"preço, estoque e PDV são fontes únicas de verdade, e todo o resto deriva disso"*.
> Cada invariante é verificado contra **evidência de código** (arquivo:linha), com
> veredito honesto. Documento **read-only** — não altera comportamento. É o passo 0
> antes de qualquer construção, justamente para não reescrever o que já existe (o
> erro clássico de duplicação/drift).
>
> Data: 2026-06-22 · Base: 243 migrations · Branch: `claude/beautiful-feynman-59nrqd`

---

## TL;DR — o núcleo já existe e está blindado

O sistema **já implementa** o princípio de fonte única para os três pilares de Nível 0.
Não há lógica de preço duplicada no front online, a venda é transacional/atômica e o
estoque baixa dentro da mesma transação. O incremento honesto **não é construir um
sistema novo** — é fechar 4 lacunas pontuais e tornar os invariantes verificáveis num
portão único.

| Pilar | Fonte única | Veredito |
|---|---|---|
| 💰 Preço | `calcular_preco_produto` (RPC `SECURITY DEFINER`) | ✅ Consolidado e guardado |
| 🧾 PDV | `finalizar_venda_transacional_canonica_v4` | ✅ Transacional, idempotente, com lock |
| 📦 Estoque | `decrementar_estoque_seguro` + kardex imutável | ✅ Atômico e acoplado à venda |
| 🧠 Auditoria | trilhas por feature (não universal) | ⚠️ Parcial — lacuna real |
| 💳 Financeiro | espelho passivo `venda_finance_context` | ⚠️ Rastreável, mas sem ledger |

---

## 1. 💰 Preço — Nível 0 · autoridade absoluta

**Invariante exigido:** regra de cálculo única; sem fallback silencioso; sem divergência
web/desktop/PDV; sem lógica duplicada no front.

| # | Invariante | Status | Evidência |
|---|---|---|---|
| P1 | Cálculo de preço tem uma única autoridade | ✅ | `calcular_preco_produto(...)` `SECURITY DEFINER`, cascata determinística faixas `precos_atacado` → atacado de catálogo (≥ mínimo) → varejo — `backend/supabase/migrations/234_calcular_preco_produto_security_definer.sql:24-101` |
| P2 | Sem fallback silencioso | ✅ | Erros explícitos (`quantidade_invalida`, `produto_nao_encontrado`); o "fallback" é o varejo **canônico**, não um chute — `234:...41-100` |
| P3 | Preço revalidado no commit da venda (servidor, não cliente) | ✅ | v4 chama o RPC server-side por item e aplica tolerância **no banco** (epsilon=0.02) — `243_finalizar_venda_canonica_v4_captura.sql:7-13` (diff v3→v4, itens 1–3) |
| P4 | Front online não recalcula preço | ✅ | `pricing-rpc-guard.mjs` proíbe import do `PricingService` em zonas online (análise por **grafo de imports**, não busca textual) — `scripts/pricing-rpc-guard.mjs:5-52` |
| P5 | Desktop/offline não diverge | ✅ (por teste) | `PricingService` TS é exceção explícita só no `pdv-local`; equivalência Offline×RPC garantida por **golden test** — `scripts/pricing-rpc-guard.mjs:11-16` |

**Veredito: ✅ CONSOLIDADO.** As referências a `preco_varejo`/`preco_atacado` no front
(`NovoProdutoModal.tsx`, `produtoRepository.ts`, etc.) são **cadastro/leitura**, não
cálculo de venda — não violam P4.

> ⚠️ **Ponto de atenção (não é lacuna):** P5 depende de o golden test cobrir todas as
> faixas. Recomenda-se anexá-lo ao portão único (seção 7) para que a divergência
> Offline×RPC **falhe o CI** se a cascata mudar de um lado só.

---

## 2. 🧾 PDV — Nível 0 · coração operacional

**Invariante exigido:** venda, desconto, pagamento, cancelamento, impressão consistentes.

| # | Invariante | Status | Evidência |
|---|---|---|---|
| V1 | Finalização atômica e idempotente | ✅ | `finalizar_venda_transacional_canonica_v4` com `pg_advisory_xact_lock` por venda e `ensure_venda_evento_registrado` (idempotente no early-return) — `243:...11-13` |
| V2 | Causalidade venda → estoque | ✅ | Header gravado **antes** da baixa; itens + baixa no PASSO 3 da mesma transação — `243:...183-206` |
| V3 | Desconto auditado por operador | ✅ | `113_descontos_venda_auditoria_operador.sql`; limite de desconto manual em `122_limite_desconto_manual_itens.sql` |
| V4 | Pagamento (split) consistente | ✅ | `051_split_payment_vendas_pagamentos.sql`, `053_split_payment_valor_sistema_dinheiro.sql` |
| V5 | Cancelamento com reposição de estoque | ✅ | `050_cancelar_venda_transacional.sql` + `estoque_reposicoes_cancelamento` no kardex (`ENTRADA_CANCELAMENTO_VENDA`) — `127:...234-248` |
| V6 | Imutabilidade pós-fechamento | ✅ | Trigger de imutabilidade — `206_vendas_caixa_imutabilidade_trigger.sql` |
| V7 | Fiscal não derruba a venda | ✅ | Enfileiramento fiscal desacoplado — `243:...12` (diff item 5) |

**Veredito: ✅ CONSOLIDADO.** O PDV **não** está isolado do estoque (erro clássico 2 do
manifesto está descartado): a baixa ocorre dentro da transação da venda.

---

## 3. 📦 Estoque — Nível 0 · consistência em tempo real

**Invariante exigido:** entrada/saída, ajuste, inventário, estoque mínimo, sem
inconsistência (prejuízo invisível).

| # | Invariante | Status | Evidência |
|---|---|---|---|
| E1 | Baixa atômica com lock | ✅ | Lock otimista por `version` + `FOR UPDATE` — `127:...114-144` |
| E2 | Idempotência da baixa | ✅ | `(venda_id, produto_id)` em `estoque_baixas` + índice único no log — `127:...40-44, 96-112` |
| E3 | Kardex físico e imutável | ✅ | `movimentos_estoque_log` (`SAIDA_VENDA`, delta negativo) — `127:...151-167` |
| E4 | Estoque por loja | ✅ | `032_lojas_estoque_por_loja.sql`; baixa amarrada à loja do caixa — `127:...71-82` |
| E5 | Ajuste manual rastreável | ✅ | `063_ajuste_manual_estoque_kardex.sql` |
| E6 | Estoque mínimo / capital parado | ✅ | `v_estoque_baixo` (`040`); `relatorio_produtos_sem_giro_periodo` — `127:...262-348` |
| E7 | **Reserva de estoque (scan → finalização)** | ❌ | **Não existe** `reservar_estoque`/`quantidade_reservada` (grep vazio). Estoque só baixa no finalize. Ver Lacuna G1. |
| E8 | **Inventário (contagem física × sistema)** | ❌ | Não há RPC de inventário/conferência cíclica — só ajuste manual avulso (E5). Ver Lacuna G2. |

**Veredito: ✅ núcleo sólido, com 2 lacunas (G1, G2).** A integridade **transacional**
está garantida; o que falta é a camada de **antecipação** (reserva) e a de
**reconciliação** (inventário).

---

## 4. 🧠 Auditoria — Nível 1 · rastreabilidade total

**Invariante exigido:** "log de tudo; quem fez, quando, onde, antes/depois".

| # | Invariante | Status | Evidência |
|---|---|---|---|
| A1 | Trilha de cancelamento | ✅ | `vendas_canceladas_auditoria` — `050:...6` |
| A2 | Trilha de desconto | ✅ | `113_descontos_venda_auditoria_operador.sql` |
| A3 | Kardex como trilha de estoque | ✅ | `movimentos_estoque_log` com `usuario_id` — `127:...151-167` |
| A4 | Eventos de venda | ✅ | `229_venda_eventos_rpc_hooks.sql` |
| A5 | **Trilha universal antes/depois** | ❌ | **Não existe** tabela `audit_log`/`audit_trail` genérica. A auditoria é **por feature**, não cobre `produtos`, `precos_atacado`, `estoque`, `pdv_config`, `usuarios` com `OLD`/`NEW` uniforme. Ver Lacuna G3. |

**Veredito: ⚠️ PARCIAL.** Os fluxos críticos têm trilha; **não há** a infraestrutura
universal "quem/quando/onde/antes/depois" que o próprio manifesto classifica como
*infraestrutura de confiança*, não feature. Esta é a lacuna de maior alinhamento com o
texto.

---

## 5. 💳 Financeiro — Nível 1

| # | Invariante | Status | Evidência |
|---|---|---|---|
| F1 | Venda origina o financeiro (sem recalcular) | ✅ | `venda_finance_context` — espelho **unidirecional/passivo**; caixa = autoridade de liquidez; conta = registro financeiro — `235_venda_finance_context_mirror.sql:1-39` |
| F2 | Contas a pagar/receber | ✅ | `104`, `108` (pagar + RPC pagamento); `112` (receber, isolamento por loja) |
| F3 | Liquidez do caixa | ✅ | `045_caixa_movimentacoes_transacionais.sql`, `049/053` valor-sistema |
| F4 | Ledger / projeção de inadimplência | ⚠️ | **Por design, não há** FinanceEngine/event-sourcing — decisão explícita em `235:...15-21`. Atende hoje; é o "risco oculto" do manifesto (item 5) se a projeção crescer. Ver Lacuna G4 (observação). |

**Veredito: ⚠️ RASTREÁVEL, sem ledger.** Correto e desacoplado para o estágio atual.
G4 é decisão de produto, não bug.

---

## 6. Lacunas priorizadas (o que de fato falta)

| ID | Lacuna | Pilar / Nível | Impacto | Esforço | Recomendação |
|----|--------|---------------|---------|---------|--------------|
| **G3** | Trilha de auditoria **universal** (antes/depois em tabelas críticas) | Auditoria · N1 | Alto — manifesto a chama de infra de confiança; sem ela não é "auditável/enterprise" | Médio | **Priorizar.** Trigger/RPC genérico `audit_log(tabela, op, old, new, ator, loja, ts)` nas tabelas críticas, com RLS read-only por perfil |
| **G2** | **Inventário** (contagem física × saldo, reconciliação cíclica) | Estoque · N0 | Médio-alto — "estoque nunca vai bater" (ponto cego do manifesto) | Médio | RPC de sessão de inventário que gera `AJUSTE_INVENTARIO` no kardex (reaproveita `063`) |
| **G1** | **Reserva de estoque** entre scan e finalização | Estoque · N0 | Médio — sem corrupção (lock impede oversell), mas falha tardia no finalize em multi-terminal | Médio-alto | Reserva com TTL + liberação em cancelamento/timeout; só se houver concorrência real por item escasso |
| **G4** | Ledger/projeção financeira | Financeiro · N1 | Baixo hoje | Alto | **Não fazer agora** — decisão consciente da `235`. Reavaliar quando inadimplência/projeção virar requisito |
| **P5/V/E** | Invariantes **não verificados num portão único** | Transversal | Médio — guards existem mas dispersos; drift silencioso possível | Baixo-médio | Consolidar em `guard:consistency` no CI (inclui golden Offline×RPC) |

---

## 7. Recomendação de sequência

1. **G3 — Auditoria universal** (maior alinhamento com o manifesto; destrava "enterprise").
2. **Portão único de consistência** (`guard:consistency`) — barato, transforma os
   invariantes desta auditoria em verificação executável que **falha o CI** no drift.
3. **G2 — Inventário** (fecha o ponto cego "estoque não bate").
4. **G1 — Reserva** apenas se a concorrência por item escasso for real.
5. **G4 — Ledger**: manter como está; reavaliar sob demanda de produto.

> **Conclusão.** O sistema **não precisa** de um "novo sistema de consistência" — ele
> já é um. Precisa de **4 fechamentos cirúrgicos** (G1–G3 + portão único) e de
> **disciplina de verificação** para que as garantias atuais não regridam por drift.
