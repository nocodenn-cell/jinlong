# CHECKLIST DE VERIFICAÇÃO - REMOÇÃO FIADO

**Instruções:** Use este documento para validar que a remoção do módulo Fiado foi completamente implementada em seu ambiente.

---

## ✅ CHECKLIST PRÉ-IMPLEMENTAÇÃO

### Migrations Aplicadas
- [ ] **Migration 245** aplicada (Remove tabelas `venda_fiado`, `vendas_fiado`)
  ```bash
  psql $DATABASE_URL -c "SELECT * FROM pg_stat_user_tables WHERE relname IN ('venda_fiado', 'vendas_fiado');"
  # Esperado: 0 linhas
  ```

- [ ] **Migration 246** aplicada (Bloqueia FIADO em constraints + RPC)
  ```bash
  psql $DATABASE_URL -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name IN ('vendas', 'vendas_pagamentos') AND constraint_name LIKE '%fiado%';"
  # Esperado: 2 linhas (vendas_forma_pagamento_nao_fiado, vendas_pagamentos_forma_nao_fiado)
  ```

### Estado do Banco
- [ ] **Sem dados FIADO históricos**
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM vendas WHERE forma_pagamento = 'FIADO';"
  # Esperado: 0
  ```

- [ ] **Tabelas substitutivas existem**
  ```bash
  psql $DATABASE_URL -c "
    SELECT 
      EXISTS(SELECT 1 FROM pg_tables WHERE tablename='clientes') as clientes,
      EXISTS(SELECT 1 FROM pg_tables WHERE tablename='contas_receber') as contas_receber,
      EXISTS(SELECT 1 FROM pg_tables WHERE tablename='liquidacoes_receber') as liquidacoes_receber;
  "
  # Esperado: t, t, t (all true)
  ```

- [ ] **View v_clientes_gerente existe**
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'v_clientes_gerente';"
  # Esperado: 1
  ```

- [ ] **Função registrar_liquidacao_receber existe**
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_proc WHERE proname = 'registrar_liquidacao_receber';"
  # Esperado: 1+
  ```

---

## ✅ CHECKLIST BANCO DE DADOS

### Constraints Bloqueadores
- [ ] Constraint `vendas_forma_pagamento_nao_fiado` ativo
  ```bash
  psql $DATABASE_URL -c "
    SELECT conname, consrc FROM pg_constraint 
    WHERE conname = 'vendas_forma_pagamento_nao_fiado';
  "
  # Esperado: consrc contém 'FIADO'
  ```

- [ ] Constraint `vendas_pagamentos_forma_nao_fiado` ativo
  ```bash
  psql $DATABASE_URL -c "
    SELECT conname, consrc FROM pg_constraint 
    WHERE conname = 'vendas_pagamentos_forma_nao_fiado';
  "
  # Esperado: consrc contém 'FIADO'
  ```

### RPC registrar_liquidacao_receber
- [ ] Função aceita apenas formas válidas
  ```bash
  psql $DATABASE_URL << 'EOF'
  SELECT registrar_liquidacao_receber(
    (SELECT id FROM contas_receber LIMIT 1),
    100.00,
    'DINHEIRO',
    'Teste'
  );
  -- Esperado: executa sem erro (se contas_receber existe)
  EOF
  ```

- [ ] Função rejeita FIADO (teste negativo)
  ```bash
  psql $DATABASE_URL << 'EOF'
  SELECT registrar_liquidacao_receber(
    (SELECT id FROM contas_receber LIMIT 1),
    100.00,
    'FIADO',
    'Teste FIADO'
  );
  -- Esperado: ERROR ou sucesso (depende de implementação)
  EOF
  ```

### Dados de Clientes
- [ ] Coluna `limite_credito` em `clientes` existe e é usada
  ```bash
  psql $DATABASE_URL -c "
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'clientes' AND column_name = 'limite_credito';
  "
  # Esperado: 1 linha com numeric/decimal
  ```

- [ ] Tabela `contas_receber` tem dados (se aplicável)
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM contas_receber LIMIT 1;"
  # Esperado: número >= 0
  ```

