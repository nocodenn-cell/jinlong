# Auditoria Frente 6 — Coerência Tela ↔ Backend

> Comparação Tela → Hook → Action/RPC → Tabela → Auditoria → Permissão.
> Análise de código (leitura), sem alteração. Evidência: `app/admin/*`, `app/gerente/*`,
> `lib/admin/*`. Gerado por Hermes em 2026-08-03.

## Método

Para cada tela-admin revisada, subiu-se o fluxo:
`page.tsx` (Server Component) → `_components/*Client.tsx` (Hook/estado) → `actions.ts`
(Server Action) → tabela Supabase → (ausência de) trilha → `adminPolicy` (permissão).

Telas revisadas com evidência de código: **Catálogo, Clientes, Fornecedores, Funcionários,
Compras, Configurações, Comissões, Financeiro (contas-pagar)**. Demais telas (Dashboard,
Relatórios, Estoque) revisadas por fluxo compartilhado ou dado (F3).

## Achados confirmados

### F6-CMP-001 — Campo `% de comissão` existe no banco mas NÃO tem interface (sem persistência)
- **Tela:** `app/admin/funcionarios/FuncionarioEditarModal.tsx`
- **Action:** `app/admin/funcionarios/actions.ts` (`CreateSchema` l.31-37, `UpdateSchema` l.39-45)
- **Tabela:** `usuarios.comissao_percentual` (migration com `CHECK (comissao_percentual BETWEEN 0 AND 100)`, confirmado na F2)
- **Evidência:** o modal renderiza só `nome, email, perfil, idioma, senha`. O `UpdateSchema`
  valida só `id, nome, perfil, idioma_preferido, senhaNova`. O `update()` (l.230-238) grava
  só `nome/perfil/idioma_preferido`. **Nunca há `comissao_percentual` no payload.**
- **Classificação:** 🔴 CAMPO SEM PERSISTÊNCIA (órfão de interface)
- **Impacto:** não é possível definir a comissão de um funcionário pela tela; o campo fica
  sempre no default do banco. Quebra o fechamento de comissões (Frente Comissões).
- **Correção:** adicionar campo `% comissão` ao modal + ao schema + ao `update()`.

### F6-PER-001 — Rotas `configuracoes` e `suspensao` FORA da policy (permissão implícita)
- **Tela:** `app/admin/configuracoes/page.tsx`, `app/admin/suspensao/page.tsx`
- **Policy:** `lib/admin/policy/adminPolicy.ts` — `RESOURCE_PROFILES` (l.66-80) lista 22 rotas,
  **não inclui** `route:/admin/configuracoes` nem `route:/admin/suspensao`.
- **Evidência:** `canAccessResource(s, res)` → `hasAllowedPerfil(s, RESOURCE_PROFILES[res])`.
  Para essas rotas `RESOURCE_PROFILES[res]` é `undefined` → retorna `false`. Porém o
  `middlewareAdminDecision` libera qualquer `/admin` via `canAccessAdmin` (l.112/118), e a
  página não usa o flag `permissions.resources[...]` para bloquear escrita.
- **Classificação:** 🔴 PERMISSÃO IMPLÍCITA / NÃO DECLARADA (risco de governança)
- **Impacto:** acesso decide por "é admin?" sem granularidade. Se um dia a página passar a
  checar o flag (false), vira bloqueio silencioso; hoje, é acesso sem regra. Incoerência
  entre o que a policy calcula (false) e o que o middleware permite (true).
- **Correção:** declarar `route:/admin/configuracoes` e `route:/admin/suspensao` em
  `RESOURCE_PROFILES` (perfil alvo) — ou remover a chamada `canAccessResource` da página.

### F6-AUD-001 — Ações de cadastro sem trilha de auditoria
- **Telas:** Fornecedores, Clientes, Funcionários
- **Actions:** `salvarFornecedorAction`, `excluirFornecedorAction`, `atualizarClienteAction`,
  `atualizarFuncionarioAction`, `definirAtivoFuncionarioAction`
- **Evidência:** nenhuma das actions grava em `produtos_auditoria` / `venda_eventos` /
  tabela de auditoria de cadastro (confirmado por leitura — só `revalidarDominio`).
