# BL-2 — Modelo Final Aprovado: Promoção como Regra Aplicada
**Data**: 2026-07-24
**Status**: ✅ **DECISÃO ARQUITETURAL APROVADA (com ajustes de desenho)**
**Autor**: Claude (claude-sonnet-5)
**Substitui**: Seções de schema de `BL2_ANALISE_INICIAL.md` e `BL2_PLANO_IMPLEMENTACAO.md` (ver §6 — Correções)

---

## 0. Decisão Registrada

> **Aprovado**: Promoção é uma **regra aplicada sobre um preço base já calculado pelo SSOT**, nunca um novo `tipo_preco`.
> `tipo_preco='PROMOCAO'` **não será criado** em nenhuma migration.
> Autoridade de cálculo permanece 100% no backend (RPC).

Este documento fecha a fase de desenho. **Migration 273 só deve ser criada após aprovação deste documento.**

---

## 1. Auditoria da Entidade `regras_preco`

### 1.1 A Tabela Existe? Sim — Desde a Migration Inicial

`regras_preco` foi criada em `backend/supabase/migrations/001_schema_inicial.sql:142-178` e **evoluiu em 6 migrations subsequentes**. Não é uma tabela nova para BL-2 — já está em produção, com RLS, índices e triggers de proteção de margem.

### 1.2 Estrutura Atual (Real, Consolidada)

| Coluna | Tipo | Constraint | Origem | Observação |
|--------|------|-----------|--------|------------|
| `id` | uuid | PK, default `gen_random_uuid()` | 001 | |
| `tipo_regra` | text | `CHECK IN ('PRODUTO','CATEGORIA')` | 001 | Não inclui `CLIENTE` (ver §1.4) |
| `produto_id` | uuid | FK → `produtos(id)`, nullable | 001 | |
| `categoria_id` | uuid | FK → `categorias(id)`, nullable | 001 | |
| `quantidade_minima` | numeric(10,3) | `CHECK > 0`, NOT NULL | 001 | |
| `quantidade_maxima` | numeric(10,3) | `CHECK > quantidade_minima`, nullable | 001 | |
| `tipo_desconto` | text | `CHECK IN ('PERCENTUAL','VALOR_FIXO')` | 001 | |
| `valor_desconto` | numeric(10,4) | `CHECK > 0`, NOT NULL | 001 | |
| `data_validade` | timestamptz | nullable (sem expiração se NULL) | 001 | |
| `ativo` | boolean | NOT NULL DEFAULT true | 001 | |
| `created_by` | uuid | FK → `usuarios(id)` | 001 | |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 001 | |
| `permitir_abaixo_custo` | boolean | NOT NULL DEFAULT false | **124** | Override de margem negativa |
| ~~`nome`~~ | — | **NÃO EXISTE** | — | ❌ Gap identificado (ver §1.5) |

**Constraint de integridade** (`001:156-159`):
```sql
CONSTRAINT regra_tem_alvo CHECK (
  (produto_id IS NOT NULL AND categoria_id IS NULL) OR
  (produto_id IS NULL AND categoria_id IS NOT NULL)
)
```
Exatamente um alvo (produto **ou** categoria), nunca ambos, nunca nenhum.

### 1.3 Proteções Já Implementadas (Guards de Margem — Migrations 124/126)

Isto **não estava no BL2_ANALISE_INICIAL.md original** e é crítico: `regras_preco` já tem um **trigger de proteção de margem no momento do CADASTRO**:

```
trg_regras_preco_margem_bi   (BEFORE INSERT)
trg_regras_preco_margem_bu   (BEFORE UPDATE, quando tipo_desconto/valor_desconto/produto_id/permitir_abaixo_custo mudam)
```

Função `trg_fn_regras_preco_margem()` (`124:41-90`):
- Se `permitir_abaixo_custo = true` → libera (override explícito, ex.: liquidação)
- Se `produto_id IS NULL` (regra de categoria) → **não valida** (sem custo único comparável)
- Caso contrário: calcula preço efetivo (`VALOR_FIXO` = `valor_desconto`; `PERCENTUAL` = `varejo * (1 - pct/100)`) e **bloqueia INSERT/UPDATE se preço efetivo < preco_custo**

