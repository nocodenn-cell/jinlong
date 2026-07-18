# ADR-008 — Inventory: fronteira de domínio e autoridade

| Campo | Valor |
|--------|--------|
| **ID** | ADR-008 |
| **Título** | Fronteira do domínio Inventory (estoque físico) e contrato de autoridade com Postgres |
| **Status** | Aceito — decisões de fronteira e autoridade (Missão Inventory 1); **sem implementação de código nesta data** |
| **Data** | 2026-07-18 |
| **Contexto** | Inventory 0 inventário aprovado; ADR-007 Products aceito |
| **Missão** | Inventory 1 — ADR de fronteira e autoridade |
| **Relacionados** | [ADR-005](./ADR-005-fronteiras-dominio-shared-core.md), [ADR-006](./ADR-006-frontend-domain-boundaries.md), [ADR-007](./ADR-007-products-domain-boundary.md), [ADR-CAIXA-002](./ADR-caixa-contrato-financeiro-pos-cancelamento.md), [Inventário Inventory 0](../architecture/inventario_inventory_autoridade.md), [Template domínio](../architecture/template_dominio_internacionalizado.md), entity-ssot (`.cursor/rules/entity-ssot.mdc`), DEC-012 |

---

## Contexto

O inventário Inventory 0 ([`inventario_inventory_autoridade.md`](../architecture/inventario_inventory_autoridade.md)) mapeou o estoque operacional: saldo em `estoque` (loja+SKU), kardex em `movimentos_estoque_log`, ajustes via `ajustar_estoque_manual`, entradas (remessa, NF-e, transferência) e saídas (venda, ajuste, transferência). Mutações canônicas já moram no **Postgres** (RPCs com `FOR UPDATE` e idempotência). Inventário físico formal e reservas **não** existem; acerto pontual usa motivo `ACERTO_INVENTARIO`.

A superfície app ainda é dual-layer (`/admin/estoque` × `gerente/estoque`) e há legado (`garantirLinhaEstoque` INSERT sem kardex). Sem ADR de fronteira, a Missão Inventory 2+ tende a:

- fazer **products** dono do saldo (violando ADR-007 e entity-ssot);
- deixar **sales** dar UPDATE direto em `estoque` fora do orquestrador;
- misturar **cash** / financeiro com saldo físico;
- tratar UI, cache ou soma de vendas como fonte de verdade.

### Relação com ADR-007 (Products)

[ADR-007](./ADR-007-products-domain-boundary.md) já separou catálogo de estoque: products owns SKU/preço de cadastro; inventory owns saldo/movimentos; create atômico via RPC `criar_produto_com_estoque_inicial` (270) é orquestração cross-domínio, não transferência de dono. Este ADR **complementa** o lado inventory dessa fronteira e congela como sales solicita baixa sem escrever saldo na app.

### Relação com ADR-CAIXA-002

[ADR-CAIXA-002](./ADR-caixa-contrato-financeiro-pos-cancelamento.md) define o contrato de caixa pós-cancelamento: \(E(c)\), `movimentacoes_caixa` e `saldo_atual` físico da gaveta. **Cash não conhece estoque** — cancel/devolver orquestram inventory **e** cash na mesma RPC sales-led, mas cada efeito permanece no dono da tabela. Inventory não participa de \(E(c)\) nem de pagamentos (`vendas_pagamentos` = sales).

Este ADR **congela responsabilidades e autoridade** do domínio Inventory. Não cria `shared-core/inventory`, não move código, não altera RPC nem UI.

---

## Decisão

### 1. Responsabilidade do domínio Inventory

**Inventory** é o dono conceitual do **estoque físico e seus movimentos**.

