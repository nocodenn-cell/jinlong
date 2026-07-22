# ADR — Contrato financeiro do caixa pós-cancelamento / devolução / troca

| Campo | Valor |
|--------|--------|
| **ID** | ADR-CAIXA-002 |
| **Título** | Fonte de verdade do esperado em dinheiro e anti-double-count pós-estorno |
| **Status** | Aceito — implementado Missão 4.2.1 (mig. `20260718184800_adr_caixa_002_modelo_alpha_e_cancel`) |
| **Data** | 2026-07-18 |
| **Contexto** | Missão 4.2 NO-GO (`saldo_atual` vs esperado); mapa de autoridade do caixa; fórmula live `calcular_valor_sistema_dinheiro_caixa` |
| **Relacionados** | [`mapa_autoridade_caixa_20260718.md`](../../backend/artifacts/mapa_autoridade_caixa_20260718.md), [`impacto_venda_dinheiro_mov_caixa_20260718.md`](../../backend/artifacts/impacto_venda_dinheiro_mov_caixa_20260718.md), ADR-PDV-001 |

---

## Contexto

O fechamento de caixa e a conferência operacional usam:

\[
E(c) = VI(c) + V_{din}(c) + M(c) - D_{din}(c)
\]

onde (implementação live):

| Símbolo | Fonte | Filtro |
|---|---|---|
| \(VI\) | `caixas.valor_inicial` | caixa \(c\) |
| \(V_{din}\) | `vendas_pagamentos` (+ legado sem split) | venda `CONCLUIDA`, forma `DINHEIRO`, caixa \(c\) |
| \(M\) | `movimentacoes_caixa` (+ legado `movimentos_caixa`) | sangria/suprimento/estorno **aprovados** |
| \(D_{din}\) | `devolucoes` | forma `DINHEIRO`, venda do caixa \(c\) (**qualquer** status da venda) |

Escritores atuais relevantes:

| Evento | `vendas_pagamentos` | `vendas.status` | `devolucoes` | `saldo_atual` |
|---|---|---|---|---|
| Venda DINHEIRO | INSERT \(P\) | `CONCLUIDA` | — | **não** |
| Cancel total | **preserva** | → `CANCELADA` | INSERT (por forma / total) | \(-\) DINHEIRO |
| Devolução parcial | preserva | permanece `CONCLUIDA` | INSERT parcial | \(-\) se caixa ABERTO |
| Troca | preserva venda origem; venda substituta tem seus pagamentos | origem `CONCLUIDA` | INSERT estorno parcial | \(-\) no estorno DINHEIRO |

**Problema:** ao cancelar, a venda **sai** de \(V_{din}\) (status ≠ `CONCLUIDA`) **e** entra em \(D_{din}\) → \(\Delta E \approx -2P\) se \(P\) era o valor DINHEIRO. Isso viola o contrato intuitivo “cancelar devolve o dinheiro uma vez”.

Além disso, `caixas.saldo_atual` **não** é \(E(c)\); é contador físico atualizado por sangria/cancel/devolver, não pela venda (BUG-4.2-01).

---

## Decisão

### 1. Fonte de verdade do valor esperado \(E(c)\)

**Decisão:** a **função** `calcular_valor_sistema_dinheiro_caixa` é a API canônica de \(E(c)\) para fechamento.

A **fonte de verdade do componente “vendas em dinheiro ainda vigentes no turno”** é:

| Camada | Autoridade | Não é |
|---|---|---|
| Pagamentos da venda | **`vendas_pagamentos`** (C) | `saldo_atual`, `movimentacoes_caixa` |
| Estornos de liquidez pós-venda (parcial / total que ainda conta a venda) | **`devolucoes`** (onde a venda permanece `CONCLUIDA`) | apagar linhas de `vendas_pagamentos` |
| Sangria/suprimento | **`movimentacoes_caixa`** | venda |
| Contador físico da gaveta | **`caixas.saldo_atual`** (A) | esperado de fechamento |

**Regra:** fechamento e UI de “valor sistema” **sempre** leem \(E(c)\), nunca `saldo_atual` como proxy de esperado.

**Sign-off:** [x] Produto  [x] Eng — Missão 4.2.1

---

### 2. Como evitar double-count

#### 2.1 Regra de exclusão mútua (venda × devolução no esperado)

