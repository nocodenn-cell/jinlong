# BL-2 — Decisão Arquitetural: Modelo de Promoção
**Data**: 2026-07-24  
**Status**: 🏛️ **REVISÃO ARQUITETURAL**  
**Autor**: Claude (claude-haiku-4-5-20251001)  
**Escopo**: Escolher entre Opção A (tipo_preco) vs Opção B (regra aplicada)

---

## Resumo Executivo

Duas abordagens arquiteturais existem para implementar promoções em BL-2. Cada uma tem trade-offs profundos em schema, RPC, PDV e auditoria.

**Recomendação Preliminar**: **Opção B** (regra aplicada sobre preço base) é superior em 6 de 8 critérios obrigatórios.

**Análise completa abaixo**. Decisão final requer aprovação técnica + negócio.

---

## 1. Duas Opções em Competição

### **OPÇÃO A: Promoção como Novo `tipo_preco='PROMOCAO'`**

**Arquitetura**:
```
Preço Base (VAREJO/ATACADO) → Aplicar Promoção → tipo_preco='PROMOCAO' → Inserir em itens_venda
```

**Exemplo**:
- Produto: Camiseta, preco_varejo=R$100, tipo_preco='VAREJO'
- Promo aplicada: -20%
- Resultado: preco_unitario=R$80, tipo_preco='PROMOCAO'

**Schema**:
- Novo tipo em CHECK constraint: `tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO')`
- Coluna opcional: `promo_regra_id` (FK → regras_preco)

**RPC**:
- `calcular_preco_produto` retorna VAREJO/ATACADO como sempre
- `buscar_promocoes_ativas` retorna regra
- Frontend/Backend aplica promo, insere tipo_preco='PROMOCAO'

---

### **OPÇÃO B: Promoção como Regra Aplicada Sobre Preço Base**

**Arquitetura**:
```
Preço Base (VAREJO/ATACADO) → Registrar qual regra foi aplicada → Inserir em itens_venda com regra_id
```

**Exemplo**:
- Produto: Camiseta, preco_varejo=R$100, tipo_preco='VAREJO'
- Promo aplicada: -20% via regra_id=xyz
- Resultado: preco_unitario=R$80, tipo_preco='VAREJO' (mantém original), regra_aplicada_id='xyz'

**Schema**:
- Sem mudança no CHECK (tipo_preco permanece VAREJO/ATACADO/MANUAL)
- Coluna: `regra_aplicada_id` (FK → regras_preco, nullable)
- Coluna: `desconto_regra_percentual` (snapshot do % aplicado)

**RPC**:
- `calcular_preco_produto` retorna VAREJO/ATACADO (não muda)
- `buscar_promocoes_ativas` retorna regra
- Frontend aplica desconto, envia preço + regra_id
- RPC revalida preço, insere com regra_id

---

## 2. Análise Contra Critérios Obrigatórios

### **Critério 1: Múltiplas Promoções Futuras**

**Cenário**: Mesma venda pode ter:
- Promoção categoria -15%
- Promoção produto -10% (mais específica)
- Promoção cliente VIP -5% (futuro)
- **Esperado**: Prioridade é categoria < produto < cliente (mais específica vence)

#### **Opção A (tipo_preco='PROMOCAO')**

❌ **Problema**: Se múltiplas regras se aplicam, qual vence?

```
Item: Samsung TV
  - Regra 1: Categoria ELETRÔNICOS -15%
  - Regra 2: Produto SAMSUNG-TV -20%
  - Regra 3: Cliente VIP -10%

Com tipo_preco='PROMOCAO', inserir qual em itens_venda?
- Se inserir Regra 1 (-15%): Regras 2 e 3 perdidas
- Se inserir Regra 2 (-20%): Regra 1 e 3 perdidas
- Se inserir Regra 3 (-10%): Perder contexto (não sabe que TV estava com -20%)
```

**Impacto**: Auditoria quebrada — não consegue rastrear TODAS as regras que se aplicavam.

**Solução potencial**: Armazenar array de regras? (complexo)

✅ **Mitigação em Opção A**: Adicionar coluna `regras_aplicadas_json` (array de regra_ids). Adiciona complexidade de schema.

#### **Opção B (regra_aplicada_id)**

✅ **Vantagem**: Naturalmente suporta "qual melhor regra venceu?"

