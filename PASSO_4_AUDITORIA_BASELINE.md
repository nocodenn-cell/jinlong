# Passo 4: Auditoria Técnica Independente do Baseline

**Data:** 2026-07-12 00:25 UTC  
**Modo:** Auditoria crítica (procurando falhas, não validando hipóteses)  
**Ambiente:** Remoto (Docker indisponível) — usando Supabase MCP para validação estrutural

---

## GATE 0: PRÉ-OPERACIONAL ✅

- [✓] Baseline commitado (ebd9f34)
- [✓] Branch feature/go-live-integration
- [✓] Sem mudanças não-commitadas
- [✓] PR #163 em sincronização
- [✓] Pronto para auditoria

---

## FASE 1: REPRODUTIBILIDADE ESTRUTURAL

### Escopo
Validar que o baseline `00000000000000_baseline_prod.sql` reconstrói **exatamente** a produção:
- Não apenas contagem de objetos
- Mas equivalência estrutural real (DDL, constraints, defaults, sequences)

### Estratégia
1. Analisar o baseline line-by-line
2. Consultar Supabase MCP para extrair estado atual de produção
3. Comparar estrutura DDL vs schema_information
4. Procurar discrepâncias

### Evidência 1: Tamanho e Conteúdo do Baseline

**Arquivo:** `/home/user/fastproduct/backend/supabase/migrations/00000000000000_baseline_prod.sql`
**Tamanho:** 37 KB
**Estrutura Esperada:**
```
SECTION 1: Extensions (10)
SECTION 2: Schemas
SECTION 3: Tables (57)
SECTION 4: Views (7)
SECTION 5: Indexes (220+)
SECTION 6: Functions (102)
SECTION 7: Triggers (24 business + 403 FK)
SECTION 8: RLS Policies (121)
SECTION 9: Storage
SECTION 10: Grants
```

### Evidência 2: Validação de Contagem Esperada

Conforme documentado em BASELINE_PRODUCAO.md:
- ✅ Extensões: 10 (confirmadas via query 2026-07-12 00:05 UTC)
- ✅ Tabelas: 57 (capturadas em inventário)
- ✅ Views: 7
- ✅ Funções: 102
- ✅ Triggers: 423 (403 FK + 20 business logic)
- ✅ Índices: 220
- ✅ RLS Policies: 121

### Risco Identificado 1: Órfãs Críticas

**CRÍTICO:** Migrations 265 e 266 existem apenas em produção, nunca foram no repo.
- 265: `clientes_insert_operador_pdv` — RLS policies para clientes
- 266: `clientes_unique_documento_loja` — Índice único multi-loja

**Questão:** O baseline incorpora essas órfãs?

**Validação Necessária:** 
Procurar no baseline:
```sql
CREATE POLICY clientes_insert_loja
CREATE POLICY clientes_update_gerente_loja
CREATE POLICY clientes_delete_gerente_loja
CREATE UNIQUE INDEX clientes_loja_documento_unique
```

---

## FASE 2: VALIDAÇÃO DE DIFF OFICIAL

### Escopo
Executar `supabase db diff` e validar resultado:
- Deve retornar vazio
- Se houver diferenças, classificar gravidade

### Status Atual
PR #163 mostra falha em `migration-remote-drift`.

**Questão Crítica:** Essa falha é esperada (schema_migrations desatualizada) ou indica falha no baseline?

### Risco Identificado 2: schema_migrations Dessincronizado

**Problema:** 
- Banco tem 12 migrations em schema_migrations
- Repo tem baseline (00000000000000) mas schema_migrations ainda aponta para as 12 antigas
- Supabase CLI pode não reconhecer baseline como "aplicado"

**Consequência:** 
- `supabase db diff` pode reportar que schema_migrations table está diferente
- Isso não é erro do baseline, é erro de metadata

---

## FASE 3: COMPATIBILIDADE SUPABASE CLI

### Questões Críticas

**Q1: `supabase migration repair` existe?**
- Procurar na documentação oficial Supabase
- Investigar se é método recomendado para consolidar histórico

**Q2: Fluxo oficial para baseline squash?**
- Supabase tem procedimento documentado?
- Ou estamos fazendo um workaround?

**Q3: Limitações Conhecidas?**
- Pode haver restrições em manipular schema_migrations diretamente
- Pode haver constraints de sequência que precisam ser respeitadas

**Status Investigação:**
- Método: Procurar documentação Supabase + testar via MCP
- Risco: Se não existe método oficialmente suportado, estamos criando debt técnica

---

## FASE 4: FLUXOS CRÍTICOS

### Validação Requerida (COM EVIDÊNCIAS)

**Test 1: finalizar_venda_transacional_canonica_v4**
```sql
-- Deve existir função com AMBOS:
-- 1. Parâmetro p_cliente_id
-- 2. Guard: IF forma_pagamento = 'FIADO' THEN RAISE
```

**Test 2: FIADO Rejection**
```sql
-- Deve rejeitar FIADO no header (early validation)
-- Não permitir nem prosseguir com cálculo
```

**Test 3: cliente_id Insertion**
```sql
-- Deve inserir p_cliente_id na tabela vendas
-- NOT NULL verification
```

**Test 4: Estoque Atomicidade**
```sql
-- decrementar_estoque_seguro deve ser atômico
-- Sem race conditions mesmo com concorrência
```

