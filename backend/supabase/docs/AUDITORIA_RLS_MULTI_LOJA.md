# 🔐 AUDITORIA RLS — VENDOR ISOLATION (Multi-Loja)

**Data:** 11 de julho de 2026  
**Status:** 🔴 **CRÍTICO — VAZAMENTO DE DADOS IDENTIFICADO**  
**Risco:** Um GERENTE de loja A pode ver/editar dados de loja B

---

## 🚨 PROBLEMAS CRÍTICOS ENCONTRADOS

### **PROBLEMA #1: `descontos_venda` — Sem filtro de loja**

**Arquivo:** `backend/supabase/migrations/008_descontos_venda_rls.sql`

**Policy Atual:**
```sql
CREATE POLICY "descontos_venda_select_gerente_dono"
  ON public.descontos_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
```

**Problema:** 
- ✅ Valida se usuário é GERENTE/DONO
- ❌ **NÃO valida se desconto está vinculado à mesma loja**

**Estrutura:**
```
descontos_venda (venda_id → vendas → caixa_id → caixas → loja_id)
```

**Cenário de Vazamento:**
```
Setup:
  - Loja A: Maria (gerente), venda_123 (desconto aplicado)
  - Loja B: João (gerente), nenhuma venda

Ataque:
  - João faz SELECT em descontos_venda
  - Policy valida: João.perfil='GERENTE' ✓
  - Maria's desconto aparece para João
  - João vê: desconto_percentual, desconto_valor de loja A
  - Pior: João pode tentar UPDATE (policy permite também)
```

**Risco:** 🔴 **CRÍTICO** — Vazamento de dados confidencial

---

### **PROBLEMA #2: `movimentos_caixa` — Sem filtro de loja**

**Arquivo:** `backend/supabase/migrations/212_restaura_movimentos_caixa_legado.sql`

**Policy Atual:**
```sql
CREATE POLICY "movimentos_gerente" 
  ON public.movimentos_caixa FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
```

**Problema:**
- ❌ **Sem validação de loja**
- Um GERENTE de loja A vê TODOS os movimentos de caixa de loja B

**Estrutura:**
```
movimentos_caixa (caixa_id → caixas → loja_id)
```

**Risco:** 🔴 **CRÍTICO** — Exposição de fluxo financeiro

---

### **PROBLEMA #3: `precos_atacado` — Sem filtro de loja**

**Arquivo:** `backend/supabase/migrations/077_precos_atacado_tiers_e_rpc.sql`

**Policy Atual:**
```sql
CREATE POLICY "precos_atacado_leitura"
  ON public.precos_atacado FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "precos_atacado_escrita"
  ON public.precos_atacado FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
```

**Problema:**
- Leitura: ANY authenticated (OK para operadores)
- Escrita: Qualquer GERENTE (❌ sem validação de loja)

**Risco:** 🔴 **ALTO** — Um gerente de loja A pode editar tiers de preço de loja B

---

### **PROBLEMA #4: `categorias_financeiras` — Sem filtro de loja**

**Arquivo:** `backend/supabase/migrations/018_desconto_token_gerente.sql` (original)

**Policy Atual (Migration 251):**
```sql
ALTER POLICY dono_gerente_all_cat_fin ON public.categorias_financeiras
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text, 'ADMIN'::text])
    )
  );
```

**Problema:**
- ❌ **Sem validação de loja**
- GERENTE de loja A vê categorias financeiras de loja B

**Risco:** 🟠 **ALTO** — Exposição de estrutura financeira

---

## 📋 TABELAS COM RLS CORRETO

✅ **Tabelas com validação de loja:**
- `clientes` (linhas 94-105 migration 224): Usa `u.loja_id = clientes.loja_id`
- `caixas` (linhas 28-49 migration 224): Usa `u.loja_id = caixas.loja_id`
- `estoque` (linhas 313-316 migration 224): Usa `u.loja_id = estoque.loja_id`
- `contas_pagar` (linhas 130-136 migration 224): Usa `u.loja_id = contas_pagar.loja_id`
- `contas_receber` (linhas 175-186 migration 224): Usa `u.loja_id = contas_receber.loja_id`
- `vendas` (migration 115): Usa `loja_id = auth.jwt() ->> 'loja_id'`

❌ **Tabelas com RLS incompleto:**
- `descontos_venda` — Sem check de loja
- `movimentos_caixa` — Sem check de loja
- `precos_atacado` — Escrita sem check de loja
- `categorias_financeiras` — Sem check de loja

❓ **Tabelas a verificar:**
- `documentos_fiscais_pendentes` — Tem policies, precisa verificar
- `devolucoes` — Tem policies, precisa verificar
- `comissoes_vendedores` — Tem policies, precisa verificar

---

## 🔧 CORREÇÕES NECESSÁRIAS

### **CORREÇÃO #1: descontos_venda**