```
Item: Samsung TV
  - regra_aplicada_id: Regra 2 (produto, -20%, melhor)
  - desconto_regra_percentual: 20

Histórico: Query `SELECT regra_aplicada_id, desconto_regra_percentual WHERE item_id=X`
Resposta: "Regra 2 (SAMSUNG-TV -20%) foi aplicada"
```

**Auditoria**: Limpa e simples — 1 regra por item.

**Escalabilidade futura**: Se quiser rastrear "todas as regras consideradas", adicionar coluna JSON separada (sem quebrar modelo base).

---

### **Critério 2: Prioridade Entre Promoção e Desconto Manual (BL-1)**

**Cenário**: Operador tenta dar desconto manual -15% em item que já tem promo -20%.

**Esperado**: Descontos acumulam? Qual vence? Há limite total (60%)?

#### **Opção A (tipo_preco='PROMOCAO')**

❌ **Problema**: Uma vez que tipo_preco='PROMOCAO' é inserido, como aplicar desconto manual?

```
itens_venda.tipo_preco='PROMOCAO' (preco=R$80)
↓
Operador quer desconto manual -15% adicional?
↓
Tipo muda para 'MANUAL'? (perde histórico de que era promo)
Ou: Desconto manual é aplicado "sobre promoção"? (precisa 2 colunas?)
```

**Consequência**: Schema fica confuso — `tipo_preco` não é mais "qual regra se aplicou", vira "qual foi o último desconto".

#### **Opção B (regra_aplicada_id)**

✅ **Simples**: tipo_preco permanece VAREJO/ATACADO (original), desconto é registrado como metadado.

```
itens_venda:
  - tipo_preco: 'VAREJO' (original, não muda)
  - regra_aplicada_id: regra_promo_xyz
  - desconto_regra_percentual: 20

Se operador aplica desconto manual -15% adicional:
  - preco_unitario é reduzido de R$80 → R$68
  - tipo_preco: 'MANUAL' (se foi aplicado desconto manual)
  - regra_aplicada_id: ainda regra_promo_xyz (não perde histórico)
```

**Rastreabilidade**: Sabe que promo -20% foi base, depois desconto manual -15% aplicado.

---

### **Critério 3: Auditoria Completa ("Por que este preço?")**

**Pergunta crítica**: 6 meses depois, auditor pergunta: "Por que este cliente pagou R$72 em um produto de R$100?"

**Esperado**: Resposta: "Promo -20% (regra X) + desconto manual -15% (autorizado gerente) + sem desconto global."

#### **Opção A (tipo_preco='PROMOCAO')**

❌ **Problema**: tipo_preco='PROMOCAO' não diz qual regra foi aplicada.

```
SELECT tipo_preco FROM itens_venda WHERE id=xyz;
Resultado: 'PROMOCAO'

Auditor: "Qual promoção?"
Sistema: Sem coluna explícita (precisa JOIN com histórico ou guess)
```

**Solução**: Adicionar `promo_regra_id` (mesma que Opção B). Então qual é a vantagem do tipo_preco='PROMOCAO'?

#### **Opção B (regra_aplicada_id)**

✅ **Direto**: Coluna `regra_aplicada_id` aponta exatamente qual regra.

```
SELECT regra_aplicada_id, desconto_regra_percentual, tipo_preco 
FROM itens_venda WHERE id=xyz;

Resultado:
  regra_aplicada_id: 'xyz-promo-black-friday'
  desconto_regra_percentual: 20
  tipo_preco: 'VAREJO'

Auditor: "Qual promoção?"
Sistema: "Black Friday -20% (consultar regras_preco.id='xyz-promo-...')"
```

**Rastreabilidade**: 100% clara, sem guesswork.

---

### **Critério 4: Histórico de Vendas**

**Cenário**: Promoção "Black Friday -50%" foi usada em 10K vendas. Depois, regra é deletada/modificada.

**Esperado**: Relatório "Quantas vendas tiveram Black Friday?" deve funcionar mesmo após delete.

#### **Opção A (tipo_preco='PROMOCAO')**

❌ **Problema**: Sem FK explícita para regra, não consegue rastrear qual regra foi usada.

```
SELECT COUNT(*) FROM itens_venda WHERE tipo_preco='PROMOCAO';
Resultado: 10K

Gerente: "Qual foi a promoção que gerou esses 10K?"
Sistema: "Não sabe" (só sabe que era promoção genérica)
```