**Implicação para BL-2**: o piso de custo (P0-03 da matriz de riscos anterior, item "preço abaixo do custo") **já é validado na criação da regra**, não precisa ser revalidado por item na hora da venda (redundante). O que falta validar na venda é apenas: *a regra ainda está ativa e dentro da validade* — não o piso de margem.

### 1.4 Relacionamento com Produtos / Categorias / Clientes

| Relação | Suportada Hoje? | Detalhe |
|---------|----------------|---------|
| **Produto** | ✅ Sim | `produto_id` FK direta, 1:N (várias regras podem mirar o mesmo produto em janelas de tempo/quantidade diferentes) |
| **Categoria** | ✅ Sim | `categoria_id` FK direta, `categorias.categoria_pai_id` existe (hierarquia), mas `regras_preco` **não propaga para subcategorias** — regra em categoria pai não atinge produtos de categoria filha automaticamente |
| **Cliente** | ❌ **Não existe** | Sem `cliente_id`. Tabela `clientes` existe no sistema (migrations 035, 111, 112, 244/253) mas `regras_preco` não tem qualquer vínculo com ela |

**Gap explícito**: promoção "cliente VIP -10%" **não é suportada pelo schema atual**. Fica **fora do escopo de BL-2** (não solicitado nos critérios desta revisão) — registrado aqui como extensão futura, não como bloqueador.

### 1.5 Campos Necessários Ausentes

| Campo Faltante | Por Quê É Necessário | Prioridade |
|----------------|----------------------|-----------|
| `nome` (text, nullable) | Auditoria histórica exige "nome snapshot" (pedido do usuário, §4). Hoje não há como identificar humanamente uma regra ("Black Friday 2026" vs "regra id=xyz"). Sem isto, o snapshot de nome fica vazio ou sintético. | **Obrigatório para BL-2** |

**Todo o resto da estrutura já está pronta.** Nenhuma outra coluna em `regras_preco` precisa mudar.

### 1.6 RLS e Índices (Já Adequados)

- **RLS SELECT**: qualquer `authenticated` lê regras (`001:167-169`, atualizado initplan-safe em `224:618-619`)
- **RLS ALL (write)**: apenas `GERENTE`, `DONO`, `ADMIN` (`044:32-40`, initplan-safe em `224:613-616`)
- **Índices**: `idx_regras_produto` e `idx_regras_categoria` (parciais, `WHERE ativo = true`, `001:162-163`) + `idx_regras_preco_created_by` (`223:51`)

Nenhuma mudança de RLS ou índice é necessária para BL-2 no nível MVP.

---

## 2. Definição de Autoridade — RPC Decide, Frontend Nunca Decide

### 2.1 Princípio

O frontend **não escolhe qual promoção se aplica**. Ele pode, no máximo, **exibir uma sugestão visual** (para UX responsiva antes do round-trip), mas a **RPC recalcula do zero e é o único veredito aceito**.

Isto já é o padrão do sistema: `finalizar_venda_transacional_canonica_v4` (migration 272, linhas 216-228) já recalcula VAREJO/ATACADO via `calcular_preco_produto()` e rejeita com `FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE` se o frontend enviar algo diferente. BL-2 estende exatamente esse padrão para promoção — **não inventa um novo**.

### 2.2 Nova RPC: `calcular_promocao_aplicavel`