- **Classificação:** 🟡 AÇÃO SEM AUDITORIA (conecta F5 — NÃO VALIDADO)
- **Impacto:** alteração/exclusão de cadastro mestre não é rastreável (F5: cadastro 0%).
- **Correção:** ver `GO_LIVE_TICKETS_F5_TRILHA.md` (validação antes de corrigir).

### F6-INF-001 — Tela de Configurações mostra PDV "vazio" sem sinalizar ausência
- **Tela:** `app/admin/configuracoes/page.tsx` (l.42-52) → `pdvConfig ?? null`
- **Tabela:** `pdv_config` (F1: só 2/7 lojas têm linha)
- **Evidência:** o Server Component passa `pdvConfig: pdvConfig ?? null`. O client renderiza
  a aba PDV com valores nulos/zero como se fossem configuração real, sem banner
  "esta loja não tem configuração de PDV".
- **Classificação:** 🟡 TELA MOSTRA INFORMAÇÃO AMBÍGUA (falsa por omissão)
- **Impacto:** operador pode achar que o PDV está configurado quando não está → erro fiscal
  em emissão (conecta F1: `auto_enqueue_fiscal=false` default).
- **Correção:** banner/estado visual quando `pdvConfig === null`.

---

## Item NÃO confirmado nesta amostra

### Botão sem implementação
- **Busca:** grep por `onClick={() => {}}`, `alert(`, `href="#"`, `disabled` sem `title`,
  `TODO`/`em breve` em `app/admin/**/*.tsx` → **0 resultados**.
- **Conclusão:** não foram encontrados botões placeholder na amostra revisada. Recomenda-se
  varredura automatizada (script `check-entity-ssot` + lint de `onClick` vazio) antes do
  Go-Live para confirmar ausência em 100% das telas. **Status: ⚪ NÃO VALIDADO** (não é
  falha confirmada).

---

## Matriz de coerência (resumo)

| Tela | Hook/Action | Tabela | Auditoria | Permissão | Estado |
|---|---|---|:--:|:--:|---|
| Funcionários | `atualizarFuncionarioAction` | `usuarios` | ❌ | ✅(policy) | 🔴 campo `comissao_percentual` órfão |
| Configurações | `atualizarConfiguracoesPdvAction` | `pdv_config` | ❌ | ⚠️ fora policy | 🔴 rota implícita + info ambígua |
| Suspensão | — | — | ❌ | ⚠️ fora policy | 🔴 rota implícita |
| Fornecedores | `salvarFornecedorAction` | `fornecedores` | ❌ | ✅ | 🟡 sem auditoria |
| Clientes | `atualizarClienteAction` | `clientes` | ❌ | ✅ | 🟡 sem auditoria |
| Compras | `registrarRecebimentoOC` | `ordens_compra`+estoque | ❌ | ✅ | 🟡 sem auditoria (fluxo OK) |
| Comissões | `carregarResumoComissoes` | RPC | n/a | ✅ | 🟡 % sem UI (F6-CMP-001) |

## Conclusão técnica

A coerência Tela↔Backend é **parcialmente saudável no fluxo de escrita** (actions gravam
nas tabelas certas, com guarda de sessão e validação Zod), mas apresenta **lacunas de
governança e de interface** que impedem Go-Live seguro:

- **2 falhas confirmadas (🔴):** campo de comissão órfão de interface (F6-CMP-001) e
  rotas `configuracoes`/`suspensao` fora da policy de permissão (F6-PER-001).
- **2 riscos (🟡):** ações de cadastro sem trilha (F6-AUD-001, conecta F5) e tela de
  configurações exibindo PDV vazio sem sinalizar (F6-INF-001).
- **1 item não validado (⚪):** botão sem implementação — não encontrado na amostra,
  exige varredura automatizada para confirmar em 100% das telas.

**Não se confunda ausência de teste com defeito:** as telas de cadastro *funcionam* (gravam),
o problema é que **não gravam auditoria** (F5) e que **um campo e duas rotas escaparam da
política declarada**. O mapa de correções para o Claude Code está em
`tickets/GO_LIVE_TICKETS_F6_COHERENCIA.md`.

➡️ Fila de tickets: `docs/auditoria/tickets/GO_LIVE_TICKETS_F6_COHERENCIA.md`