**Solução**: Adicionar `promo_regra_id` e armazenar snapshot (mesma que Opção B).

#### **Opção B (regra_aplicada_id)**

✅ **Rastreável**: FK garante que sempre consegue identificar regra original.

```
SELECT COUNT(*) FROM itens_venda 
WHERE regra_aplicada_id = 'xyz-promo-black-friday';
Resultado: 10K (exatamente)

E se regra foi deletada?
ON DELETE SET NULL → regra_aplicada_id vira NULL (marcado como "regra deletada")

Auditoria: Sabe que 10K vendas tiveram alguma promoção, não consegue mais recuperar nome exato
(mas pode ter snapshot em coluna separada)
```

**Mitigação**: Adicionar coluna `desconto_regra_nome` (snapshot de regra.nome) para preservar histórico mesmo se regra for deletada.

---

### **Critério 5: Compatibilidade com `unifiedCartStore`**

**Cenário**: Frontend exibe carrinho com preços calculados. Precisa saber se promo foi aplicada.

#### **Opção A (tipo_preco='PROMOCAO')**

❌ **Problema**: `unifiedCartStore` já tem campo `resultado.tipoPreco`. Se mudar para 'PROMOCAO', outras partes do código quebram?

```typescript
// Hoje:
resultado?: {
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
}

// Se usar tipo_preco='PROMOCAO':
if (item.resultado.tipoPreco === 'PROMOCAO') {
  // Exibir "Promoção aplicada"
}

// Mas depois, em finalizar_venda, RPC recebe tipo_preco='PROMOCAO'
// RPC precisa validar: "é válido inserir tipo_preco='PROMOCAO'?"
// Adiciona lógica ao RPC que espelha lógica frontend
```

**Duplicação**: Frontend decide tipo_preco, RPC também valida tipo_preco. Duplica autoridade.

#### **Opção B (regra_aplicada_id)**

✅ **Separação de responsabilidade**: 

```typescript
// unifiedCartStore:
resultado?: {
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'  // Original, não muda
  regraAplicada?: {
    id: string
    nome: string
    desconto: number
  }
}

// Frontend sabe:
// - tipo_preco é a base (VAREJO/ATACADO/MANUAL)
// - regraAplicada é METADADO (qual promo foi aplicada)

// Ao finalizar, envia ambos
// RPC revalida regra, insere tipo_preco original + regra_id
```

**Clareza**: Tipo de preço é fato, aplicação de regra é adição.

---

### **Critério 6: SSOT no Backend**

**Regra**: Cálculo de preço acontece **apenas no RPC**, nunca duplicado em frontend.

#### **Opção A (tipo_preco='PROMOCAO')**

⚠️ **Risco**: Frontend poderia aplicar promo e inserir tipo_preco='PROMOCAO' sem RPC revalidação.

```typescript
// Frontend (perigoso):
if (promocaoAplicavel) {
  item.resultado.tipoPreco = 'PROMOCAO'  // ← Altera autoridade
  item.precoUnitario = novoPreco
}

// RPC recebe tipo_preco='PROMOCAO' e confia?
// Ou revalida? (duplica lógica)
```

**Mitigação**: RPC sempre revalida. Mas então tipo_preco='PROMOCAO' é apenas "hint" (não autoridade).

#### **Opção B (regra_aplicada_id)**

✅ **Garantia**: tipo_preco permanece VAREJO/ATACADO (autorizado pelo RPC inicialmente).

```typescript
// Frontend (seguro):
if (promocaoAplicavel) {
  item.resultado.regraAplicada = regra  // ← Apenas metadado
  item.precoUnitario = calculatedPrice  // ← Sugestão visual
}

// RPC recebe tipo_preco='VAREJO' + regra_id
// RPC revalida: "Esta regra ainda está ativa?"
// RPC recalcula preço (autoridade)
// RPC valida: preço enviado ≈ preço calculado (epsilon)
```

**SSOT preservado**: Tipo de preço permanece autoridade do RPC, frontend apenas sugere aplicação de regra.

---

### **Critério 7: Cálculo Centralizado em RPCs**

**Obrigação**: RPC é autoridade única de preço. Frontend não recalcula.

#### **Opção A (tipo_preco='PROMOCAO')**

⚠️ **Risco**: Se tipo_preco='PROMOCAO', RPC precisa saber qual regra foi aplicada.

