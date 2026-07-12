# R2 — Cadastro de Funcionários (Operação Assistida)

> Fecha o gap R2 (`FUNCIONARIOS_CADASTRO_GAP.md`). Implementado **sem migration**,
> **sem tocar o fluxo de venda** e **sem alterar RLS/schema**. Data: 2026-07-12.

## Decisão de arquitetura: sem migration

O gap original sugeria uma migration `SECURITY DEFINER`. Optou-se por um caminho
**mais simples e seguro**: a criação e a listagem usam o **service-role**
(`createAdminClient`, já existente e `server-only`), sempre **precedidas por
`assertGerenteSession`**. O service-role ignora RLS por design, então:

- ✅ **nenhuma migration nova** (evita risco de sequência/colisão e o gate de
  "alterar schema");
- ✅ **nenhuma mudança de RLS** na tabela `usuarios`;
- ✅ **zero contato com `vendas`, comissão ou RPCs de caixa**.

## Arquivos criados

| Arquivo | Papel |
|---|---|
| `app/gerente/funcionarios/actions.ts` | Server actions: `listarFuncionarios`, `cadastrarFuncionario`, `definirFuncionarioAtivo`. |
| `app/gerente/funcionarios/FuncionariosListClient.tsx` | UI: formulário de cadastro + tabela + ativar/desativar. |
| `app/admin/funcionarios/page.tsx` | Server Component (painel AdminV2), guarda `loadAdminContext`. |
| `shared-core/navigation/routes.ts` | +`admin.funcionarios: '/admin/funcionarios'`. |
| `lib/navigation/adminV2SidebarNav.ts` | Item de menu "Funcionários" (ícone `UserCog`). |
| `src/lib/i18n/pt.json` / `zh.json` | Namespace `funcionarios` (paridade pt/zh). |

## Fluxo implementado

```
Gerente (login)
  └─ /admin/funcionarios  (assertGerenteSession / loadAdminContext)
       ├─ Cadastrar: nome, e-mail, perfil (OPERADOR|GERENTE), senha temporária
       │    └─ createAdminClient().auth.admin.createUser(...)  → auth.users
       │    └─ insert em public.usuarios (id, nome, perfil, loja_id herdada)
       │    └─ rollback (deleteUser) se o insert de perfil falhar
       ├─ Listar: usuários da mesma loja_id do gerente
       └─ Ativar/Desativar: usuarios.ativo (não permite auto-desativar)
  └─ Funcionário faz login → acessa /caixa (fluxo existente, intacto)
```

## Regras de permissão

- Rota/ações guardadas por `assertGerenteSession` (GERENTE/DONO/ADMIN).
- **Somente DONO** cadastra perfil `GERENTE`; gerente comum cadastra só `OPERADOR`
  (opção "Gerente" só aparece para DONO).
- **`loja_id` herdada** do gerente criador → isolamento multi-loja preservado.
- Gerente não pode **desativar a própria conta**.

## Segurança

- `createAdminClient` é `server-only` (`import 'server-only'`); o
  `SUPABASE_SERVICE_ROLE_KEY` nunca vai para o cliente.
- Toda ação valida a sessão **antes** de instanciar o service-role.
- Senha é temporária; o aviso na UI orienta troca no primeiro acesso.

## Pré-requisito de deploy (ação do responsável)

> ⚠️ **Não aplicado em produção por mim.** A funcionalidade exige a env var
> **`SUPABASE_SERVICE_ROLE_KEY`** no ambiente do Next (Vercel → Project Settings →
> Environment Variables). Sem ela, `cadastrarFuncionario`/`listarFuncionarios`
> retornam erro controlado (não quebram a tela). Verificar se já está configurada
> (é usada por outras rotas admin) antes do go-live.

## Validações executadas

- 🟢 **Typecheck** (`tsc --noEmit`): PASS
- 🟢 **Build** (`next build`): PASS — `/admin/funcionarios` gerada como rota dinâmica (ƒ)
- 🟢 **guard:routes**: PASS (23 rotas /admin com página)
- 🟢 **guard:all** exceto `guard:core` (falha **pré-existente**, não tocada)
- Não altera `guard:core`, testes históricos, `vendas`, comissão nem RPC de venda.

## O que NÃO foi feito (proposital)

- Nenhuma migration / mudança de RLS.
- Nenhuma criação de usuário real em produção.
- Sem reset de senha / e-mail de convite automático (pode ser um incremento
  futuro: `inviteUserByEmail` em vez de senha temporária).

## Teste manual sugerido (pós-deploy, com service-role configurada)

1. Login como DONO → menu **Funcionários** → cadastrar um OPERADOR.
2. Logout → login com o operador → confirmar acesso ao `/caixa`.
3. Voltar como gerente → **Desativar** o operador → confirmar que perde acesso.
4. Tentar cadastrar e-mail duplicado → mensagem "Já existe um usuário com esse e-mail".
