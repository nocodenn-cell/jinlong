# Tickets Frente 6 — Coerência Tela ↔ Backend

> Gerado por Hermes. Apenas itens **confirmados por leitura de código** viraram ticket de
> correção. O item "botão sem implementação" permanece como ticket de VALIDAÇÃO (não há
> falha confirmada).

**Status de todos:** `OPEN`

---

## TICKET F6-CMP-001 🔴
**Título:** Campo `% de comissão` órfão de interface (sem persistência)
**Categoria:** Funcionários / Comissões
**Severidade:** 🔴 Bloqueante (fecha Comissões)
**Problema:** `usuarios.comissao_percentual` existe no banco (CHECK 0-100) mas
`FuncionarioEditarModal.tsx` e `actions.ts` (`CreateSchema`/`UpdateSchema`) não o incluem.
Impossível definir comissão pela tela.
**Evidência:** `app/admin/funcionarios/FuncionarioEditarModal.tsx` (sem campo);
`app/admin/funcionarios/actions.ts` l.31-45 (schemas sem `comissao_percentual`);
`update()` l.230-238 (payload sem `comissao_percentual`).
**Local provável:** `FuncionarioEditarModal.tsx` + `actions.ts` (schemas + update/insert).
**Critério de aceite:** ao editar funcionário, campo `% comissão` (0-100) visível e gravado
em `usuarios.comissao_percentual`; `carregarResumoComissoes` passa a usar o valor real.
**Status:** OPEN

---

## TICKET F6-PER-001 🔴
**Título:** Rotas `configuracoes` e `suspensao` fora da política de permissão
**Categoria:** Governança / Permissão
**Severidade:** 🔴 Bloqueante (governança)
**Problema:** `RESOURCE_PROFILES` não declara essas rotas. `canAccessResource` retorna
`false`, mas o middleware libera por `canAccessAdmin` e a página não bloqueia → acesso
sem regra declarada (implícito).
**Evidência:** `lib/admin/policy/adminPolicy.ts` l.66-80 (sem as rotas);
`canAccessResource` l.111-114; `middlewareAdminDecision` l.116-119.
**Local provável:** `lib/admin/policy/adminPolicy.ts` (`RESOURCE_PROFILES`).
**Critério de aceite:** ambas as rotas declaradas em `RESOURCE_PROFILES` com perfil alvo
explícito; `loadAdminContext` da página passa a refletir acesso correto.
**Status:** OPEN

---

## TICKET F6-AUD-001 🟡
**Título:** Ações de cadastro sem trilha de auditoria
**Categoria:** Auditoria (conecta F5)
**Severidade:** 🟡 Alto risco
**Problema:** `salvarFornecedorAction`, `atualizarClienteAction`, `atualizarFuncionarioAction`,
`definirAtivoFuncionarioAction` não gravam em tabela de auditoria.
**Evidência:** leitura das actions (só `revalidarDominio`); conecta F5 (cadastro 0%).
**Local provável:** `app/gerente/*/actions.ts`, `app/admin/*/actions.ts`.
**Critério de aceite:** após validação F5, cadastros gravam trilha (ver F5-VAL-01..04).
**Status:** OPEN (depende de F5)

---

## TICKET F6-INF-001 🟡
**Título:** Tela de Configurações exibe PDV vazio sem sinalizar ausência
**Categoria:** Configurações / UX
**Severidade:** 🟡 Alto risco
**Problema:** `pdvConfig ?? null` renderiza aba PDV com valores nulos/zero como se fossem
configuração real (5/7 lojas não têm `pdv_config` — F1).
**Evidência:** `app/admin/configuracoes/page.tsx` l.42-52.
**Local provável:** `ConfiguracoesContent.tsx` (aba PDV).
**Critério de aceite:** banner/estado visual quando `pdvConfig === null` ("loja sem
configuração de PDV").
**Status:** OPEN

---

## TICKET F6-VAL-001 ⚪
**Título:** Validar ausência de botões sem implementação em 100% das telas
**Categoria:** Varredura / Validação
**Severidade:** ⚪ NÃO VALIDADO
**Problema:** na amostra revisada (8 telas) não foram encontrados botões placeholder, mas
não houve varredura automatizada de todas as telas.
**Evidência:** grep em `app/admin/**/*.tsx` por `onClick={() => {}}`/`alert`/`href="#"`→ 0.
**Local provável:** script `scripts/check-entity-ssot-boundary.mjs` (estender) ou lint.
**Critério de aceite:** script que varre todas as telas e lista qualquer botão cujo handler
não resolva para uma action/RPC existente.
**Status:** OPEN

---

## RESUMO

| ID | Tipo | Severidade | Título curto |
|---|---|:--:|---|
| F6-CMP-001 | Correção | 🔴 | Comissão % órfão de interface |
| F6-PER-001 | Correção | 🔴 | Rotas configuracoes/suspensao fora da policy |
| F6-AUD-001 | Correção | 🟡 | Cadastros sem auditoria (F5) |
| F6-INF-001 | Correção | 🟡 | Config PDV vazio sem sinalizar |
| F6-VAL-001 | Validação | ⚪ | Botão sem impl (varredura global) |

**Total:** 5 tickets · 2 🔴 (correção) · 2 🟡 (correção) · 1 ⚪ (validação).
**Nenhuma falha inventada:** itens não confirmados por código ficaram como validação.