```plpgsql
-- RPC finalizar_venda recebe:
p_tipo_preco = 'PROMOCAO'
p_preco_unitario = 80

-- Como revalidar?
-- - Buscar todas as regras? (custoso)
-- - Confiar que frontend fez certo? (perigoso)
-- - Armazenar promo_regra_id no tipo_preco? (complexo)
```

**Solução**: RPC precisa de informação adicional (regra_id) para validar. Volta ao modelo B.

#### **Opção B (regra_aplicada_id)**

✅ **Simples**: RPC recebe tipo_preco + regra_id.

```plpgsql
-- RPC finalizar_venda recebe:
p_tipo_preco = 'VAREJO'
p_preco_unitario = 80
p_regra_aplicada_id = 'xyz-promo'

-- RPC revalida:
1. Calcular preco_esperado via calcular_preco_produto(...) → R$100
2. Buscar regra xyz-promo, validar ativa
3. Aplicar regra: 100 - 20% = 80
4. Validar: preco_enviado ≈ preco_calculado
5. Inserir com regra_id
```

**Autoridade clara**: RPC faz cálculo completo, não confia em frontend.

---

### **Critério 8: Evolução Futura (Múltiplas Escalas de Desconto)**

**Cenário**: Negócio quer implementar "cupons" (desconto adicional) em 3 meses.

**Esperado**: Mesma arquitetura suporta cupom + promo (sem redesenho).

#### **Opção A (tipo_preco='PROMOCAO')**

❌ **Problema**: Nova tipo_preco para cupom? (tipo_preco='CUPOM'?)

```
tipos_preco atualmente: VAREJO, ATACADO, MANUAL, PROMOCAO
Adicionar: CUPOM? VOUCHER? PONTO-FIDELIDADE?

Schema fica:
tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO', 'CUPOM', 'VOUCHER', ...)

Cada novo tipo precisa:
- ALTER TABLE CHECK constraint
- Nova lógica em RPC
- Nova lógica em frontend
```

**Escalabilidade ruim**: Sistema cresce em tipo_preco (schema inflation).

#### **Opção B (regra_aplicada_id)**

✅ **Extensível**: Cupom é outra regra.

```
regras_preco.tipo_regra:
  - PRODUTO (promo)
  - CATEGORIA (promo)
  - CUPOM (novo)
  - VOUCHER (futuro)
  - CLIENTE-VIP (futuro)

itens_venda.regra_aplicada_id aponta a qual quer que seja.
tipo_preco permanece: VAREJO, ATACADO, MANUAL (não muda)

Novo tipo: Não precisa alterar CHECK constraint
```

**Escalabilidade boa**: Sistema cresce em tipos de regra (semântica), não em tipos de preço (schema).

---

## 3. Resumo Comparativo

| Critério | Opção A (tipo_preco) | Opção B (regra_aplicada_id) |
|----------|---------------------|---------------------------|
| **1. Múltiplas Promoções** | ❌ Quebra auditoria | ✅ Suporta naturalmente |
| **2. Prioridade Manual+Promo** | ❌ Confunde tipo_preco | ✅ Separação clara |
| **3. Auditoria ("Por quê?")** | ⚠️ Precisa coluna extra | ✅ Direto via FK |
| **4. Histórico de Vendas** | ⚠️ Precisa coluna extra | ✅ Rastreável |
| **5. unifiedCartStore** | ⚠️ Risco duplicação | ✅ Separação clara |
| **6. SSOT no Backend** | ⚠️ Risco frontend altera | ✅ Garantia forte |
| **7. Cálculo Centralizado RPC** | ⚠️ Precisa regra_id | ✅ Simples |
| **8. Evolução Futura** | ❌ Schema inflation | ✅ Extensível |

**Score**: Opção A: 1 ✅ / 7 ⚠️  | Opção B: 7 ✅ / 0 ⚠️

---

## 4. Impacto Detalhado de Cada Abordagem

### **OPÇÃO A: tipo_preco='PROMOCAO'**

#### **Impacto no Banco**

**Schema**:
```sql
-- Migration necessária:
ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_tipo_preco_check;
ALTER TABLE public.itens_venda ADD CONSTRAINT itens_venda_tipo_preco_check
  CHECK (tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'));

-- Colunas adicionais (necessárias para auditoria):
ALTER TABLE public.itens_venda ADD COLUMN promo_regra_id UUID REFERENCES public.regras_preco(id);
ALTER TABLE public.itens_venda ADD COLUMN desconto_regra_percentual NUMERIC(10,4);
```