| Owns | Inclui |
|------|--------|
| **Saldo de estoque** | Tabela `estoque` (`quantidade_atual`, `estoque_minimo`, `version`) por `(loja_id, produto_id)` |
| **Movimentos** | `movimentos_estoque_log`, `tipos_movimento_estoque`, views de kardex (`v_kardex_unificado`, etc.) |
| **Ajustes de quantidade** | RPC `ajustar_estoque_manual` e motivos (`COMPRA`, `PERDA`, `QUEBRA`, `ACERTO_INVENTARIO`, `OUTRO`) |
| **Regras de disponibilidade** | Disponível ≈ `quantidade_atual` (sem reservas hoje); bloqueio de negativo nas RPCs; leitura para transferência / alertas (`v_estoque_baixo`) |
| **Fluxos de estoque** | Remessa/recebimento, transferência, entrada NF-e (efeito estoque), idempotência de baixa/reposição |
| **UI SSoT de saldo** | `/admin/estoque/*` (entity-ssot) |

| Não owns | Dono |
|----------|------|
| Catálogo de produtos / identidade SKU | **products** ([ADR-007](./ADR-007-products-domain-boundary.md)) |
| Preço de cadastro ou preço efetivo de venda | **products** + Postgres `calcular_preco_produto` |
| Venda, itens, pagamentos da venda | **sales** |
| Caixa, \(E(c)\), `movimentacoes_caixa`, `saldo_atual` | **cash** ([ADR-CAIXA-002](./ADR-caixa-contrato-financeiro-pos-cancelamento.md)) |
| Financeiro (CR/AP, painel títulos) | Domínios financeiros — **não** inventory |
| Valuation / custo médio de estoque | Fora de escopo até missão explícita |
| Sessão de inventário físico formal | Ausente; piloto usa motivo de ajuste — missão futura se exigido |

**Exceção já em ADR-007:** `importar_nfe_transacao` (inventory/compras-led) pode INSERT/UPDATE `produtos` e `preco_custo` — writer lateral permitido pelo entity-ssot; **não** transfere o dono do catálogo para inventory.

**Pasta alvo futura** (só após missão de scaffold): `@fastproduct/shared-core/src/inventory/` — layout do [template](../architecture/template_dominio_internacionalizado.md). Policies futuras validam ajuste/transferência; **não** reimplementam baixa de venda.

---

### 2. Fonte de verdade

| Conceito | Fonte de verdade | Não é fonte de verdade |
|----------|------------------|------------------------|
| **Saldo** | Tabela `estoque` (Postgres) | Cache de UI, estado React, listagens desnormalizadas, KPIs em memória |
| **Histórico / kardex** | Tabela `movimentos_estoque_log` (append via RPC) | Sheet kardex (últimos N), views só para leitura, reconstruções ad hoc |
| **Disponibilidade** | `estoque.quantidade_atual` (e RPCs de leitura derivadas) | Carrinho PDV, flags de tela, “estoque calculado” por relatório |

**Norma:** nenhum cache, componente UI ou agregação de app pode ser tratado como SSoT de saldo ou histórico. Adapters **leem** Postgres (ou RPC) e **escrevem** só via RPCs canônicas.

Autoridade de mutação:

| Camada | Papel |
|--------|--------|
| RPCs Postgres (`ajustar_estoque_manual`, `decrementar_estoque_seguro`, `transferir_estoque_seguro`, `confirmar_remessa_entrada`, `importar_nfe_transacao`, efeitos nas TX de venda/cancel) | **Única autoridade** de alteração de saldo e append de movimento |
| App / Server Actions | Borda: auth, validação de input, chamada RPC, i18n de codes |
| `shared-core/inventory` (futuro) | Contratos, types, policies de validação — **não** segundo motor de saldo |

---

### 3. Escrita por domínio