**Problema:** Policy valida apenas perfil, não loja

**Solução:**
```sql
-- Drop policies antigas
DROP POLICY IF EXISTS "descontos_venda_select_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_insert_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_update_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_delete_gerente_dono" ON public.descontos_venda;

-- Criar policies com validação de loja
CREATE POLICY "descontos_venda_select_loja"
  ON public.descontos_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.vendas v ON v.id = descontos_venda.venda_id
      JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]) OR u.loja_id = c.loja_id)
    )
  );

CREATE POLICY "descontos_venda_write_loja"
  ON public.descontos_venda FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.vendas v ON v.id = descontos_venda.venda_id
      JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]) OR u.loja_id = c.loja_id)
    )
  );

-- UPDATE e DELETE com mesma lógica
```

**Impacto:** Sem mudança de comportamento para usuários corretos, bloqueia vazamento

---

### **CORREÇÃO #2: movimentos_caixa**

**Problema:** Policy sem validação de loja

**Solução:**
```sql
ALTER POLICY "movimentos_gerente" ON public.movimentos_caixa
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      JOIN public.caixas c ON c.id = movimentos_caixa.caixa_id
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]) OR u.loja_id = c.loja_id)
    )
  );
```

---

### **CORREÇÃO #3: precos_atacado**

**Problema:** Leitura aberta (OK), mas escrita sem validação

**Solução:**
```sql
ALTER POLICY "precos_atacado_escrita" ON public.precos_atacado
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]) OR u.loja_id = precos_atacado.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]) OR u.loja_id = precos_atacado.loja_id)
    )
  );
```

---

### **CORREÇÃO #4: categorias_financeiras**

**Problema:** Sem validação de loja

**Observação:** Se categorias_financeiras é global (compartilhada), pode ser OK. Precisa confirmar.

**Solução (se for multi-loja):**
```sql
ALTER POLICY dono_gerente_all_cat_fin ON public.categorias_financeiras
  USING (
    u.perfil = 'DONO' OR u.perfil = 'ADMIN' 
    OR (u.perfil = 'GERENTE' AND u.loja_id = categorias_financeiras.loja_id)
  );
```

---

## ✅ CHECKLIST DE VERIFICAÇÃO COMPLETA

### **Tabelas críticas a auditar:**

Tabelas que armazenam dados sensíveis por loja:

```
[x] vendas — tem loja_id? sim (via caixa)
[x] itens_venda — tem loja_id? não direto, via vendas
[x] estoque — tem loja_id? sim, direto
[x] clientes — tem loja_id? sim, direto
[x] caixas — tem loja_id? sim, direto
[x] usuarios — tem loja_id? sim, direto
[ ] descontos_venda — TEM PROBLEMA #1
[ ] movimentos_caixa — TEM PROBLEMA #2
[ ] precos_atacado — TEM PROBLEMA #3
[ ] categorias_financeiras — TEM PROBLEMA #4
[ ] documentos_fiscais_pendentes — verificar
[ ] contas_receber — verificar
[ ] comissoes_vendedores — verificar
[ ] devolucoes — verificar
[ ] estoque_baixas — verificar
[ ] transferencias_estoque — verificar
```

---

## 📊 RESUMO DE RISCOS

| Tabela | Problema | Severidade | Impacto |
|--------|----------|-----------|---------|
| descontos_venda | Sem filtro loja | 🔴 CRÍTICO | Vazamento de descontos |
| movimentos_caixa | Sem filtro loja | 🔴 CRÍTICO | Vazamento financeiro |
| precos_atacado | Escrita sem validação | 🔴 ALTO | Manipulação de preços |
| categorias_financeiras | Sem filtro loja | 🟠 ALTO | Exposição estrutura |

---

## 🎯 PLANO DE CORREÇÃO

### **Fase 1: Emergencial** (Hoje)
1. Implementar CORREÇÃO #1, #2, #3
2. Testar que GERENTE de loja A não vê dados de loja B
3. Fazer commit + push

### **Fase 2: Validação** (Amanhã)
1. Auditar migrations 035, 044, 077 por outros vazamentos
2. Verificar todas as 206 policies por padrão correto
3. Testar access control com usuários reais

### **Fase 3: Prevenção** (Semana)
1. Atualizar template de RLS policies
2. Adicionar checklist de security review em CI/CD
3. Documentar padrão correto para futuras policies

---

## 📝 PRÓXIMAS AÇÕES

1. ✅ Criar migration com correções
2. ✅ Testar que policies bloqueiam corretamente
3. ✅ Verificar não há regressão em policies corretas
4. ✅ Commit + push
5. ⚠️ Auditoria completa de todas 206 policies

**Sem estas correções, go-live é inseguro.**

---

**Severidade:** 🔴 **CRÍTICO — BLOQUEIA GO-LIVE**  
**Próxima Ação:** Implementar correções imediatamente