**Indices**:
```sql
CREATE INDEX idx_itens_venda_promo ON itens_venda(tipo_preco, promo_regra_id) 
WHERE tipo_preco='PROMOCAO';
```

**Data Migration** (se vendas antigas existem):
```sql
-- Nenhuma (tipo_preco='PROMOCAO' é apenas futuro)
```

#### **Impacto nas RPCs**

**`calcular_preco_produto`**:
- Sem mudança (retorna VAREJO/ATACADO como sempre)

**`buscar_promocoes_ativas`**:
- Sem mudança (retorna regra_id)

**`finalizar_venda_transacional_canonica_v4`**:
```plpgsql
-- Adicionar validação:
IF NEW.tipo_preco = 'PROMOCAO' THEN
  -- Revalidar que regra ainda está ativa
  SELECT ativo, data_validade INTO v_regra_ativa, v_regra_validade
  FROM public.regras_preco WHERE id = NEW.promo_regra_id;
  
  IF NOT v_regra_ativa OR (v_regra_validade < now()) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_PROMOCAO_EXPIRADA';
  END IF;
END IF;
```

**Complexidade**: +30 linhas de lógica.

#### **Impacto no PDV**

**Frontend** (`unifiedCartStore`):
```typescript
// Novo tipo suportado
resultado.tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'

// Lógica necessária:
if (resultado.tipoPreco === 'PROMOCAO') {
  // Exibir ícone "🎉 Promoção"
  // Mas qual promo? (precisa regra_id)
}
```

**Admin UI**:
- Sem mudança (gerencia regras_preco como hoje)

**Operador UI**:
- Exibir "Promoção aplicada" (simples visual)

#### **Riscos**

| Risco | Severidade | Descrição |
|-------|-----------|-----------|
| **Duplicação de Auditoria** | 🔴 P0 | tipo_preco + promo_regra_id = 2 colunas redundantes |
| **Confusão tipo_preco** | 🟠 P1 | Tipo muda (VAREJO→PROMOCAO)? Desconto manual quebra rastreamento |
| **Complexidade de Query** | 🟠 P1 | Relatório "quais vendas tiveram promo?" precisa JOIN complexo |
| **Futuro: Cupom/Voucher** | 🟠 P1 | Cada novo tipo exige ALTER TABLE (schema churn) |
| **SSOT Duplicado** | 🟠 P1 | Frontend e RPC ambos determinam tipo_preco (conflito potencial) |

---

### **OPÇÃO B: regra_aplicada_id**

#### **Impacto no Banco**

**Schema**:
```sql
-- Sem ALTER TABLE CHECK (tipo_preco permanece igual)
-- Apenas ADD COLUMNS:
ALTER TABLE public.itens_venda 
  ADD COLUMN regra_aplicada_id UUID REFERENCES public.regras_preco(id) ON DELETE SET NULL,
  ADD COLUMN desconto_regra_percentual NUMERIC(10,4),
  ADD COLUMN desconto_regra_nome TEXT;  -- Snapshot para histórico
```

**Indices**:
```sql
CREATE INDEX idx_itens_venda_regra ON itens_venda(regra_aplicada_id)
WHERE regra_aplicada_id IS NOT NULL;

CREATE INDEX idx_regras_preco_ativas ON regras_preco(id)
WHERE ativo = true AND (data_validade IS NULL OR data_validade > now());
```

**Data Migration**:
```sql
-- Nenhuma (colunas novas, nullable)
```

**Backward Compatibility**:
- ✅ Vendas antigas têm regra_aplicada_id=NULL (marcadas como "sem regra")

#### **Impacto nas RPCs**

**`calcular_preco_produto`**:
- Sem mudança

**`buscar_promocoes_ativas`**:
- Sem mudança