```sql
CREATE OR REPLACE FUNCTION public.calcular_promocao_aplicavel(
  p_produto_id uuid,
  p_categoria_id uuid,
  p_quantidade numeric,
  p_data_referencia timestamptz DEFAULT now()
)
RETURNS TABLE(
  regra_id uuid,
  tipo_regra text,
  tipo_desconto text,
  valor_desconto numeric,
  desconto_percentual_equivalente numeric   -- normalizado, ver §2.4
)
LANGUAGE sql
STABLE
SECURITY INVOKER   -- RLS já permite SELECT a qualquer authenticated; não precisa DEFINER
SET search_path = public
AS $function$
  SELECT
    rp.id,
    rp.tipo_regra,
    rp.tipo_desconto,
    rp.valor_desconto,
    CASE
      WHEN rp.tipo_desconto = 'PERCENTUAL' THEN rp.valor_desconto
      -- VALOR_FIXO normalizado para % só é possível com preço base; resolvido no chamador (RPC de venda)
      ELSE NULL
    END
  FROM public.regras_preco rp
  WHERE rp.ativo = true
    AND (rp.data_validade IS NULL OR rp.data_validade > p_data_referencia)
    AND p_quantidade >= rp.quantidade_minima
    AND (rp.quantidade_maxima IS NULL OR p_quantidade <= rp.quantidade_maxima)
    AND (
      (rp.tipo_regra = 'PRODUTO'   AND rp.produto_id   = p_produto_id)
      OR
      (rp.tipo_regra = 'CATEGORIA' AND rp.categoria_id = p_categoria_id)
    )
  ORDER BY
    -- Precedência: PRODUTO sempre vence CATEGORIA (mais específico)
    CASE rp.tipo_regra WHEN 'PRODUTO' THEN 0 ELSE 1 END ASC,
    -- Dentro do mesmo tipo, maior quantidade_minima vence (regra mais específica de faixa)
    rp.quantidade_minima DESC,
    -- Tie-break final: regra mais recente vence
    rp.created_at DESC
  LIMIT 1;
$function$;
```

**Uso interno**: chamada **dentro** de `finalizar_venda_transacional_canonica_v4`, nunca exposta como decisão isolada que o frontend possa "confiar cegamente" — o frontend pode chamá-la para exibir preview, mas o resultado usado na venda é sempre recalculado dentro da própria transação de finalização.

### 2.3 Fluxo de Autoridade Completo

```
1. Frontend adiciona item ao carrinho
   → calcularPrecoCanonico() [TS] ou RPC calcular_preco_produto() → preço base (VAREJO/ATACADO)
   → (opcional, só para exibição) chama calcular_promocao_aplicavel() → sugestão visual

2. Operador finaliza venda
   → Frontend envia: produto_id, quantidade, preco_unitario (sugerido), tipo_preco (VAREJO/ATACADO/MANUAL — NUNCA 'PROMOCAO')

3. RPC finalizar_venda_transacional_canonica_v4 (autoridade única):
   a. Recalcula preço base via calcular_preco_produto()        [já existe, migration 250/272]
   b. Recalcula promoção vencedora via calcular_promocao_aplicavel() [NOVO]
   c. Aplica desconto de promoção sobre preço base              [NOVO]
   d. Compara preço final esperado vs preco_unitario enviado (epsilon)
   e. Se divergente → RAISE EXCEPTION (mesmo padrão do preço VAREJO/ATACADO hoje)
   f. Insere em itens_venda com snapshot de auditoria (§4)
```

**Garantia de SSOT**: em nenhum ponto o frontend "decide" — ele no máximo antecipa visualmente o que a RPC vai calcular. Se a antecipação estiver errada (regra expirou, foi desativada, mudou), a RPC corrige e o cliente vê o preço final apenas após a resposta da RPC (igual ao comportamento já existente para VAREJO/ATACADO desde 2026).

### 2.4 Nota Técnica: Normalização de `VALOR_FIXO`

`regras_preco.tipo_desconto` pode ser `PERCENTUAL` ou `VALOR_FIXO`. Para snapshot de auditoria (§4) pedir "percentual aplicado" de forma uniforme, a RPC de venda (não a função de leitura pura) calcula:

```
percentual_equivalente = ROUND((preco_base - preco_apos_promo) / preco_base * 100, 4)
```

Isso é resolvido **dentro de** `finalizar_venda_transacional_canonica_v4`, porque só ali o preço base concreto do item está disponível — a função `calcular_promocao_aplicavel` não tem acesso a `preco_base` (não é sua responsabilidade calcular preço, só encontrar a regra vencedora).

---

## 3. Precedência Comercial

### 3.1 Ordem Aprovada (Conforme Solicitado)

```
Preço Base (VAREJO/ATACADO)
    ↓
Promoção (regra vencedora, se houver)
    ↓
Desconto Manual (operador, item a item)
    ↓
Desconto de Gerente Global (BL-1, sobre total da venda)
    ↓
Limite Final (validação de teto agregado)
```

### 3.2 Achado Crítico: Trigger de Limite de 15% Já Existe e Precisa Ajuste

Este ponto **não estava em nenhum documento anterior** e é essencial para a precedência funcionar corretamente.

