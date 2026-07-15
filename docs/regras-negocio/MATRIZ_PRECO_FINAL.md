# Matriz Canônica do Preço Final — Contrato Oficial do Domínio

**Status:** CANÔNICO (contrato de domínio)
**Escopo:** todo o cálculo que altera o preço pago pelo cliente — preço automático, descontos, travas e totais.
**Premissa:** uma regra, uma autoridade, um algoritmo. Nenhuma regra vive só em comentário, migration ou PR.
**Relacionados:** [MATRIZ_AUTORIDADES_P1.md](./MATRIZ_AUTORIDADES_P1.md) (preço automático — Autoridade #1) · [CONSOLIDACAO_P1_NUCLEO_PDV.md](./CONSOLIDACAO_P1_NUCLEO_PDV.md) · [venda-golden-flow.md](../venda-golden-flow.md) (congelado).

> Este documento é auto-suficiente: um novo desenvolvedor entende o comportamento de preço **apenas** por ele e pelo código canônico apontado, **sem reconstruir a história das migrations ou dos PRs**.

---

## 0. Autoridades — uma por conceito

| Conceito | Autoridade única | Arquivo canônico |
|----------|------------------|------------------|
| Preço unitário automático (VAREJO/ATACADO) | RPC `calcular_preco_produto` ≡ `PRICE_RESOLUTION_CHAIN` | `backend/.../250_calcular_preco_produto_decision_fields.sql` · `shared-core/src/pricing/resolution.ts` · `shared-core/src/pricing/calcularPrecoCanonico.ts` |
| Revalidação de preço na finalização (anti-fraude) | RPC `finalizar_venda_transacional_canonica_v4` (PASSO 1) | `backend/.../268_reconcile_finalizar_venda_v4_single_overload.sql` |
| Desconto manual por item | Trigger `trg_fn_itens_venda_limite_desconto` (teto 15%) | `backend/.../122_limite_desconto_manual_itens.sql` |
| Desconto de gerente sobre o total | `managerDiscount/policy.ts` + Edge `validar-gerente` + v4 | `shared-core/src/managerDiscount/policy.ts` |
| Margem mínima (cadastro) | Triggers `trg_fn_produtos_margem` / `trg_fn_precos_atacado_margem` / `trg_fn_regras_preco_margem` | `backend/.../124_*` e `125_*` |
| Arredondamento monetário | `round_abnt` (SQL) ≡ `roundAbnt` (TS, `halfExpand`) | `backend/.../055_round_abnt_finalize_v2.sql` · `pdv-importados/core/money/roundAbnt.ts` |
| Totais do carrinho | `shared/cart/totals.ts` (líquido = Σ preço_unit·qtd) | `shared/cart/totals.ts` |

**Caller único de finalização (Web):** `pdv-importados/app/caixa/server/caixaVendas.impl.ts` → `finalizar_venda_transacional_canonica_v4`. Chamar v2/v3 é proibido (revogados de `authenticated`).

---

## 1. Ordem oficial de execução do preço final

```
1. Preço base ....... produtos.preco_varejo
2. Preço automático . calcular_preco_produto:  tier (precos_atacado)
                                                → catálogo (preco_atacado + min padrão)
                                                → varejo                       [SUBSTITUI a base]
3. Override humano ... MANUAL (desconto por item)                              [SUBSTITUI o automático]
                       teto: 15% por item (exceto ATACADO)
4. Desconto gerente . percentual sobre o TOTAL líquido                         [ACUMULA sobre o líquido]
                       teto: pdv_config.max_desconto_gerente_percentual (20%)
5. Travas ........... preço ≥ 0 (commit) · totais consistentes ±0,02
                     = PREÇO FINAL
```

A ordem do passo 2 (tier → catálogo → varejo) é a **Autoridade #1**, já formalizada e coberta por golden test. Os passos 3–5 são formalizados **aqui pela primeira vez** como pilha única.

---

## 2. Substituição × Acumulação

| Camada | Substitui | Acumula | Observação |
|--------|:---------:|:-------:|-----------|
| Preço automático (tier/catálogo/varejo) | a base | — | precedência por fonte, não por valor (tier sempre vence catálogo) |
| MANUAL (desconto item) | o automático da linha | — | linha vira `tipo_preco=MANUAL`; não coexiste com atacado na mesma linha |
| Desconto de gerente | — | **sim**, sobre o total líquido | mecanismo independente do desconto por item |

**MANUAL e PROMOCAO são mutuamente exclusivos com o preço automático na mesma linha** (override humano por snapshot, fora da cadeia automática).

---

## 3. Travas (invariantes de preço)

| Trava | Onde | Regra |
|-------|------|-------|
| Preço não-negativo | v4 (`preco_unitario < 0` → erro) + store (`Math.max(0,…)`) | preço unitário nunca < 0 |
| Totais consistentes | v4 (`±0,02`) e client (`totalsMatchDeclared`) | bruto/desconto/líquido declarados = recalculados |
| Margem no **cadastro** | triggers 124/125 | varejo/atacado/regra < custo bloqueado, salvo `permitir_abaixo_custo` |
| Pagamento ≤ total | v4 (`> total + 0,01` → erro) | soma de parcelas não excede o líquido |

**Não existe** trava de custo/margem no **ato da venda** — ver §6.3 (decisão deliberada).

---

## 4. Tetos de desconto — ambiguidade resolvida

Existiam duas leituras sobre a autoridade do gerente. **Resolução canônica (com base na auditoria histórica):**

- **Desconto MANUAL por item:** teto **rígido de 15%** (`pdv_config.max_desconto_manual_item_percentual`), exceto linhas `ATACADO`. **O gerente NÃO amplia esse teto por item.**
- **Desconto de gerente:** teto **20%** (`pdv_config.max_desconto_gerente_percentual`), aplicado **apenas sobre o total líquido**, mediante token da Edge `validar-gerente`.

> **Por que não há bypass do teto por item:** a isenção via `session.gerente_token_validado` existe unicamente na função **legada** `finalizar_venda_transacional` (migration 122), que **o app não chama**. O caller canônico (`v4`) nunca seta esse flag. Logo, no fluxo real, o teto de 15% por item é incondicional. O comentário da migration 122 que sugere o contrário é **histórico e não representa o domínio** (correção de comentário via migration `270`; branch legada a remover — §9).

---

## 5. Web × Local — exceções deliberadas

Autoridade de finalização por canal (locked; guardado por `scripts/rpc-gate-guard.mjs`):
**Web** = `finalizar_venda_transacional_canonica_v4` (`authenticated`); **Local** =
`registrar_venda_com_itens` (`service_role`, via `sync-outbox`). v2/v3 revogadas de
`authenticated`. Não há caminho paralelo alcançável por cliente web.

| Aspecto | Web (v4) | Local (`registrar_venda_com_itens`, migration 014) | Deliberada? |
|---------|-----|-------------------|:-----------:|
| Preço automático | RPC `calcular_preco_produto` | `calcularPrecoCanonico` (mesmo algoritmo, cache dos mesmos inputs) | mesma regra — golden test garante paridade |
| Revalidação de preço na finalização | revalida VAREJO/ATACADO no servidor | **não revalida** (confia no snapshot offline) | **Sim** (migration 123): preço offline era legítimo no momento da venda |
| Semântica de `tipo_preco` | vinda do cliente e revalidada; MANUAL/PROMOCAO preservados | **sintetizada** pela RPC 014: `preco_unitario < preco_original → ATACADO`, senão `VAREJO`. **MANUAL/PROMOCAO nunca persistem offline.** | consequência do modelo offline — **dívida técnica** (§9), não bug |
| Teto de desconto por item (15%, trigger 122) | **aplicado** (MANUAL não é isento) | **não aplicado**: todo item descontado vira `ATACADO`, e o trigger isenta ATACADO | **Sim** por decisão de confiar no PDV offline; efeito colateral do `tipo_preco` sintético |
| Desconto de gerente | v4 valida contra `pdv_config.max_desconto_gerente_percentual` + token | grava `descontos_venda` **sem validar cap/token** (validado no PDV local no momento da venda) | **Sim** (mesma premissa offline) |
| Contas a receber (parcial) | v4 gera CR | não gera | **Sim** (canal dual documentado) |
| Baixa de estoque | atômica na v4 | passo separado (BA-012) | dívida conhecida, não reabrir aqui |

Todas as divergências Web/Local acima são **deliberadas** (premissa única: o PDV Local
valida no momento da venda e o servidor confia no snapshot sincronizado — migration 123).
Qualquer divergência **não listada aqui** é bug.

---

## 6. Decisões deliberadas de produto (transcritas de migrations/PRs)

Estas regras eram decisões reais presas em comentários — agora são contrato:

1. **FIADO não existe no domínio.** Decisão de produto (Diretor de Produto, 2026-06-20; migration 246). Enforced por CHECK em `vendas`/`vendas_pagamentos` e rejeição explícita na v4. Vale para todos os canais.
2. **`regras_preco` não é autoridade de preço.** Decisão arquitetural (PR #182). O motor automático é exclusivamente `calcular_preco_produto`/`PRICE_RESOLUTION_CHAIN`. `regras_preco` permanece como transporte legado sem consumidor (§9).
3. **Não há piso de custo absoluto no ato da venda.** Escopo deliberado (migration 124): a margem é protegida no **cadastro**; em operação, o controle é o teto de desconto (15% item / 20% gerente). ⚠️ Consequência aceita: um produto de margem baixa pode ser vendido abaixo do custo dentro desses tetos. Se o negócio quiser um piso absoluto de custo na venda, é **nova decisão de produto** (não é bug).

---

## 7. O que NÃO é regra ativa (evita falsas autoridades)

Conceitos ausentes do domínio — **não** existe implementação e **não** devem ser assumidos:

- Promoções, Cupons, Campanhas.
- Preço por cliente / Cliente VIP / Desconto por perfil.
- Preço fixo comercial, múltiplas tabelas de preço.
- Piso de preço por item (`precoMinimo`): removido — era campo morto (nunca atribuído).

`clienteId` **não** altera preço; serve apenas a `contas_receber` (pagamento parcial). `tipo_preco='PROMOCAO'` existe no enum por compatibilidade de contrato, mas **nenhum fluxo o produz** hoje.

---

## 8. Único ponto de decisão de produto pendente

**Preço unitário R$ 0,00 (linha grátis/brinde) é venda válida?**
- Comportamento atual (de-facto): **permitido** (a trava é `< 0`, não `<= 0`).
- Este é o único item genuinamente indeciso do domínio. Até ratificação, vale o status quo (permitido). Ratificar como decisão de produto (manter permitido **ou** bloquear com `<= 0`) encerra a última ambiguidade.

---

## 9. Legado a remover (scaffold que não representa o domínio)

Rastreado para remoção — não é autoridade de nada:

| Item | Evidência | Ação | Bloqueio |
|------|-----------|------|----------|
| `PricingService` (motor PROMOCAO) | nenhum importador de runtime | **REMOVIDO** nesta sprint | — |
| Campo `precoMinimo` | nunca atribuído | **REMOVIDO** nesta sprint | — |
| Plumbing `regras`/`setRegras` + fetch/sync de `regras_preco` | armazenado, nunca consumido no cálculo | remover em follow-up | requer alterar contrato de sync offline + cache SQLite, validado ponta-a-ponta |
| Função legada `finalizar_venda_transacional` (plain) + branch `session.gerente_token_validado` no trigger 122 | não chamada pelo app; flag só setado por ela | remover em follow-up (migration dedicada) | requer validação em DB real |
| `tipo_preco` sintético em `registrar_venda_com_itens` (RPC 014) | rotula `preco_unitario<preco_original → ATACADO`; diverge da semântica canônica e isenta o teto por item no Local (§5) | reconciliar com o modelo canônico **se** o produto decidir espelhar invariantes Web no Local | decisão de produto + validação em DB real |

---

## 10. Testes que representam o contrato

| Regra | Autoridade | Teste | Camada |
|-------|-----------|-------|--------|
| Preço automático (tier/catálogo/varejo/fracionado) | `calcularPrecoCanonico` | `shared-core/src/pricing/calcularPrecoCanonico.spec.ts` | vitest (local) |
| Paridade Web≡Local (preço) | `calcularPrecoCanonico` | `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` | vitest (local) |
| Desconto de gerente (clamp/cap/acumulação sobre o total/arredondamento) | `managerDiscount/policy.ts` | `shared-core/src/managerDiscount/policy.test.ts` | vitest (local) |
| Totais do carrinho | `shared/cart/totals.ts` | `pdv-importados/app/caixa/carrinhoStore.behavior.test.ts` | vitest (local) |
| Finalização (revalidação/totais) | RPC v4 | `pdv-importados/app/caixa/finalizarVendaCaixa.integration.test.ts` | vitest (local) |
| Teto de 15% por item (rejeita MANUAL>15%, isenta ATACADO) | trigger 122 | `backend/supabase/scripts/smoke_122_teto_desconto_manual_item.sql` | SQL smoke (DEV/staging) |
| Web×Local: `tipo_preco` sintético no Local | RPC 014 | `backend/supabase/scripts/smoke_014_local_tipo_preco_sintetico.sql` | SQL smoke (DEV/staging) |

Cada regra é testada **na sua camada de autoridade**: a lógica em TypeScript por
vitest (executável localmente); os invariantes que vivem em trigger/RPC do Postgres
por smoke SQL (convenção DEV/staging do repo, ex.: `smoke_023_*`), exigindo um banco
com fixtures — não reimplementados em TS para não criar autoridade paralela.

---

*Contrato de domínio. Alterações a este documento exigem justificativa classificada (bug / duplicação / SSoT / legado / simplificação / doc / decisão de produto).*