**`finalizar_venda_transacional_canonica_v4`**:
```plpgsql
-- Adicionar parâmetro (opcional):
p_regra_aplicada_id UUID DEFAULT NULL

-- Validação:
IF p_regra_aplicada_id IS NOT NULL THEN
  -- Revalidar regra ativa
  SELECT ativo, data_validade, valor_desconto 
  INTO v_regra_ativa, v_regra_validade, v_regra_valor
  FROM public.regras_preco WHERE id = p_regra_aplicada_id;
  
  IF NOT v_regra_ativa OR (v_regra_validade < now()) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_REGRA_EXPIRADA';
  END IF;
  
  -- Recalcular preço esperado baseado em regra
  v_preco_esperado = v_preco_original - (v_preco_original * v_regra_valor / 100);
  IF ABS(v_preco_esperado - p_preco_unitario) > epsilon THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_PRECO_DIVERGENTE_REGRA';
  END IF;
END IF;

-- Inserir com regra_id
INSERT INTO public.itens_venda (..., regra_aplicada_id, desconto_regra_percentual) 
VALUES (..., p_regra_aplicada_id, ...);
```

**Complexidade**: +25 linhas de lógica (menos que A).

#### **Impacto no PDV**

**Frontend** (`unifiedCartStore`):
```typescript
// tipo_preco permanece como é
resultado.tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'

// Adicionar:
resultado.regraAplicada?: {
  id: string
  nome: string
  desconto: number
  tipo: 'PROMOCAO' | 'CUPOM' | 'VOUCHER'  // Futuro
}

// Lógica:
if (resultado.regraAplicada) {
  // Exibir "🎉 Promo: {regra.nome} (-{desconto}%)"
}
```

**Admin UI**:
- Sem mudança (gerencia regras_preco como hoje)

**Operador UI**:
- Exibir "Regra aplicada: {desconto}%"
- Se desconto manual adicional: exibir ambos (promo + manual)

#### **Riscos**

| Risco | Severidade | Descrição |
|-------|-----------|-----------|
| **Complexidade de Desconto Manual** | 🟡 P2 | Se operador aplica desconto manual + promo, ambos precisam coexistir no mesmo item |
| **Limite Desconto Total** | 🟡 P2 | RPC precisa validar (promo% + manual% ≤ 60%) |
| **Histórico Incompleto se Regra Deletada** | 🟡 P2 | regra_aplicada_id vira NULL se regra for DROP; coluna snapshot pode ajudar |
| **Múltiplas Regras Simultâneas** | 🟡 P2 | Se quer rastrear "todas as regras consideradas", precisa array JSON separado |

**Todos P2 (médio)** — não são bloqueadores, têm mitigações.

---

## 5. Recomendação Final

### 🎯 **Escolha: OPÇÃO B (regra_aplicada_id)**

**Justificativa**:

1. ✅ **SSOT Preservado**: tipo_preco permanece autoridade do RPC, regra é metadado
2. ✅ **Escalabilidade**: Novos tipos de regra (cupom, voucher) não quebram schema
3. ✅ **Auditoria Simples**: FK direto para qual regra foi aplicada
4. ✅ **Compatibilidade**: unifiedCartStore não precisa lógica duplicada
5. ✅ **Reversibilidade**: Se promo não funcionar, simples deletar coluna (dados preservados)
6. ✅ **Impacto Técnico**: +25 linhas RPC vs +30 (menos código)
7. ✅ **Negócio**: Rastreabilidade 100% (auditoria ama isto)

**Trade-off**:
- ⚠️ Mais complexidade no "desconto manual + promo" (precisa validar limite total)
- ⚠️ Necessário snapshot de nome da regra (em caso de delete futuro)

**Essas complexidades são aceitáveis** porque:
- Limite desconto já existe (BL-1), apenas estende
- Snapshot é optional (apenas para auditoria futura)

---

## 6. Arquitetura Recomendada (Opção B Detalhada)

### **Schema**

```sql
-- Migration 273: ADD colunas de auditoria de regra
ALTER TABLE public.itens_venda
  ADD COLUMN regra_aplicada_id UUID REFERENCES public.regras_preco(id) ON DELETE SET NULL,
  ADD COLUMN desconto_regra_percentual NUMERIC(10,4),
  ADD COLUMN desconto_regra_nome TEXT;  -- Snapshot (ex: "Black Friday -20%")

-- Índices para performance
CREATE INDEX idx_itens_venda_regra ON itens_venda(regra_aplicada_id)
WHERE regra_aplicada_id IS NOT NULL;
```

### **RPC Signature**