| Domínio | Papel na escrita de estoque |
|---------|------------------------------|
| **Sales** | **Solicita baixa** de estoque na finalização da venda (orquestrador `finalizar_venda_transacional_canonica_v4` → `decrementar_estoque_seguro`). Não dá UPDATE direto em `estoque` na app. |
| **Cancelamento / devolução** | **Solicita reversão** (reposição) via `cancelar_venda_transacional` / `devolver_ou_trocar_venda`. Sales-led; efeito inventory na mesma TX RPC. |
| **Inventory** | **Executa** alteração de saldo e append de movimento (ajuste, remessa, transferência, NF-e, e o efeito solicitado por sales dentro da RPC). Dono conceitual das tabelas `estoque` / `movimentos_estoque_log`. |
| **Products** | **Fornece identidade** do produto (`produto_id`). Não altera saldo contínuo. Estoque inicial só via orquestrador RPC 270 (products-led). |
| **Cash** | **Não escreve** nem lê estoque como dependência de regra. Cancel pode tocar `saldo_atual` (cash) e estoque (inventory) na mesma RPC — efeitos separados. |

```
Products ── produto_id ──► Inventory ── saldo / movs ──► (leitura) UI / Sales
                                ▲
                     solicita baixa / reversão
                              Sales
Cash ──//── sem aresta de escrita para estoque
```

---

### 4. Invariantes

| # | Invariante | Norma |
|---|------------|--------|
| I1 | **Toda alteração de saldo gera movimento** | Mutação canônica de `quantidade_atual` passa por RPC que appenda `movimentos_estoque_log` quando há delta ≠ 0 (venda desde mig. 127; ajuste; remessa; NF-e; transferência). Paths legados sem kardex (`garantirLinhaEstoque`) são dívida a eliminar — **não** padronizar. |
| I2 | **Estoque negativo é proibido** | Writers canônicos rejeitam (`ESTOQUE_INSUFICIENTE`, alvo de ajuste `< 0`, transferência sem saldo). |
| I3 | **Histórico não é apagado** | `movimentos_estoque_log` é append-only por desenho; venda `SAIDA_VENDA` imutável (mig. 127). Correções = novos movimentos / ajustes, não DELETE do passado. |
| I4 | **Produto e estoque são entidades separadas** | SKU = products; saldo = inventory. UI SSoT distintas (`/admin/catalogo` vs `/admin/estoque`). Pós-create, saldo só em inventory. |
| I5 | **Preço não pertence ao estoque** | Nem cadastro nem resolução de venda vivem em inventory. NF-e que atualiza `preco_custo` é orquestração lateral (ADR-007), não ownership de pricing. |

Invariantes auxiliares (já operacionais):

- Disponível sem reserva persistida (venda em espera **não** segura saldo).  
- Concorrência: `FOR UPDATE` + idempotência (`estoque_baixas`, reposições, chave NF-e, transferência).  
- Multi-loja: unique `(loja_id, produto_id)`.

---

### 5. Orquestrações (exceções documentadas — não god modules)

Orquestrações **cross-domínio** permanecem em RPC/adapters. Cada efeito continua no dono da tabela. **Proibido** transformar inventory (ou a app) em módulo dono de tudo.

| Orquestração | Domínios | Led por | Efeito inventory | Não faz |
|--------------|----------|---------|------------------|---------|
| **Venda** — `finalizar_venda_transacional_canonica_v4` | Sales + Inventory | **sales** | Baixa saldo + `SAIDA_VENDA` | Não escreve cash mov / catálogo |
| **Cancelamento** — `cancelar_venda_transacional` | Sales + Inventory (+ cash A) | **sales** | Reposição saldo + idempotência | Não redefine \(E(c)\) (cash) |
| **Devolução/troca** — `devolver_ou_trocar_venda` | Sales + Inventory (+ cash A) | **sales** | Reposição parcial/total | Idem |
| **Criar produto com estoque inicial** — `criar_produto_com_estoque_inicial` (RPC 270) | Products + Inventory | **products** | INSERT `estoque` (+ ajuste/kardex opcional) | App **não** reimplementa a TX em TS |
| **Import NF-e** — `importar_nfe_transacao` | Inventory (+ products lateral) | **inventory** | Entrada + kardex | Não vira dono do catálogo |

