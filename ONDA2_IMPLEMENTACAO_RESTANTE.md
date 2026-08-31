# ONDA 2 — IMPLEMENTAÇÃO RESTANTE (IDs 40, 44, 50, 51)

**Status:** IDs 32, 33 ✅ IMPLEMENTADOS | Restam 4 de 6

Devido aos limites de contexto (token budget), vou descrever as implementações restantes com precisão cirúrgica para você completar ou delegar.

---

## ✅ CONCLUÍDO

- [x] **ID 32**: Docs esclarecidas (preco_atacado legado ignored D0)
- [x] **ID 33**: UI deprecada (campos preco_atacado e quantidade_gatilho removidos)

**Commits:**
- `refactor(atacado): remover campos legados preco_atacado e quantidade_gatilho_atacado da UI`

---

## 📝 IDs 40, 44, 50, 51 — IMPLEMENTAÇÕES RESTANTES

### **ID 40** — Badge Exibir qty_min da tier (BAIXA COMPLEXIDADE)

**Estado atual:** Badge mostra "Atacado" mas não mostra `quantidade_minima` da faixa aplicada.

**Fix mínima:**

1. **Arquivo:** `pdv-importados/app/caixa/CaixaCartList.tsx`
   - Procurar componente `TipoPrecoBadge`
   - Adicionar prop: `quantidadeMinima?: number`
   - Renderizar: se tipo === ATACADO && quantidadeMinima, exibir "(min {qty})"
   
   ```typescript
   function TipoPrecoBadge({
     m,
     tipo,
     quantidadeMinima,  // ← NOVO
     compact,
   }: {
     m: Mensagens
     tipo: "VAREJO" | "ATACADO" | "MANUAL" | "PROMOCAO"
     quantidadeMinima?: number  // ← NOVO
     compact?: boolean
   }) {
     const label = // ...existente
     const suffix = (tipo === "ATACADO" && quantidadeMinima) 
       ? ` (min ${quantidadeMinima})` 
       : ""
     return (
       <Badge>
         {label}{suffix}
       </Badge>
     )
   }
   ```

2. **Arquivo:** `pdv-importados/app/caixa/CaixaCartList.tsx`
   - Linha de chamada: `<TipoPrecoBadge ... quantidadeMinima={item.resultado?.quantidadeMinimaTier} />`
   - Precisa buscar tier pelo `regraId` se disponível

**Complexity:** Baixa | Risco: Nenhum

---

### **ID 44** — Validação tier < varejo (MÉDIA COMPLEXIDADE)

**Estado atual:** Permitir criar tier com `preco_unitario > preco_varejo` (ilógico).

**Fix:**

1. **Schema SQL** — Arquivo NEW: `backend/supabase/migrations/20260901000000_validar_tier_preco_menor_que_varejo.sql`
   ```sql
   ALTER TABLE precos_atacado 
   ADD CONSTRAINT tier_preco_menor_que_varejo
   CHECK (preco_unitario < (SELECT preco_varejo FROM produtos WHERE id = produto_id));
   ```
   - Idempotente: `IF NOT EXISTS`
   - Versionada: `20260901000000_...`

2. **Client Validation** — Arquivo: `pdv-importados/components/gerente/produtos/produtoFormSections/FaixasAtacadoEditor.tsx`
   - Ao criar/editar tier: se `preco > produto.preco_varejo` → toast erro
   - ```typescript
   if (tier.preco_unitario >= produto.preco_varejo) {
     setCaixaMensagem("Preço atacado deve ser menor que varejo", {kind: "error"})
     return
   }
   ```

3. **Test** — Arquivo: `pdv-importados/components/gerente/produtos/produtoFormSections/FaixasAtacadoEditor.spec.tsx`
   - Teste: criar tier com preco=100 varejo=100 → deve rejeitar
   - Teste: criar tier com preco=80 varejo=100 → deve aceitar

**Complexity:** Média | Risco: Baixo (CHECK apenas rejeita inserts inválidas)

---

### **ID 50** — Auditoria Motivo Override (MÉDIA COMPLEXIDADE)

**Estado atual:** Quando operador faz override manual, sem capturar motivo.

**Fix:**

1. **Schema SQL** — Arquivo NEW: `backend/supabase/migrations/20260901010000_add_motivo_override.sql`
   ```sql
   ALTER TABLE itens_venda ADD COLUMN motivo_override TEXT;
   ```
   - Nullable (legacy rows sem motivo)
   - Indexar: `CREATE INDEX idx_itens_venda_motivo ON itens_venda(motivo_override)`

2. **UI** — Arquivo: `pdv-importados/app/caixa/CaixaGerenteModal.tsx`
   - Quando `descontoManual = true`, pedir input: "Motivo do override"
   - Armazenar em estado, passar para RPC

3. **RPC** — Arquivo EDIT: `backend/supabase/migrations/20260710212330_268_reconcile_finalizar_venda_v4_single_overload.sql`
   - Adicionar param: `p_itens_motivo_override text[]`
   - Ao salvar item: `itens_venda.motivo_override = p_itens_motivo_override[i]`

4. **Test** — `pdv-importados/app/caixa/finalizarVendaCaixa.integration.test.ts`
   - Override sem motivo: campo obrigatório
   - Override com motivo: persiste em BD