```plpgsql
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  -- ... params existentes (19 da v4 atual) ...
  p_regra_aplicada_id UUID DEFAULT NULL,  -- ← NOVO (opcional)
  -- Existing: p_motivo_desconto, p_motivo_descricao
)
RETURNS TABLE(...)
```

### **Validação em RPC**

```plpgsql
-- Se regra foi aplicada, revalidar
IF p_regra_aplicada_id IS NOT NULL THEN
  PERFORM public.validar_regra_ativa(p_regra_aplicada_id);
  -- Recalcular preço esperado
  PERFORM public.validar_preco_com_regra(p_regra_aplicada_id, p_preco_unitario);
END IF;

-- Inserir em itens_venda com rastreamento
INSERT INTO public.itens_venda (
  ..., regra_aplicada_id, desconto_regra_percentual, desconto_regra_nome
) VALUES (
  ..., p_regra_aplicada_id, 
  (SELECT valor_desconto FROM regras_preco WHERE id = p_regra_aplicada_id),
  (SELECT CONCAT(nome, ' -', valor_desconto, '%') FROM regras_preco WHERE id = p_regra_aplicada_id)
);
```

### **Frontend**

```typescript
// unifiedCartStore adiciona:
interface ItemCarrinho {
  // ... existing ...
  regraAplicada?: {
    id: string
    nome: string
    desconto: number
    tipo: 'PROMOCAO' | 'CUPOM'
  }
}

// Ao finalizar, enviar:
{
  tipo_preco: 'VAREJO',  // Original
  preco_unitario: 80,
  regra_aplicada_id: 'xyz-black-friday',  // Qual regra
  desconto_regra_percentual: 20  // Quantas % (snapshot)
}
```

---

## 7. Próximas Ações

### ✅ **Se Aprovado (Opção B)**

1. **Criar Migration 273**: ADD colunas + índices (10-15 linhas SQL)
2. **Atualizar RPC 274**: Adicionar validação de regra + inserção com regra_id (+25 linhas)
3. **Atualizar RPC 275**: Nova RPC `validar_regra_ativa` e `buscar_promocoes_ativas` (helpers)
4. **Implementar Frontend**: Integrar regraAplicada em unifiedCartStore
5. **E2E Tests**: 15+ testes incluindo "promo + desconto manual" + "prioridade"

### ❌ **Se Opção A Escolhida**

1. **Criar Migration 273**: ALTER TABLE CHECK + ADD promo_regra_id (15-20 linhas SQL)
2. **Criar Migration 274**: ADD desconto_regra_percentual + índices
3. **Atualizar RPC**: Adicionar lógica tipo_preco='PROMOCAO' + validação regra (+30 linhas)
4. **Implementar Frontend**: Suportar novo tipo_preco em unifiedCartStore + lógica duplicada
5. **E2E Tests**: Mesmos testes, mas com risco adicional de "qual tipo de preço?"

---

## 8. Cronograma

### **Opção B (Recomendado)**

| Fase | Duração | Ação |
|------|---------|------|
| **0** | 1 dia | Aprovação arquitetura |
| **1** | 2-3 dias | Migration 273 (schema) |
| **2** | 3-5 dias | RPC 274-275 (validação) |
| **3** | 1 semana | Frontend (unifiedCartStore) |
| **4** | 1 semana | E2E 15+ testes |
| **5** | 3-5 dias | Staging + Produção |

**Total**: 5-7 sprints (estimado)

---

## 9. Conclusão

**Opção B (regra_aplicada_id)** é arquitetura superior por:

1. ✅ Mantém SSOT no backend (tipo_preco = autoridade imutável)
2. ✅ Suporta múltiplas regras futuras sem schema churn
3. ✅ Auditoria completa e rastreável
4. ✅ Menos duplicação de lógica
5. ✅ Extensível (cupom, voucher, cliente VIP tudo como "regra")
6. ✅ Backward-compatible (colunas nullable)

**Impacto**: -5 linhas RPC vs Opção A, +auditoria clara, -schema-churn futuro.

---

**Recomendação**: ✅ Prosseguir com **Opção B** para todas as implementações subsequentes.

**Próxima ação**: Aprovação técnica (arquiteto) + aprovação negócio (critério de limite desconto total).

---

**Data**: 2026-07-24  
**Status**: 🏛️ Análise Arquitetural Completa  
**Decisão**: Pendente Aprovação Executiva  
**Autor**: Claude (claude-haiku-4-5-20251001)