`trg_fn_itens_venda_limite_desconto()` (migration 122, linhas 37-90) **já roda em todo INSERT/UPDATE de `itens_venda`** e:

- Bloqueia desconto por item **acima de `max_desconto_manual_item_percentual`** (padrão 15%)
- Calcula o percentual como `(preco_unitario_original - preco_unitario) / preco_unitario_original * 100`
- **Só isenta** `tipo_preco = 'ATACADO'` ou sessão com `gerente_token_validado = true`

**Problema**: sob o modelo aprovado (Opção B), `tipo_preco` de um item com promoção continua `VAREJO` (nunca muda). Se uma promoção de -30% for aplicada, o trigger vai **calcular 30% de desconto sobre `preco_unitario_original`** e **rejeitar a venda** (`DESCONTO_MANUAL_EXCESSIVO`), porque não tem como saber que os 30% vieram de uma regra pré-autorizada por GERENTE/DONO/ADMIN, e não de manipulação livre do operador.

**Isto aconteceria com QUALQUER promoção acima de 15%, independentemente de Opção A ou B** — não é um problema introduzido pela escolha de modelo, é um gap pré-existente que fica exposto assim que promoção passa a existir de verdade.

### 3.3 Correção Necessária no Trigger (Parte da Migration 273)

O trigger precisa distinguir **desconto de promoção** (pré-autorizado, como ATACADO) de **desconto manual real** (que o operador decide sozinho). Proposta:

```sql
-- Ajuste em trg_fn_itens_venda_limite_desconto():

-- Regra pré-autorizada por promoção: bypass do desconto de promoção,
-- mas ainda valida o excedente manual sobre o preço JÁ COM PROMOÇÃO.
DECLARE
  v_preco_base_pos_promo numeric;
  v_pct_manual numeric;
BEGIN
  IF NEW.tipo_preco = 'ATACADO' THEN
    RETURN NEW;
  END IF;

  IF current_setting('session.gerente_token_validado', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- NOVO: se há promoção aplicada, a base de comparação passa a ser
  -- o preço JÁ COM a promoção (não o preço original de tabela).
  IF NEW.promocao_regra_id IS NOT NULL THEN
    v_preco_base_pos_promo := NEW.preco_unitario_original
      * (1 - COALESCE(NEW.promocao_desconto_percentual, 0) / 100);
  ELSE
    v_preco_base_pos_promo := NEW.preco_unitario_original;
  END IF;

  -- ... resto do cálculo usa v_preco_base_pos_promo no lugar de
  -- NEW.preco_unitario_original como denominador/referência.
END;
```

**Efeito**: a promoção **não é limitada pelo teto de 15%** (é decisão de GERENTE/DONO/ADMIN, análoga ao ATACADO — pré-autorizada por quem tem RLS de escrita em `regras_preco`). O **desconto manual adicional** (se o operador tentar reduzir ainda mais em cima do preço já promocional) **continua limitado a 15% sobre o preço pós-promoção**, não sobre o preço de tabela original.

Isto satisfaz literalmente a ordem pedida: *preço base → promoção → desconto manual → limite final*, onde "limite final" se aplica à camada de desconto manual, calculada sobre o resultado da camada anterior (promoção).

### 3.4 Limite Agregado da Venda (Total)

Além do limite por item, mantém-se a recomendação já registrada em `BL2_MATRIZ_RISCOS.md` (risco P0-03): adicionar `pdv_config.max_desconto_total_percentual` (sugestão: 60% default) e validar em `finalizar_venda_transacional_canonica_v4`:

```
(total_bruto - total_liquido) / total_bruto ≤ max_desconto_total_percentual
```

Esta validação **acumula todas as fontes** (promoção + manual + desconto de gerente), fechando o "limite final" da cadeia de precedência.

---

## 4. Auditoria Histórica

### 4.1 O Que Já Existe (Reutilizável, Sem Mudança)

| Necessidade Pedida | Já Existe? | Onde |
|---------------------|-----------|------|
| **Valor antes/depois** | ✅ Sim, desde migration 001 | `itens_venda.preco_unitario_original` (antes) e `itens_venda.preco_unitario` (depois) — genérico para qualquer tipo de desconto, não precisa duplicar |

