# 📋 Regra Arquitetural: Checklist para Novas Colunas no Schema

**Data**: 2026-07-11  
**Status**: ✅ ATIVO  
**Origem**: Auditoria de vendas_em_espera (cliente_id e rótulo)  
**Propósito**: Evitar dados órfãos e campos fantasma

---

## 🎯 O Problema

Durante a auditoria de `vendas_em_espera`, identificamos:

1. **`cliente_id`**: Coluna persistida no banco, RPC aceita parâmetro, RPC retorna o valor
   - ❌ Sem UI de captura
   - ❌ Sempre NULL (hardcoded no TypeScript)
   - ❌ Não restaurado ao retomar venda
   - ❌ Débito técnico Fase 7

2. **`rótulo`**: Coluna persistida no banco, RPC retorna o valor
   - ❌ Sem UI para editar/capturar
   - ❌ Não restaurado ao retomar venda
   - ❌ Sem consumidor final
   - ✅ **RESOLVIDO**: Removido do aplicativo (coluna mantida no banco como dado órfão)

**Raiz**: Campos foram adicionados ao schema sem validar o fluxo completo: criação → persistência → restauração → consumo.

---

## ✅ Checklist para Novas Colunas

Quando adicionar uma nova coluna a qualquer tabela, validar **todos os 7 pontos**:

### 1. ✓ Migration Criada
- [ ] Coluna adicionada ao schema com tipo e constraints corretos
- [ ] Arquivo: `backend/supabase/migrations/XXX_*.sql`
- [ ] Validar: nullable vs not null, default, references

### 2. ✓ RPC Recebe o Campo
- [ ] RPC de criação/atualização aceita o parâmetro
- [ ] Parâmetro é persistido (não hardcoded como NULL)
- [ ] Exemplo: `colocar_venda_em_espera(p_cliente_id uuid, ...)`

### 3. ✓ RPC Retorna o Campo (Se Necessário)
- [ ] Se o campo é necessário para restaurar ou listar: RPC retorna
- [ ] Se é apenas auditoria: RPC pode omitir, MAS documentar por que
- [ ] Exemplo: `retomar_venda_em_espera()` retorna `cliente_id`
- [ ] Exemplo: `listar_vendas_em_espera()` **não** retorna `cliente_id` (TODO Fase 7)

### 4. ✓ TypeScript Type Possui o Campo
- [ ] Types backend incluem o novo campo
- [ ] Input type: `ColocarEmEsperaInput { clienteId?: string | null }`
- [ ] Output type: `RetomarEmEsperaResult { clienteId?: string | null }`
- [ ] Card type: `VendaEmEsperaCard { clienteId?: string | null }`

### 5. ✓ Estado Frontend Consome ou Justifica Não Consumir
- [ ] Estado global/local captura o campo
- [ ] Ou: Documentar claramente por que não captura
- [ ] Exemplo ✅: `caixa_id` não restaurado (caixa pode ter fechado)
- [ ] Exemplo ✅: `desconto_gerente_percentual` não restaurado (token expirado)
- [ ] Exemplo ❌: `cliente_id` (TODO Fase 7, sem justificativa clara hoje)

### 6. ✓ UI Exibe ou Documenta Motivo de Não Exibir
- [ ] Se campo é importante: UI o exibe
- [ ] Se não exibe: Comentário no código explicando por que
- [ ] Exemplo ✅: `operador_id` não é exibido (é segurança RLS)
- [ ] Exemplo ✅: `status` não é exibido (gerenciado internamente)
- [ ] Exemplo ❌: `rótulo` exibido mas sem captura (inconsistência)

### 7. ✓ Teste Cobre o Fluxo Completo
- [ ] Teste E2E: criar com o campo
- [ ] Teste E2E: validar persistência
- [ ] Teste E2E: validar recuperação/retomada
- [ ] Teste E2E: validar UI exibe/não exibe corretamente
- [ ] Nota: Em ambiente remoto, fazer análise estática de código como alternativa

---

## 📊 Matriz de Conformidade: Exemplo (vendas_em_espera)

| Campo | 1.Migration | 2.RPC Recebe | 3.RPC Retorna | 4.TS Type | 5.Estado | 6.UI | 7.Teste | Status |
|-------|------------|-------------|---------------|-----------|---------|------|---------|--------|
| id | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ OK |
| cliente_id | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ FAIL |
| rótulo | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ FAIL |
| caixa_id | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ OK* |
| desconto_gerente_* | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ OK* |

**Legenda**:
- ✅ OK: Implementado e funcional
- ⚠️ OK*: Parcial mas intencional (justificativa documentada)
- ❌ FAIL: Faltando (débito técnico)

---

## 🔧 Como Usar Este Checklist