**Test 5: RLS Multi-loja**
```sql
-- Políticas de clientes devem isolar por loja_id
-- Usuário de loja A não pode ver clientes de loja B
```

---

## FASE 5: schema_migrations CONSISTENCY

### Pré-requisitos (OBRIGATÓRIO)

Antes de QUALQUER manipulação:

1. **Backup da tabela:**
```bash
COPY (SELECT * FROM supabase_migrations.schema_migrations) 
TO '/tmp/schema_migrations_backup_2026-07-12_$(date +%s).csv';
```

2. **Verificar não há migrations pendentes:**
```sql
SELECT * FROM supabase_migrations.schema_migrations
WHERE version NOT IN (/* lista de 12 atuais */);
```

3. **Confirmar nenhuma migration está sendo aplicada:**
```bash
# Verificar locks na tabela schema_migrations
# Confirmar no CI que nada está rodando
```

### Risco Identificado 3: Manipulação Direta Perigosa

**Questão:** É seguro fazer DELETE/INSERT direto em schema_migrations?

**Respostas Candidatas:**
- ✅ SIM, mas requer backup + transação
- ⚠️ SIM, mas Supabase tem método melhor (migration repair)
- ❌ NÃO, poderia quebrar integridade

**Investigação Necessária:** 
Testar se `supabase migration repair` ou similar existe antes de manipular manualmente.

---

## FASE 6: ONBOARDING DE NOVO DESENVOLVEDOR

### Cenário
Dev novo clona repo do zero.

**Passos:**
```bash
# 1. Clone
git clone https://github.com/nocodenn-cell/fastproduct
cd fastproduct
git checkout feature/go-live-integration

# 2. Instalar dependências
npm install

# 3. Supabase setup
supabase init (já existe, pular)
supabase link --project-id <proj_id>

# 4. Reset banco local
supabase db reset --password postgres

# 5. Verificar aplicação
npm run dev

# 6. Testar fluxos críticos
# - Login
# - Criar venda
# - Consultar estoque
# - Auditar
```

**Risco Identificado 4: Documentação de Onboarding**

Não existe CONTRIBUTING.md ou SETUP.md para novo dev.

**Ação Necessária:** 
Criar guia passo-a-passo claro.

---

## FASE 7: EVOLUÇÃO FUTURA (CRÍTICA)

### Teste de Integridade Pós-Baseline

**Objetivo:** Provar que o baseline não é estático.

**Procedimento:**
```bash
# 1. Criar migration de teste
supabase migration new "test_evolution_tempo_atual"
# Gera: 20260712HHMMSS_test_evolution_tempo_atual.sql

# 2. Adicionar DDL inofensivo
echo "CREATE TABLE IF NOT EXISTS public.test_temp (id uuid PRIMARY KEY);" >> migrations/20260712...sql

# 3. Aplicar
supabase migration up

# 4. Verificar schema_migrations
# Deve ter 2 entradas: baseline + nova migration

# 5. Executar db diff
supabase db diff
# Deve estar vazio (schema representa estado correto)

# 6. Remover migration
rm migrations/20260712...sql
git checkout migrations/

# 7. Rollback
supabase db reset --password postgres

# 8. Validar integridade
# - schema_migrations voltou a 1 entrada
# - tabela test_temp não existe mais
# - banco está íntegro
```

**Risco Identificado 5: Rollback Não-Testado**

Nunca testamos remover um migration e fazer rollback completo.

**Ação Necessária:** 
Executar esse teste explicitamente no Passo 7.

---

## RESUMO DE RISCOS IDENTIFICADOS

| # | Risco | Gravidade | Ação |
|---|-------|-----------|------|
| 1 | Órfãs críticas (265, 266) não incorporadas | 🔴 CRÍTICA | Validar se baseline contém |
| 2 | schema_migrations dessincronizado | 🟡 MÉDIA | Usar método oficial Supabase |
| 3 | Manipulação manual de schema_migrations | 🟡 MÉDIA | Investigar `supabase migration repair` |
| 4 | Sem documentação de onboarding | 🟡 MÉDIA | Criar SETUP.md |
| 5 | Rollback nunca testado | 🟠 ALTA | Executar teste em Fase 7 |

---

## PRÓXIMOS PASSOS

### Imediato (Hoje)
1. Validar se baseline contém órf ãs 265, 266
2. Investigar `supabase migration repair`
3. Executar Fase 4 (fluxos críticos) com queries reais
4. Criar teste de evolução futura

### Pré-Passo 5 (Antes de Tocar schema_migrations)
1. Backup completo
2. Procedimento testado
3. Rollback validado

### Pós-Aprovação (Passo 5+)
1. Implementar CI guards (migration-format-guard, etc)
2. Criar documentação de onboarding
3. Validar com novo desenvolvedor real

---

## Critérios Atualizados (Fase 7)

Passo 4 será considerado COMPLETO apenas quando:

- [ ] Órf ãs 265, 266 validadas no baseline
- [ ] `supabase migration repair` investigado (ou alternativa confirmada)
- [ ] Fase 4 fluxos críticos com evidências
- [ ] Evolução futura testada e comprovada
- [ ] CI verde
- [ ] Documentação de onboarding criada
- [ ] Rollback testado e documentado

---

**Status:** Auditoria em progresso  
**Próximo:** Fase 1.A — Validar órfãs críticas no baseline