### 4.2 O Que Existe mas É Insuficiente (Achado Crítico)

**`itens_venda.regra_aplicada_id`, `tipo_preco_fonte`, `custo_unitario_snap` já existem desde a migration 235** (`235_observabilidade_pdv_visual.sql:14-24`), e o frontend **já envia** esses campos hoje (`caixaVendas.impl.ts:271-273`, `caixaPrecoAutoritativoServer.ts:19-31`).

Porém, por design explícito da 235, são **campos de observabilidade visual, não autoritativos**:

> `regra_aplicada_id` — *"Id da regra/faixa de preço usada como referência visual (regras_preco ou precos_atacado). **Sem FK formal**: a origem varia por tipo_preco_fonte."*

**Implicação importante**: essa coluna é **polimórfica sem FK** — hoje pode conter tanto um `id` de `regras_preco` (regra) quanto de `precos_atacado` (faixa de atacado), dependendo do `tipo_preco_fonte`. **Não é seguro** adicionar uma FK real para `regras_preco(id)` nesta coluna existente, porque isso quebraria o caso `ATACADO_FAIXA` (que aponta para `precos_atacado`, não `regras_preco`).

**Decisão de desenho**: BL-2 **não reaproveita** `regra_aplicada_id` para autoridade. Cria colunas **novas, dedicadas e com FK real**, mantendo as colunas da 235 exatamente como estão (visuais, sem mudança de comportamento).

### 4.3 Novas Colunas (Auditoria Autoritativa de Promoção)

| Coluna Nova | Tipo | Constraint | Propósito |
|-------------|------|-----------|-----------|
| `itens_venda.promocao_regra_id` | uuid | FK → `regras_preco(id)` `ON DELETE SET NULL`, nullable | **FK real**, exclusiva para promoção (não polimórfica) |
| `itens_venda.promocao_desconto_percentual` | numeric(10,4) | nullable | Percentual efetivamente aplicado (normalizado mesmo se regra era `VALOR_FIXO`, conforme §2.4) |
| `itens_venda.promocao_nome_snapshot` | text | nullable | Cópia congelada de `regras_preco.nome` no momento da venda — sobrevive a delete/edição futura da regra |
| `regras_preco.nome` | text | nullable | Novo campo (§1.5), preenchido pelo admin ao criar a promoção (ex.: "Black Friday 2026") |

### 4.4 Resposta à Pergunta de Auditoria ("Por Que Este Preço?")

```sql
SELECT
  iv.preco_unitario_original AS preco_antes,
  iv.preco_unitario          AS preco_depois,
  iv.promocao_nome_snapshot  AS promocao,
  iv.promocao_desconto_percentual AS desconto_promocao_pct,
  iv.tipo_preco,
  iv.desconto_unitario       AS desconto_total_unitario
FROM itens_venda iv
WHERE iv.id = '<item_id>';
```

**Resultado exemplo**:
```
preco_antes: 100.00
preco_depois: 68.00
promocao: "Black Friday 2026 -20%"
desconto_promocao_pct: 20.00
tipo_preco: VAREJO
desconto_total_unitario: 32.00   -- inclui promoção (20) + manual adicional (15% sobre 80 = 12) → 20+12=32
```

Rastreabilidade completa: **quanto veio de promoção** vs **quanto veio de decisão manual do operador**, sem ambiguidade — mesmo que `regras_preco` original seja deletada depois (snapshot preserva o nome).

### 4.5 Histórico de Vendas (Delete/Edição de Regra no Futuro)

- `promocao_regra_id` com `ON DELETE SET NULL` → se a regra for excluída, o vínculo vira NULL, mas **`promocao_nome_snapshot` preserva o nome** e **`promocao_desconto_percentual` preserva o valor aplicado**.
- Relatório "quantas vendas tiveram Black Friday 2026" continua respondível via `promocao_nome_snapshot LIKE 'Black Friday%'` mesmo após a regra não existir mais.

---

## 5. Impacto Consolidado

### 5.1 Impacto no Banco