Para cada venda \(v\) do caixa, o efeito líquido em dinheiro no esperado deve contar **no máximo uma via de saída** além da entrada original:

Definir o **dinheiro líquido da venda no turno**:

\[
L(v) = P_{din}(v) - D_{din}(v)
\]

com \(P_{din}(v) = \sum\) `vendas_pagamentos` DINHEIRO da venda (histórico imutável),  
\(D_{din}(v) = \sum\) `devolucoes` DINHEIRO da venda.

No agregado do caixa, **escolher um dos modelos abaixo** (são matematicamente equivalentes se bem aplicados):

##### Modelo α — Status-gated (recomendado para cancel total)

\[
V_{din}(c) = \sum_{\substack{v \in c \\ status(v)=CONCLUIDA}} P_{din}(v)
\]

\[
D_{din}^{esp}(c) = \sum_{\substack{d \\ venda(d)\in c \\ forma=DINHEIRO \\ status(venda)=CONCLUIDA}} d.valor
\]

Ou seja: **devoluções só entram em \(E\) se a venda ainda está `CONCLUIDA`**.  
Cancel total: status → `CANCELADA` ⇒ \(P\) some de \(V_{din}\) e \(D\) **não** entra em \(E\) ⇒ \(\Delta E = -P\) (uma vez).

##### Modelo β — Ledger líquido (alternativo)

Manter vendas CANCELADA fora de \(V_{din}\) **e** não gravar `devolucoes` no cancel total (só auditoria em `vendas_canceladas_auditoria`).  
Devolução parcial continua gravando `devolucoes` com venda `CONCLUIDA`.

##### Modelo γ — Proibido

Contar \(V_{din}\) só `CONCLUIDA` **e** somar **todas** as `devolucoes` (estado live atual) → double-count no cancel.

**Decisão deste ADR:** adotar **Modelo α** na fórmula de \(E(c)\).  
Writers de cancel podem continuar inserindo `devolucoes` para auditoria/histórico; a fórmula **ignora** devoluções de vendas não `CONCLUIDA`.

**Sign-off:** [ ] Produto  [ ] Eng

#### 2.2 Regra venda × movimentação de caixa

Se no futuro a venda DINHEIRO gerar linha em `movimentacoes_caixa`:

- **Ou** \(E\) soma \(P_{din}\) e **exclui** tipo `entrada_venda` de \(M\),
- **Ou** \(E\) soma a mov e **deixa de** somar \(P_{din}\),

nunca ambos. Preferência: **manter \(P_{din}\) como componente de vendas**; movs só sangria/suprimento/estorno de sangria.

#### 2.3 Regra `saldo_atual` ≠ esperado

Atualizar `saldo_atual` na venda/cancel **não** altera a definição de \(E\).  
A e \(E\) podem convergir numericamente após alinhamento operacional, mas **não** se tornam a mesma autoridade.

---

## Contrato matemático por evento (alvo)

Notação para uma venda com pagamento DINHEIRO \(P > 0\) (split: só a parcela DINHEIRO).  
\(E_0\) = esperado imediatamente antes do evento.  
Arredondamento: ABNT/2 casas como nas RPCs.

### 1) Venda dinheiro (integral ou parcela)

| Artefato | Δ |
|---|---|
| `vendas_pagamentos` | \(+P\) (histórico) |
| `vendas.status` | `CONCLUIDA` |
| \(V_{din}\) | \(+P\) |
| \(D_{din}^{esp}\) | 0 |
| \(E\) | \(E_0 + P\) |
| `saldo_atual` (alvo operacional Missão 4) | \(+P\) *(fora do escopo de fórmula E; ver ADR de liquidez)* |

**Invariante:** \(L(v) = P\) logo após a venda.

### 2) Cancelamento total

| Artefato | Δ |
|---|---|
| `vendas_pagamentos` | **imutável** (não apagar) |
| `vendas.status` | → `CANCELADA` |
| `devolucoes` | pode inserir (auditoria); **não** entra em \(D_{din}^{esp}\) (Modelo α) |
| \(V_{din}\) | \(-P\) |
| \(E\) | \(E_0 - P\) |
| `saldo_atual` | \(-P\) (se caixa aberto / regra atual) |

**Invariante:** \(L_{esp}(v) = 0\) no esperado (venda não contribui).  
**Proibido:** \(\Delta E = -2P\).