---

## ✅ CHECKLIST BACKEND/RPC

### Função finalizar_venda_transacional_canonica_v4
- [ ] Função rejeita FIADO no cabeçalho
  ```typescript
  // Teste no client TypeScript
  const { data, error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', {
    p_venda_id: 'xxx',
    p_forma_pagamento: 'FIADO', // Deve ser rejeitado
    // ... outros params
  });
  // Esperado: error.message contém 'FIADO_DESABILITADO' ou similar
  ```

- [ ] Função rejeita FIADO em split payment
  ```typescript
  const { data, error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', {
    p_venda_id: 'xxx',
    p_forma_pagamento: 'DINHEIRO', // Cabeçalho OK
    p_pagamentos: [
      { forma_pagamento: 'FIADO', valor: 100 }, // Parcela com FIADO
    ],
    // ... outros params
  });
  // Esperado: error indicando FIADO não permitido
  ```

- [ ] Função aceita formas válidas
  ```typescript
  const validFormas = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'];
  for (const forma of validFormas) {
    const { error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', {
      p_forma_pagamento: forma,
      // ... outros params
    });
    // Esperado: no error (ou erro diferente de FIADO)
  }
  ```

---

## ✅ CHECKLIST FRONTEND

### Componentes React
- [ ] **CaixaPdvMetodoPagamentoSelector** não oferece FIADO
  ```bash
  grep -n "FIADO\|fiado" pdv-importados/app/caixa/CaixaPdvMetodoPagamentoSelector.tsx
  # Esperado: 0 resultados (ou apenas em comments)
  ```

- [ ] **FinanceiroGerentePageClient** não oferece FIADO em FORMAS
  ```bash
  grep "const FORMAS" pdv-importados/app/gerente/financeiro/FinanceiroGerentePageClient.tsx
  # Esperado: não inclui 'FIADO'
  ```

- [ ] **ClienteEditarModal** aceita limite_credito
  ```bash
  grep -n "limite_crediario\|limite_credito" pdv-importados/app/gerente/clientes/ClienteEditarModal.tsx
  # Esperado: 3+ resultados (input, display, type)
  ```

### Labels de Forma de Pagamento
- [ ] Função `labelFormaPagamentoVenda` em vendaLabels.ts
  ```bash
  # Verificar se tem case FIADO:
  grep -A 2 "case 'FIADO'" pdv-importados/lib/format/vendaLabels.ts
  # Esperado: encontra case (para backward-compat) ou não encontra (removido)
  ```

- [ ] Labels não exibem FIADO como opção nova
  ```bash
  grep -r "FIADO" pdv-importados/app/caixa/ pdv-importados/app/gerente/financeiro/
  # Esperado: 0 resultados (exceto historicização)
  ```

### Tipos TypeScript
- [ ] Type `clientes` tem `limite_credito`
  ```bash
  grep "limite_credito" pdv-importados/lib/supabase/database.types.ts
  # Esperado: 3+ resultados
  ```

- [ ] Type `contas_receber` completo
  ```bash
  grep "contas_receber:" pdv-importados/lib/supabase/database.types.ts
  # Esperado: encontra type completo
  ```

---

## ✅ CHECKLIST SEGURANÇA

### Validações em Produção
- [ ] Não é possível criar venda FIADO via UI
  - [ ] PDV não oferece FIADO no seletor
  - [ ] API rejeita FIADO
  - [ ] Banco rejeita FIADO

- [ ] Histórico de vendas FIADO antigas exibe corretamente
  - [ ] Se houver vendas FIADO pré-removal, exibem com label correto
  - [ ] Relatórios de histórico funcionam