### Antes de Fazer Commit
```bash
# Para cada nova coluna adicionada:
git diff HEAD -- backend/supabase/migrations/
# Validar: pontos 1, 2, 3 (migration + RPC)

git diff HEAD -- pdv-importados/app/
# Validar: pontos 4, 5, 6 (types + estado + UI)

# Validar: ponto 7 (testes)
npm test -- --testPathPattern=venda-espera
```

### Antes de Fazer PR
- Incluir checklist preenchido na descrição do PR
- Se algum ponto for ⚠️ (parcial): documentar justificativa no código
- Se algum ponto for ❌ (faltando): criar débito técnico formal

### Exemplo de Descrição de PR
```markdown
## Checklist de Novas Colunas

- [x] 1. Migration criada
- [x] 2. RPC recebe o campo
- [x] 3. RPC retorna o campo
- [x] 4. TypeScript type possui o campo
- [x] 5. Estado frontend consome
- [x] 6. UI exibe
- [x] 7. Teste cobre fluxo completo

Todos os pontos validados ✅
```

---

## 📌 Casos de Estudo

### ❌ ANTES: cliente_id (Débito Técnico)

| Ponto | Validação | Status |
|-------|-----------|--------|
| 1. Migration | ✅ Criada | OK |
| 2. RPC Recebe | ✅ Sim | OK |
| 3. RPC Retorna | ✅ Sim | OK |
| 4. TS Type | ❌ Não | FAIL — Débito |
| 5. Estado FE | ❌ Não | FAIL — Débito |
| 6. UI | ❌ Não | FAIL — Débito |
| 7. Teste | ❌ Não | FAIL — Débito |

**Conclusão**: 3/7 pontos. Campo órfão. Criado como TODO Fase 7.

---

### ❌ ANTES: rótulo (Removido)

| Ponto | Validação | Status |
|-------|-----------|--------|
| 1. Migration | ✅ Criada | OK |
| 2. RPC Recebe | ✅ Sim | OK |
| 3. RPC Retorna | ✅ Sim | OK |
| 4. TS Type | ✅ Sim | OK |
| 5. Estado FE | ❌ Não | FAIL — Sempre NULL |
| 6. UI | ✅ Exibido | OK |
| 7. Teste | ❌ Não | FAIL |

**Conclusão**: 5/7 pontos. Sem captura, sem retomada. Resolvido: removido do aplicativo (auditoria 2026-07-11).

---

### ⚠️ PARCIAL OK: caixa_id (By Design)

| Ponto | Validação | Status | Justificativa |
|-------|-----------|--------|---------------|
| 1. Migration | ✅ Criada | OK | — |
| 2. RPC Recebe | ✅ Sim | OK | — |
| 3. RPC Retorna | ✅ Sim | OK | — |
| 4. TS Type | ✅ Sim | OK | — |
| 5. Estado FE | ⚠️ Captura, não restaura | OK* | Caixa pode ter fechado |
| 6. UI | ✅ Exibido | OK | — |
| 7. Teste | ⚠️ Parcial | OK* | Fluxo de fechamento não testado |

**Conclusão**: 5/7 completos + 2 parciais justificados. Campo funcional com limitação esperada.

---

## 🚫 O Que Evitar

❌ **Não fazer**:
- Adicionar coluna sem planejar o fluxo completo
- RPC retorna campo que TypeScript descarta silenciosamente
- UI exibe campo sem captura correspondente
- Deixar TODO sem débito técnico formal
- Assumir que "é apenas dados de auditoria" sem documentar

✅ **Fazer**:
- Validar checklist **antes** de commitar
- Documentar parcialidades (e por que são parciais)
- Criar débito técnico formal se faltarem pontos
- Revisar em code review: "Todos os 7 pontos foram validados?"

---

## 📎 Referências

- **Auditoria que originou**: `CONCLUSOES_AUDITORIA_FINAL.md`
- **Débito técnico cliente_id**: `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`
- **Análise cliente_id**: `AUDITORIA_CLIENTE_ID_VENDAS_EM_ESPERA.md`
- **Varredura de campos**: `VARREDURA_CAMPOS_VENDAS_EM_ESPERA.md`

---

## 💬 Notas

- Este checklist é **obrigatório** para novas colunas no schema
- Aplicável a todas as tabelas: `vendas_em_espera`, `caixas`, `itens_carrinho`, etc.
- Revisar a cada sprint se novas colunas foram adicionadas
- Usar como referência em code reviews: "Todos os 7 pontos foram validados?"

---

**Documento criado**: 2026-07-11  
**Origem**: Lição aprendida da auditoria de vendas_em_espera  
**Aplicabilidade**: Projeto FastProduct (PDV Jinlong)
