# Consolidação P1 — Regras de negócio (núcleo PDV)

**Status:** CANÔNICO para decisão operacional  
**Escopo:** preço atacado · pagamento parcial · venda em espera · estoque · fechamento de venda  
**Data:** 2026-07-13  
**Premissa:** uma regra, uma autoridade, um algoritmo por domínio.

Não substitui [venda-golden-flow.md](../venda-golden-flow.md) (congelado). Complementa com decisões pós-auditoria P0/P1.

---

## 1. Preço atacado

| Campo | Conteúdo |
|-------|----------|
| **Regra** | O mesmo produto, na mesma quantidade e loja, produz o mesmo preço unitário automático (VAREJO/ATACADO) em Web e PDV Local. |
| **Autoridade** | RPC `calcular_preco_produto` ≡ `PRICE_RESOLUTION_CHAIN` (`shared-core/src/pricing/resolution.ts`): `precos_atacado` → `produtos.preco_atacado` + `pdv_config.quantidade_minima_atacado_padrao` → `preco_varejo`. |
| **Algoritmo** | Um só. Offline executa o **mesmo** algoritmo sobre cache dos **mesmos** inputs — não um subset comercial. |
| **Fora da regra** | `regras_preco` **não** é fonte de atacado. MANUAL/PROMOCAO = override humano (snapshot), fora da cadeia automática. |
| **Estado** | **BLOQUEADA** no #182 até Local espelhar a cadeia sem misturar `regras_preco`. Web (RPC) já canônico. |
| **Proibido** | Dois motores de atacado; sync que omite loja/`preco_atacado` e ainda alimenta o motor com CATEGORIA→ATACADO. |

---

## 2. Pagamento parcial

| Campo | Conteúdo |
|-------|----------|
| **Regra** | Se a soma dos pagamentos é menor que o total líquido (acima de `SALDO_PENDENTE_EPS`), a venda **só** conclui com `cliente_id` da loja; o saldo vira `contas_receber` idempotente. |
| **Autoridade** | RPC `finalizar_venda_transacional_canonica_v4` + helper `caixaPagamentoSaldo` (`pagamentoParcialExigeCliente`). |
| **Algoritmo** | Underpay permitido na UI; sem cliente → modal; com cliente → finalize com `p_cliente_id`. Troco (excesso) continua normalizado em DINHEIRO. |
| **Canal** | **Web.** Local/`registrar_venda_com_itens` **não** gera CR (canal dual documentado no golden flow). |
| **Estado** | **CANÔNICA** no Web (#180). E2E oficial: `e2e/caixa-fase5b-golden-flow-ui.spec.ts`. |
| **Proibido** | Bloquear underpay na UI quando a RPC permite; finalizar parcial anônimo. |

---

## 3. Venda em espera

| Campo | Conteúdo |
|-------|----------|
| **Regra** | Park/retoma isolados de `vendas`: não baixa estoque, não cria pagamento, não conclui venda. |
| **Autoridade** | RPCs `colocar_venda_em_espera` / retomar / listar / descartar · tabela `vendas_em_espera`. |
| **Cliente** | Campo `cliente_id` existe; app hoje envia **sempre** `null` (`TECH_DEBT_VENDA_ESPERA_CLIENTE`). Após retomada, parcial Fase 5b exige reescolher cliente. |
| **Estado** | **CANÔNICA** para park/estoque/pagamento. **DÍVIDA** (Fase 7) para persistir cliente — não conflita com parcial; só exige reassociação. |
| **Proibido** | Tratar espera como venda concluída; baixar estoque no park. |

---

## 4. Estoque

| Campo | Conteúdo |
|-------|----------|
| **Regra (Web)** | Baixa de estoque da venda é **atômica** na mesma TX da v4 (`decrementar_estoque_seguro` dentro da RPC). |
| **Regra (Local)** | Persistência da venda (`registrar_venda_com_itens`) e baixa (`aplicarBaixaEstoquePorItem`) são **passos separados** — gap BA-012 conhecido. |
| **Cancelamento Web** | Reposição via RPC de cancelamento (perfil GERENTE+ — #183). |
| **Estado** | Web **CANÔNICA**. Local **DÍVIDA** (BA-012) — não reabrir neste consolidado; não expandir. |
| **Proibido** | Terceiro fluxo de baixa fora dos callers do golden flow; inventar reserva de espera. |

---

## 5. Fechamento de venda

| Campo | Conteúdo |
|-------|----------|
| **Regra (Web)** | Uma venda = uma chamada a `finalizar_venda_transacional_canonica_v4` via `caixaVendas.impl.ts` somente. Idempotência por `venda_id` + advisory lock. |
| **Regra (Local)** | Outbox → `registrar_venda_com_itens` via `sync-outbox` somente. Sem CR automático. |
| **Efeitos Web** | vendas + itens + estoque + pagamentos + CR (se saldo) + evento · preço VAREJO/ATACADO revalidado no servidor. |
| **Caixa espécie** | v4 **não** incrementa `saldo_atual`. Fechamento de turno usa `calcular_valor_sistema_dinheiro_caixa` (BA-002 congelado: `saldo_atual` ≠ valor de gaveta). |
| **Estado** | Caller/RPC **CANÔNICO**. Dual-canal Web/Local **documentado**, não unificado. |
| **Proibido** | Chamar v2/v3; segundo caller da v4; alterar golden flow sem revisão explícita. |

---

## Ordem de merge / bloqueios

| Item | Ação |
|------|------|
| #180 (parcial) | Pronto sob regra §2 |
| #181 (fechamento caixa Local) | Fora deste núcleo de venda; não conflita com §1–5 |
| #182 (atacado Local) | **Bloqueado** até §1 (espelho RPC sem `regras_preco` no motor) |
| #176 / #183 | Já merged |

---

## Critério de “consolidado”

Cada domínio acima tem **uma frase de regra**, **uma autoridade** e **estado explícito**.  
Implementação só reabre quando a autoridade única de §1 estiver espelhada no Local; demais domínios deste documento não exigem novo ciclo de produto.