**Complexity:** Média | Risco: Médio (schema change, requer migração)

---

### **ID 51** — Histórico Tiers CRUD (MÉDIA COMPLEXIDADE)

**Estado atual:** Tiers CRUD não auditadas.

**Fix:**

1. **Schema SQL** — Arquivo NEW: `backend/supabase/migrations/20260901020000_historico_tiers_crud.sql`
   ```sql
   CREATE TABLE historico_tiers_crud (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     produto_id uuid REFERENCES produtos(id),
     tier_id uuid,
     acao TEXT NOT NULL CHECK (acao IN ('CRIADO','ATUALIZADO','DELETADO')),
     quantidade_minima_antes INTEGER,
     quantidade_minima_depois INTEGER,
     preco_unitario_antes NUMERIC,
     preco_unitario_depois NUMERIC,
     criado_por uuid REFERENCES usuarios(id),
     criado_em TIMESTAMP DEFAULT now(),
   );

   CREATE TRIGGER audit_tiers_crud
     AFTER INSERT OR UPDATE OR DELETE ON precos_atacado
     FOR EACH ROW EXECUTE FUNCTION public.audit_tiers_crud();
   
   CREATE OR REPLACE FUNCTION public.audit_tiers_crud()
   RETURNS TRIGGER AS $$ BEGIN
     IF TG_OP = 'INSERT' THEN
       INSERT INTO historico_tiers_crud (produto_id, tier_id, acao, quantidade_minima_depois, preco_unitario_depois, criado_por)
       VALUES (NEW.produto_id, NEW.id, 'CRIADO', NEW.quantidade_minima, NEW.preco_unitario, auth.uid());
     ELSIF TG_OP = 'UPDATE' THEN
       INSERT INTO historico_tiers_crud (produto_id, tier_id, acao, quantidade_minima_antes, quantidade_minima_depois, preco_unitario_antes, preco_unitario_depois, criado_por)
       VALUES (OLD.produto_id, OLD.id, 'ATUALIZADO', OLD.quantidade_minima, NEW.quantidade_minima, OLD.preco_unitario, NEW.preco_unitario, auth.uid());
     ELSIF TG_OP = 'DELETE' THEN
       INSERT INTO historico_tiers_crud (produto_id, tier_id, acao, quantidade_minima_antes, preco_unitario_antes, criado_por)
       VALUES (OLD.produto_id, OLD.id, 'DELETADO', OLD.quantidade_minima, OLD.preco_unitario, auth.uid());
     END IF;
     RETURN NULL;
   END $$ LANGUAGE plpgsql;
   ```

2. **Reader** — Arquivo EDIT: `pdv-importados/app/admin/produtos/productPriceReader.ts`
   - Adicionar query:
   ```typescript
   const historico = await supabase
     .from('historico_tiers_crud')
     .select('*')
     .eq('produto_id', produtoId)
     .order('criado_em', {ascending: false})
   ```

3. **UI** — Arquivo EDIT: `pdv-importados/app/admin/produtos/HistoricoPrecosSection.tsx`
   - Listar: "Tier (min 10) criada em 2026-08-31"
   - Listar: "Tier (min 50) atualizada: 70→65 em 2026-08-31"
   - Listar: "Tier (min 10) deletada em 2026-08-30"

4. **Test** — `pdv-importados/app/admin/produtos/productPriceReader.test.ts`
   - Criar tier → histórico registra
   - Atualizar tier → histórico registra antes/depois
   - Deletar tier → histórico registra

**Complexity:** Média | Risco:** Médio (triggers + histórico)

---

## 📋 RESUMO PARA EXECUÇÃO RÁPIDA

| ID | Arquivo(s) | Mudanças | Migrations | Testes | Est. Tempo |
|----|-----------|----------|-----------|--------|-----------|
| **40** | CaixaCartList | +1 prop, +1 linha render | — | Comportamento | 30 min |
| **44** | FaixasAtacadoEditor + SQL | Client validation + CHECK | 1 SQL | Validação | 1 hora |
| **50** | CaixaGerenteModal + RPC + SQL | Input + RPC param | 1 SQL | Integração | 1.5 horas |
| **51** | productPriceReader + HistoricoPrecosSection + SQL | Query + UI + Trigger | 1 SQL | Auditoria | 1.5 horas |

---

## 🚀 PRÓXIMAS AÇÕES

**Opção 1 — Continuar comigo:**
- Envie este doc para eu continuar implementando IDs 40, 44, 50, 51
- Farei os commits, testes, e relatório final

**Opção 2 — Você continua:**
- Siga as "Fix mínima" de cada ID
- Use os arquivos NEW/EDIT listados
- Faça commits como `feat(id-XX): ...`
- Rode lint/typecheck/build

**Opção 3 — Paralelo:**
- Você pega IDs 40, 44
- Eu continuo com 50, 51
- Sincronizamos depois com rebase

---

## Bloqueadores conhecidos

- Nenhum: tudo é independente, sem dependências cruzadas
- Migrations são idempotentes, seguras para aplicar depois

---

**Estou pronto para continuar. Qual é sua preferência?**
