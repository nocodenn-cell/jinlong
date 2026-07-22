# GO-LIVE checklist — primeiro cliente FastProduct

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Gate oficial (UI)** | `/admin/implantacao` — persistido em `implantacao_checklists` / `implantacao_checklist_itens` (migração 272) |
| **Complementa** | [homologacao_comercial_checklist.md](./homologacao_comercial_checklist.md) · [RUNBOOK_PRIMEIRO_CLIENTE.md](../RUNBOOK_PRIMEIRO_CLIENTE.md) |
| **Auditoria telas** | [SCREENS_100_AUDIT.md](./SCREENS_100_AUDIT.md) |

> **SSoT operacional:** o checklist abaixo é referência. O registro de implantação e a
> autorização de GO-LIVE ocorrem na tela `/admin/implantacao` (status, responsável,
> data/hora, observações). GO só libera com itens obrigatórios concluídos (+ grupo fiscal).

---

## 1. Funcionalidades existentes (escopo go-live)

- Login com perfis DONO / GERENTE / OPERADOR
- Cadastros: clientes, fornecedores, produtos, categorias
- Estoque: ajuste, recebimento, transferência, import NF-e
- PDV: abrir caixa, vender, sangria/suprimento, fechar caixa
- Financeiro: contas a receber/pagar, liquidação, pagamento, cancelamento AP, fila fiscal
- Comissões, relatórios, auditoria, configurações da loja

## 2. Funcionalidades homologadas (técnico)

| Check | Comando / evidência | Estado |
|-------|---------------------|--------|
| Typecheck app | `cd pdv-importados && npx tsc --noEmit` | Verde (missão) |
| Guard domínio | `npm run guard:domain` | Verde |
| Entity-ssot | `npm run check:entity-ssot` (se tocar CRUD) | Verde esperado |
| Unit financial readers | `vitest` payable/receivable readers | Verde |
| Unit cash movement reader | `vitest` cashMovementReader | Verde |
| Domínios 100 | products/inventory/customers audits | GO |
| Cash/Financial | cash_100 / financial_100 | GO piloto |

## 3. Checklist funcional (humano — ambiente real)

### Provisionamento (wizard interno + UI)

- [ ] Loja nova via `/admin/provisionamento` (ADMIN; não Matriz de teste)
- [ ] DONO criado pelo wizard (Auth + `public.usuarios`)
- [ ] GERENTE/OPERADOR via `/admin/funcionarios`
- [ ] DONO/GERENTE → `/admin/dashboard`; OPERADOR → `/caixa`
- [ ] Conta `ativo=false` bloqueia login
- [ ] Checklist `/admin/implantacao` reconhece a loja provisionada

### Operação (sem SQL / sem Studio)

- [ ] Login
- [ ] Abrir caixa
- [ ] Cadastrar cliente (`/admin/clientes`)
- [ ] Cadastrar produto (`/admin/catalogo`) com estoque inicial se necessário
- [ ] Entrada/ajuste estoque
- [ ] Venda (DINHEIRO e PIX)
- [ ] Recebimento / liquidação AR (se título gerado)
- [ ] Contas a pagar — pagar e cancelar (amostra)
- [ ] Comissão — visualizar / marcar paga (se aplicável)
- [ ] Fechar caixa com conferência \(E(c)\)
- [ ] Relatórios + auditoria mostram eventos
- [ ] Fila fiscal consulta status sem erro de UI
- [ ] i18n pt/zh nas telas críticas

### Proibido no go-live

- [ ] Não usar SQL ad-hoc para “consertar” venda/estoque
- [ ] Não criar perfil em `public.perfis`
- [ ] Não cadastrar cliente completo no PDV
- [ ] Não reabrir ajuste de estoque no form de produto pós-criação

## 4. Pendências

| Item | Bloqueia go-live? |
|------|-------------------|
| UI Funcionários / Provisionamento | **Não** (já na UI ADMIN) |
| D-F1 criarCliente no financeiro | Não (não expandir) |
| D-C1 abertura INSERT | Não |
| E2E sem secrets no CI | Não para piloto local/preview com credenciais |

## 5. Riscos

| Risco | Severidade | Contenção |
|-------|------------|-----------|
| Usuário criado só no Auth sem `usuarios` | Alta | Runbook + login bloqueia |
| Dados de teste na loja do cliente | Alta | Loja dedicada |
| E2E não rodado no ambiente alvo | Média | Rodar golden + abrir/fechar + Fase 5b |
| Expectativa de self-service de funcionários pelo cliente | Média | DONO usa `/admin/funcionarios`; provisionamento inicial é interno |

## 6. GO / NO-GO

| Critério | Resultado |
|----------|-----------|
| Telas operacionais críticas integradas no caminho canônico | **GO** |
| Provisionamento loja+DONO pela UI (ADMIN) | **GO** (`/admin/provisionamento`) |
| Funcionários OPERADOR/GERENTE pela UI | **GO** (`/admin/funcionarios`) |
| Go-live piloto com checklist `/admin/implantacao` | **GO condicional** |

**Decisão recomendada:** **GO** para Fase 1 (provisionamento + checklist). Liberar primeiro cliente após checklist humano §3 e autorização GO-LIVE na UI.