### 3) Devolução parcial (venda permanece `CONCLUIDA`)

Seja \(R\) o valor DINHEIRO devolvido, \(0 < R \le P - D_{já}\).

| Artefato | Δ |
|---|---|
| `vendas_pagamentos` | imutável |
| `vendas.status` | `CONCLUIDA` |
| `devolucoes` | \(+R\) |
| \(V_{din}\) | 0 (ainda conta \(P\)) |
| \(D_{din}^{esp}\) | \(+R\) |
| \(E\) | \(E_0 - R\) |
| `saldo_atual` | \(-R\) se caixa ABERTO (comportamento atual) |

**Invariante:** \(0 \le L(v) = P - D_{din}(v) \le P\).  
Soma de devoluções DINHEIRO da venda \(\le P_{din}(v)\).

### 4) Troca

Troca = **devolução parcial/total da origem** + **venda substituta** (nova `CONCLUIDA` com seus pagamentos).

| Componente | Efeito em \(E\) |
|---|---|
| Estorno DINHEIRO da origem \(R\) | \(-R\) via Modelo α (venda origem ainda `CONCLUIDA` + `devolucoes`) |
| Pagamento DINHEIRO da substituta \(P'\) | \(+P'\) via \(V_{din}\) |
| Líquido | \(E_0 - R + P'\) |

**Invariante:** origem e substituta são vendas distintas; não apagar pagamentos de nenhuma.  
Se a troca for “mesmo valor”, \(P' \approx R\) ⇒ \(\Delta E \approx 0\) (ignorando arredondamento).

### 5) PIX / cartão

Não entram em \(V_{din}\) nem em \(D_{din}^{esp}\) (esperado é **só espécie**).  
Cancel/devolver dessas formas: \(E\) inalterado por liquidez de gaveta; auditoria/devolucao por forma permanece para outros fins.

---

## Decisões formais

### D1 — Fonte de verdade do esperado

**Decisão:** \(E(c)\) é definido exclusivamente por `calcular_valor_sistema_dinheiro_caixa`.

Componentes:

| Componente | Tabela / origem SSoT |
|---|---|
| Abertura | `caixas.valor_inicial` |
| Vendas dinheiro vigentes | **`vendas_pagamentos`** filtrado por venda `CONCLUIDA` (+ legado sem split) |
| Sangria/suprimento | `movimentacoes_caixa` (+ legado) |
| Estornos com venda ainda vigente | **`devolucoes` DINHEIRO** **somente** se `vendas.status = 'CONCLUIDA'` (**Modelo α**) |

**Não são fonte de \(E\):** `saldo_atual`, apagar `vendas_pagamentos`, painel `/admin/financeiro`.

**Sign-off:** [ ] Produto  [ ] Eng

### D2 — Anti-double-count (Modelo α)

**Decisão:** na fórmula de \(E\), restringir o CTE de devoluções a vendas `CONCLUIDA`.

Equivalência alvo por evento:

| Evento | \(\Delta E\) alvo |
|---|---|
| Venda \(P\) | \(+P\) |
| Cancel total | \(-P\) |
| Devolução parcial \(R\) | \(-R\) |
| Troca \(R\) + venda \(P'\) | \(-R + P'\) |

**Proibido (Modelo γ — estado live atual no cancel):**  
venda sai de \(V_{din}\) **e** \(D_{din}\) soma o mesmo \(P\) sem filtro de status.

**Sign-off:** [ ] Produto  [ ] Eng

### D3 — Histórico imutável de pagamentos

**Decisão:** cancel/devolver/troca **nunca** DELETE/UPDATE o valor histórico em `vendas_pagamentos`.  
Estado “ainda conta no esperado” é dado por `vendas.status` + `devolucoes` (Modelo α), não por reescrita do pagamento.

**Sign-off:** [ ] Produto  [ ] Eng

### D4 — Separação esperado × liquidez física

**Decisão:** `saldo_atual` permanece autoridade de **gaveta física (A)**; \(E\) é autoridade de **conferência de fechamento (B)**.  
Alinhar A na venda (Missão 4 / path liquidez) é decisão **paralela**, não redefine \(E\).

**Sign-off:** [ ] Produto  [ ] Eng

---

## Invariantes (sempre verdadeiros)

Sejam \(c\) um caixa, \(v\) uma venda de \(c\), \(P_{din}(v)\) a soma de pagamentos DINHEIRO de \(v\), \(D_{din}(v)\) a soma de devoluções DINHEIRO de \(v\).

1. **I-HIST:** \(P_{din}(v)\) é monotônico não-decrescente após a finalização (só INSERT na criação; sem delete).  
2. **I-DEV-BOUND:** \(D_{din}(v) \le P_{din}(v)\) (nunca devolver mais dinheiro do que foi pago em dinheiro).  
3. **I-LIQ-ESP:** contribuição líquida de \(v\) em \(E\) é  
   - \(P_{din}(v) - D_{din}(v)\) se `status = CONCLUIDA`,  
   - \(0\) se `status = CANCELADA` (Modelo α).  
4. **I-CANCEL-ONCE:** cancel total ⇒ \(\Delta E = -P_{din}(v)\) (não \(-2P\)).  
5. **I-PARCIAL:** devolução parcial mantém `CONCLUIDA` e \(\Delta E = -R\).  
6. **I-TROCA:** troca = estorno na origem \(+\) pagamentos na substituta; \(\Delta E = -R + P'\).  
7. **I-MOV-XOR-VENDA:** \(M(c)\) não inclui efeito de venda DINHEIRO enquanto \(V_{din}\) existir (anti-double-count path C).  
8. **I-ESPECIE:** PIX/cartão não alteram \(E(c)\).  
9. **I-FECHAMENTO:** `fechar_caixa_*` usa \(E(c)\), não `saldo_atual`.  
10. **I-AUDITORIA:** cancel/devolver deixam trilha (`vendas_canceladas_auditoria` / `venda_eventos` / `devolucoes` / operação pós-venda) mesmo quando o termo não entra em \(E\).

---

## Decisão (aceite)

| ID | Decisão | Status |
|---|---|---|
| D1 | SSoT de esperado = RPC \(E(c)\); componente vendas = `vendas_pagamentos` + status | Proposto |
| D2 | Anti-double-count = **Modelo α** (devoluções no \(E\) só com venda `CONCLUIDA`) | Proposto |
| D3 | Pagamentos imutáveis; cancel não apaga histórico | Proposto |
| D4 | `saldo_atual` ≠ \(E\); alinhamento de A é ADR/missão à parte | Proposto |

**Sign-off produto:** _____________ data: _______  
**Sign-off eng:** _____________ data: _______

---

## Consequências

### Positivas

- Cancel total fica \(\Delta E = -P\) sem exigir apagar `devolucoes` de auditoria.  
- Devolução parcial e troca permanecem naturais (\(D\) com venda vigente).  
- Fecha o gap matemático da Missão 4.2 no eixo **esperado** (independente do fix de `saldo_atual`).

### Negativas / trabalho

- Migration obrigatória em `calcular_valor_sistema_dinheiro_caixa` (filtro status em `dev_din`).  
- Retestes: 4.1, 4.2, 4.3; caso cancel + devolucao legada; fechamento com histórico misto.  
- Relatórios que somam `devolucoes` “cruas” precisam o mesmo filtro ou documentar que é auditoria, não esperado.

### Fora de escopo deste ADR

- Implementação do incremento de `saldo_atual` na venda (liquidez A / BUG-4.2-01).  
- Introduzir tipo `entrada_venda` em `movimentacoes_caixa`.

---

## Contrato-alvo (resumo numérico)

| Evento | \(\Delta E\) | Notas |
|---|---|---|
| Venda DINHEIRO \(P\) | \(+P\) | via \(V_{din}\) |
| Cancel total | \(-P\) | via status; \(D\) ignorado no \(E\) |
| Devolução parcial \(R\) | \(-R\) | via \(D\) com `CONCLUIDA` |
| Troca \(R, P'\) | \(-R+P'\) | origem + substituta |
| **Proibido** cancel | \(-2P\) | estado live atual (Modelo γ) |

---

## Status e próximos passos

- [ ] Sign-off D1–D2 (fórmula Modelo α)  
- [ ] Implementar filtro em `calcular_valor_sistema_dinheiro_caixa` *(após aceite — outro ticket)*  
- [ ] Ops Missão 4.2 medir \(\Delta E\) no cancel  
- [ ] ADR de liquidez A (`saldo_atual` na venda) em paralelo  

**Decisão final (após sign-off):** _[Modelo α confirmado / alternativa β]_