| Mudança | Tabela | Tipo |
|---------|--------|------|
| `ADD COLUMN nome text` | `regras_preco` | Aditiva, nullable |
| `ADD COLUMN promocao_regra_id uuid REFERENCES regras_preco(id) ON DELETE SET NULL` | `itens_venda` | Aditiva, nullable, FK real |
| `ADD COLUMN promocao_desconto_percentual numeric(10,4)` | `itens_venda` | Aditiva, nullable |
| `ADD COLUMN promocao_nome_snapshot text` | `itens_venda` | Aditiva, nullable |
| `ADD COLUMN max_desconto_total_percentual numeric(5,2) DEFAULT 60.00` | `pdv_config` | Aditiva, com default |
| **`tipo_preco` CHECK constraint** | `itens_venda` | ❌ **Sem mudança** (decisão aprovada rejeita Opção A) |

**Nenhuma migration de dados** é necessária — todas as colunas são nullable/aditivas, vendas antigas ficam com `NULL` (semântica: "sem promoção aplicada", correta por default).

### 5.2 Impacto nas RPCs

| RPC | Mudança |
|-----|---------|
| `calcular_preco_produto` | ❌ Nenhuma (SSOT de preço base intocado) |
| **`calcular_promocao_aplicavel`** (nova) | Função de leitura pura, `STABLE`, `SECURITY INVOKER` — retorna regra vencedora por precedência PRODUTO > CATEGORIA > mais recente |
| `finalizar_venda_transacional_canonica_v4` | Adiciona: (a) chamada a `calcular_promocao_aplicavel`, (b) cálculo de preço pós-promoção, (c) validação de divergência (mesmo padrão epsilon já usado para VAREJO/ATACADO), (d) inserção de `promocao_regra_id/percentual/nome_snapshot`, (e) validação de `max_desconto_total_percentual` agregado |
| `trg_fn_itens_venda_limite_desconto` (trigger, migration 122) | **Ajuste obrigatório**: usar preço pós-promoção como base de comparação para o desconto manual, em vez do preço de tabela original (§3.3) |

### 5.3 Impacto no PDV / `unifiedCartStore`

```typescript
export interface ItemCarrinho {
  // ... campos existentes, SEM MUDANÇA ...
  resultado?: {
    precoUnitario: number
    precoOriginal: number
    descontoUnitario: number
    tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'   // 'PROMOCAO' REMOVIDO desta união (ver §6.3)
  }
  // NOVO: metadado de promoção, nunca usado para decidir preço — só exibição
  promocaoAplicada?: {
    regraId: string
    nome: string
    descontoPercentual: number
  }
}
```

- `unifiedCartStore` **não ganha lógica de cálculo nova** — apenas um campo de exibição preenchido a partir da resposta da RPC (ou de uma chamada de preview a `calcular_promocao_aplicavel`, sempre revalidada na finalização).
- Fluxo de finalização **não muda de ordem** — apenas envia dois campos a mais no payload de item (`promocao_regra_id` opcional).

### 5.4 Riscos por Alternativa (Resumo)

| Risco | Opção A (tipo_preco='PROMOCAO') | Opção B (regra_aplicada — **aprovada**) |
|-------|----------------------------------|------------------------------------------|
| Colisão com trigger de 15% (migration 122) | Mesmo problema — nenhuma opção escapa disso, exige o mesmo ajuste do §3.3 | Mesmo ajuste necessário, mas isolado em coluna dedicada, sem overload de `tipo_preco` |
| FK de auditoria | Precisaria nova coluna de qualquer forma (tipo_preco sozinho não basta) | Coluna nova e dedicada, sem herdar ambiguidade da 235 |
| Compatibilidade com `regra_aplicada_id` (235, polimórfica) | Risco de confundir com uso existente (ATACADO_FAIXA) | Evitado por completo — coluna nova, sem overlap |
| Schema churn futuro (cupom, voucher) | Cada novo mecanismo = novo valor de `tipo_preco` | Cada novo mecanismo = nova `regra_tipo`, sem alterar `tipo_preco` |

---

## 6. Correções em Relação aos Documentos Anteriores

Esta seção existe para não deixar inconsistência entre os artefatos já entregues.

### 6.1 `BL2_ANALISE_INICIAL.md` — Correção