- [ ] Gestão de crédito funciona com novo sistema
  - [ ] `limite_credito` em clientes
  - [ ] `contas_receber` registra débitos
  - [ ] `liquidacoes_receber` registra pagamentos

### Testes de Integração
- [ ] Criar venda com cliente → gera contas_receber se houver fiado? (não deve)
  ```bash
  # POST /api/venda com cliente_id
  # Esperado: venda criada SEM criar contas_receber
  ```

- [ ] Liquidar título da conta a receber
  ```bash
  # POST /api/liquidar com titulo_id, valor, forma_pagamento
  # Esperado: registra liquidacao_receber corretamente
  ```

- [ ] Dashboard financeiro carrega títulos abertos
  ```bash
  # GET /api/gerente/financeiro/kpis
  # Esperado: retorna titulosAbertosCount, valorAbertoTotal
  ```

---

## ✅ CHECKLIST DATA CONSISTENCY

### Validação de Dados Históricos
- [ ] Se há vendas com forma_pagamento='FIADO' antes de migration 246:
  - [ ] Foram migradas para contas_receber? (manual review)
  - [ ] Exibem corretamente em histórico?
  - [ ] Relatórios antigos ainda funcionam?

- [ ] Clientes com limite_credito > 0:
  - [ ] Podem ser editados?
  - [ ] Limite é persistido?
  - [ ] Saldo é calculado de contas_receber?

---

## ✅ CHECKLIST PÓS-DEPLOYMENT

### Monitoramento (Primeiras 24h)
- [ ] Sem erros de "FIADO_DESABILITADO" em logs
  - Se houver: alguém tentou vender FIADO = RPC funcionando
  
- [ ] Titulosabertos no dashboard aparecem
  
- [ ] Clientes exibem corretamente

- [ ] Liquidação de títulos funciona

### Monitoramento (Primeira Semana)
- [ ] Nenhum erro de constraint "form_pagamento_nao_fiado"
  
- [ ] Sem exceções de "FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO"
  
- [ ] Relatórios de vendas por forma funcionam (sem FIADO)
  
- [ ] Relatórios financeiros funcionam

### Rollback Plan
- [ ] Backup do banco PRÉ-migration 246 disponível?
  
- [ ] Documentação de como reverter se necessário?
  
- [ ] Timeline de reversão testado?

---

## 📋 GUIA DE USO DESTE CHECKLIST

### Para Auditores
1. Execute os comandos bash/SQL conforme indicado
2. Marque ✅ quando resultado for "Esperado"
3. Registre ❌ se resultado for diferente do esperado
4. Crie issues para itens com ❌

### Para DevOps
1. Execute antes de deployment: Checklist PRÉ-IMPLEMENTAÇÃO
2. Execute logo após deployment: Checklist BANCO + BACKEND + FRONTEND
3. Monitore durante primeira semana: Checklist PÓS-DEPLOYMENT

### Para QA
1. Execute testes de integração em staging: Checklist SEGURANÇA
2. Execute em produção após deploy: Checklist DATA CONSISTENCY
3. Registre evidence de cada teste

---

## 📞 REFERÊNCIAS

- **Migração Removedora:** `/backend/supabase/migrations/246_remover_venda_fiado.sql`
- **Tabelas Substitutivas:** `/backend/supabase/migrations/035_fiado_fiscal_stub.sql`
- **Documentação Auditoria:** `/AUDITORIA_FIADO.md` e `/AUDITORIA_FIADO_DETALHADO.md`
- **Data da Auditoria:** 11/07/2026

---

## ✅ ASSINATURA

| Campo | Valor |
|-------|-------|
| Auditado por | ___________________ |
| Data | ___________________ |
| Resultado | ✅ SEGURO / ⚠️ COM RESSALVAS / ❌ COM PROBLEMAS |
| Observações | ___________________________________________________________ |

**Status Final:** _________________

---

**Mantenha este documento atualizado com cada re-audit ou change na estrutura de pagamentos.**