```
App (borda)
  → orquestrador RPC
       ├─ sales / products / cash: seus efeitos
       └─ inventory: saldo + movimentos (dono das tabelas)
```

Pós-create (RPC 270): qualquer alteração de saldo → **somente** `/admin/estoque/*`.

---

### 6. Regras de fronteira (resumo normativo)

1. Inventory escreve saldo e movimentos; products escreve catálogo; sales solicita baixa/reversão; cash independente do estoque.  
2. Fonte de verdade de saldo = `estoque`; de histórico = `movimentos_estoque_log` — nunca UI/cache.  
3. Alteração de quantidade na app = chamada a RPC canônica; proibido UPDATE/INSERT de quantidade “por conveniência”.  
4. Products **não** escreve `estoque` fora do orquestrador 270 (legado documentado a eliminar).  
5. Sales **não** altera estoque fora dos orquestradores de venda/cancel/devolver.  
6. Cash **não** importa regras de inventory.  
7. Exceção NF-e (create/update SKU) permanece lateral — ADR-007.  
8. Inventário físico formal: **não** entra no scaffold; piloto = motivo `ACERTO_INVENTARIO` até missão explícita (dívida D-I2).  
9. i18n: domínio emite **codes** (`ESTOQUE_INSUFICIENTE`, `AJUSTE_ESTOQUE_*`, …); borda resolve catálogo.  
10. Entity-ssot, ADR-005/006 e DEC-012 permanecem.

---

## Consequências

### Positivas

- Fronteira inventory/products/sales/cash inequívoca antes do scaffold.  
- Protege anti-fraude de estoque (lock + idempotência no Postgres) e entity-ssot `/admin/estoque`.  
- Evita que Inventory 2+ “puxem” preço, venda ou caixa para o core.  
- Alinha cancel: reposição de estoque ≠ estorno de \(E(c)\) / liquidez (ADR-CAIXA-002).

### Negativas / trade-offs

- Orquestradores cross-cut continuam no Postgres (aceitável; redesign TX fora de escopo).  
- Inventário físico formal e reservas ficam fora do contrato inicial.  
- Dual-layer `gerente/estoque` coexiste até facade/colocation.  
- Dívida D-I3 (INSERT sem kardex) permanece até missão de limpeza.

### Riscos se ignorado

- Products dono de estoque → viola ADR-007 e `/admin/estoque`.  
- Sales UPDATE direto → bypass de kardex/idempotência/concorrência.  
- Saldo só em cache ou “soma de vendas” → divergência operacional e perda de auditoria.  
- Inventory dono de preço/catálogo → segundo CRUD e drift com ADR-007.

---

## Alternativas rejeitadas

| Alternativa | Motivo da rejeição |
|-------------|-------------------|
| **Products dono de estoque** (saldo/ajustes no domínio products) | Viola ADR-005, ADR-007 e entity-ssot (`/admin/estoque`); mistura catálogo com físico |
| **Sales alterando estoque diretamente** (UPDATE/`from('estoque')` na app) | Bypass de RPC, kardex, `FOR UPDATE` e idempotência; quebra invariantes I1–I2 |
| **Estoque calculado somente pela soma de vendas** (sem tabela `estoque`) | Ignora entradas, ajustes, transferências, NF-e; inviável operacionalmente; destrói kardex como auditoria |
| **Saldo mantido apenas em cache** (UI, Redis, estado local como SSoT) | Viola fonte de verdade Postgres; conflitos offline/sync já dependem do lock no banco |
| Extrair `shared-core/inventory` + Writer nesta missão | Fora do escopo Inventory 1; inventário/ADR primeiro (template) |
| Big-bang: inventário físico formal + scaffold + wire UI | Mistura fundação com feature (D-I2); missão dedicada |
| Inventory como god module da venda/caixa | Viola ADR-CAIXA-002 e separação sales/cash |