O documento afirmava que `itens_venda` **não tinha** nenhuma coluna de rastreamento de regra e propunha criá-la do zero. **Correção**: `regra_aplicada_id`, `tipo_preco_fonte` e `custo_unitario_snap` **já existem** (migration 235) e **já são enviados pelo frontend**, mas são **visuais/não-autoritativos**. BL-2 não reaproveita essa coluna (§4.2) — cria colunas novas e dedicadas.

### 6.2 `BL2_PLANO_IMPLEMENTACAO.md` — Correção

A migration 273 rascunhada anteriormente propunha `ALTER TABLE itens_venda DROP/ADD CONSTRAINT itens_venda_tipo_preco_check` para incluir `'PROMOCAO'`. **Esta parte está revogada** — decisão aprovada mantém `tipo_preco` como está (`VAREJO`, `ATACADO`, `MANUAL`). O plano de fases (0-5) permanece válido em estrutura, mas o conteúdo técnico da Fase 0/1 muda para o desenho deste documento (§5.1).

### 6.3 Limpeza de Código Existente (Achado Novo, Não Documentado Antes)

O valor literal `'PROMOCAO'` **já existe hoje** em três pontos do TypeScript, como remanescente de uma tentativa anterior (não finalizada) de seguir a Opção A:

- `pdv-importados/app/caixa/finalizarVendaValidation.ts:24` — `TIPO_PRECO_ITEM_FINALIZAR` inclui `'PROMOCAO'`
- `pdv-importados/app/caixa/server/caixaPrecoAutoritativoServer.ts:19,31` — `ItemAutoritativo.tipoPreco` e `.fontePreco` incluem `'PROMOCAO'`
- `shared/pricing/PricingService.ts:69` — retorna `tipoPreco: 'PROMOCAO'`
- `pdv-local/src/lib/recalcularPrecoItemLocal.ts:32` — trata `tipoAtual === 'PROMOCAO'` como preço congelado (mesmo tratamento de `'MANUAL'`)

**Nenhum desses pontos hoje envia `tipo_preco='PROMOCAO'` para o banco em produção** (o CHECK constraint rejeitaria) — é código morto/latente, não uma feature ativa. Como parte da implementação de BL-2 (não desta migration 273, mas do trabalho subsequente de código), esses literais devem ser **removidos** dos tipos `tipoPreco`/`fontePreco` para eliminar o risco de alguém futuramente wire-ar esse caminho e causar `CHECK constraint violation` em produção. `PricingService.calcularPrecoItem()` deve ser revisto para não mais retornar `tipoPreco: 'PROMOCAO'` — sua função de encontrar/aplicar regra é absorvida pela nova RPC `calcular_promocao_aplicavel` (§2.2).

---

## 7. Checklist de Aprovação Antes da Migration 273

- [ ] Aprovação técnica: modelo de auditoria (colunas novas dedicadas, sem reaproveitar `regra_aplicada_id` da 235)
- [ ] Aprovação de negócio: `max_desconto_total_percentual` default 60% (ou outro valor)
- [ ] Aprovação de negócio: promoção é pré-autorizada (bypassa limite de 15% manual), análogo a ATACADO — confirmar que é intencional
- [ ] Aprovação técnica: ajuste do trigger `trg_fn_itens_venda_limite_desconto` (base de cálculo passa a ser preço pós-promoção)
- [ ] Aprovação de produto: campo `regras_preco.nome` obrigatório ou opcional no cadastro (recomendado: obrigatório na UI, nullable no schema por compatibilidade)
- [ ] Confirmação: cliente/VIP fica fora de escopo de BL-2 (schema não suporta hoje, não é requisito desta rodada)

---

## 8. Próxima Ação

Após aprovação deste documento:
1. Criar **migration 273** com exatamente as 5 mudanças aditivas do §5.1 (schema)
2. Criar **migration 274** com a nova RPC `calcular_promocao_aplicavel` + atualização de `finalizar_venda_transacional_canonica_v4` + ajuste do trigger de limite (§3.3)
3. Seguir fases 2-5 já descritas em `BL2_PLANO_IMPLEMENTACAO.md`, com o conteúdo técnico de Fase 0/1 substituído pelo desenho deste documento

---

**Data**: 2026-07-24
**Status**: ✅ Modelo Aprovado — Aguardando checklist §7 antes de codificar migration 273
**Autor**: Claude (claude-sonnet-5)
