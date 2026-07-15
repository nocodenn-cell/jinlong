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

| Aspecto | Web | Local (pdv-local) | Deliberada? |
|---------|-----|-------------------|:-----------:|
| Preço automático | RPC `calcular_preco_produto` | `calcularPrecoCanonico` (mesmo algoritmo, cache dos mesmos inputs) | mesma regra — golden test garante paridade |
| Revalidação de preço na finalização | v4 revalida VAREJO/ATACADO no servidor | `sync-outbox` → `registrar_venda_com_itens` **não revalida** | **Sim** (migration 123): preço offline era legítimo no momento da venda |
| Contas a receber (parcial) | v4 gera CR | não gera | **Sim** (canal dual documentado) |
| Baixa de estoque | atômica na v4 | passo separado (BA-012) | dívida conhecida, não reabrir aqui |

Divergências acima são **exceções deliberadas e documentadas**. Qualquer outra divergência Web/Local é bug.

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

---

## 10. Testes que representam o contrato

| Regra | Teste |
|-------|-------|
| Preço automático (tier/catálogo/varejo/fracionado) | `shared-core/src/pricing/calcularPrecoCanonico.spec.ts` |
| Paridade Web≡Local | `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` |
| Desconto de gerente (clamp/valor) | `shared-core/src/managerDiscount/policy.test.ts` |
| Totais do carrinho | `shared/cart` + `pdv-importados/app/caixa/carrinhoStore.behavior.test.ts` |
| Finalização (revalidação/totais) | `pdv-importados/app/caixa/finalizarVendaCaixa.integration.test.ts` |

**Lacuna conhecida:** não há teste cobrindo o teto de 15% por item nem a acumulação do desconto de gerente sobre o total. Recomenda-se adicionar (não bloqueia o contrato).

---

*Contrato de domínio. Alterações a este documento exigem justificativa classificada (bug / duplicação / SSoT / legado / simplificação / doc / decisão de produto).*