---

## Critérios para próxima fase

### Contracts futuros (nomes — **sem implementar** nesta missão)

| Contract / serviço | Responsabilidade | Autoridade real |
|--------------------|------------------|-----------------|
| **`InventoryReader`** | Ler saldo, mínimo, listagens, kardex, disponibilidade | SELECT / RPCs de leitura (`gerente_estoque_list_page`, etc.) |
| **`InventoryMovementWriter`** | Solicitar movimentos canônicos que sales/orquestradores já disparam (baixa/reposição) — porta de domínio, **não** UPDATE direto | RPCs de venda/cancel já existentes; adapter só encapsula |
| **`InventoryAdjustmentService`** | Ajuste manual, remessa, transferência, entrada NF-e (efeitos inventory) | `ajustar_estoque_manual`, `confirmar_remessa_entrada`, `transferir_estoque_seguro`, `importar_nfe_transacao` |

Policies auxiliares (futuras): validação de motivo/obs de ajuste, limites de transferência — **espelho de codes**, sem segundo motor de saldo.

### Ordem sugerida

```
Inventory 0  inventário + autoridade     ← feito
    ↓
Inventory 1  ADR-008 (este documento)    ← feito
    ↓
Inventory 2  types/contracts/policies/errorCodes (+ specs) — sem wire UI
    ↓
Inventory 3+ Reader → AdjustmentService (RPC) → i18n borda → wire admin
```

**Não** começar por modal de inventário físico nem por mover telas.

---

## Entregáveis vinculados

| Item | Status |
|------|--------|
| Inventory 0 — inventário | Feito |
| **ADR-008** (este documento) | Feito |
| Inventory 2 — scaffold `shared-core/src/inventory` (types/contracts/policies; sem wire) | Feito |
| Inventory 3+ — Reader → Adjustment → MovementWriter → i18n borda | Feito — [inventory_100_audit.md](../architecture/inventory_100_audit.md) |
| Limpeza D-I3 (`garantirLinhaEstoque`) | Pendente — P1; não bloqueia piloto |
| Inventário físico formal (D-I2) | Pendente — P2; piloto usa `ACERTO_INVENTARIO` |

---

## GO / NO-GO

| Critério | Status |
|----------|--------|
| Owns / não-owns de Inventory definidos | OK |
| Fonte de verdade: `estoque` / `movimentos_estoque_log` | OK |
| Escrita por domínio (sales solicita; inventory executa; products identidade) | OK |
| Invariantes I1–I5 registrados | OK |
| Orquestrações como exceções (não god module) | OK |
| Alternativas rejeitadas documentadas | OK |
| Contracts futuros nomeados sem implementação | OK |
| Criar código / `shared-core/inventory` / alterar RPC ou UI nesta missão | **NO-GO** |

| Decisão | Resultado |
|---------|-----------|
| Aceitar ADR-008 como fronteira oficial de Inventory | **GO** |
| Prosseguir Missão Inventory 2 (scaffold contratos no shared-core, sem wire) | **GO** (quando autorizar) |
| Fazer products dono de estoque ou sales UPDATE direto | **NO-GO** |
| Tratar cache/UI como SSoT de saldo | **NO-GO** |
| Misturar cash/financeiro no domínio inventory | **NO-GO** |

---

## Sign-off

| Papel | Decisão | Data |
|-------|---------|------|
| Eng | Fronteira Inventory + autoridade saldo/movimentos/ajustes | 2026-07-18 |

**Próximo passo:** Missão Inventory 2 — scaffold `@fastproduct/shared-core/src/inventory` (`types` / `contracts` / `policies` / `errorCodes`) com ports `InventoryReader`, `InventoryMovementWriter`, `InventoryAdjustmentService` — **sem** wire de UI e **sem** reimplementar baixa de venda em TypeScript.
