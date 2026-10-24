# Sprint — Publicação do Hub Jinlong (`hub.jinlong.app`)

Data: 2026-10-23 · Orçamento: R$ 0,00 (Vercel Hobby/plano atual, DNS já na Vercel) · Sem deploy em Production, sem merge, sem alteração de dados.

## 1. Projeto Vercel — reutilizado

| Item | Estado |
|---|---|
| Projeto | `jinlong/nature-code-hub` (`prj_1LtB5CBAoOm5cLjfOd2shDNWXYXb`), Root Directory `hub`, região `gru1` |
| Production | **nunca publicado** (`live: false`; todos os deploys de `main` cancelados pelo `ignoreCommand`, pois `hub/` não mudou) |
| Proteção | Vercel Authentication em tudo, exceto domínios próprios (`all_except_custom_domains`) |
| Preview desta branch | `nature-code-hub-git-claude-sweet-galileo-a44eb7-jinlong.vercel.app` — READY |

## 2. Domínio e variáveis

Feito nesta sprint:
- `hub.jinlong.app` **adicionado** ao projeto. O DNS de `jinlong.app` já está na Vercel (sem conflito). Enquanto não houver deploy de Production, o domínio não serve o app.
- `HUB_SUPABASE_URL` e `HUB_SUPABASE_ANON_KEY` adicionadas em **Preview**, com os mesmos valores de Production. Antes estavam só em Production.
- ERP (`pdv-importados`): `NEXT_PUBLIC_HUB_URL` específico da branch `claude/sweet-galileo-a44eb7` (Preview) = URL do hub em Preview.

Já existia (criado por outra pessoa/sessão antes desta sprint):
- ERP: `NEXT_PUBLIC_HUB_URL=https://hub.jinlong.app` em **Preview e Production**. Fica inerte até o PR #632 estar em produção.

Supabase do hub = mesmo projeto do ERP (`kbabmewnahysfvlybiak`), só com anon key. O hub não usa service role.

## 3. Validações

| Verificação | Como | Resultado |
|---|---|---|
| Build | Deploy de Preview na Vercel; local: `tsc`, `vitest`, `next build` | Preview READY; tsc ok; 19/19 testes |
| Migration do hub em produção | `supabase_migrations.schema_migrations` | aplicada (`20261021115705`) |
| RLS | `pg_class.relrowsecurity` | ligada nas 4 tabelas `commercial_*` |
| Admins cadastrados | `count(commercial_admins)` | 1, sem vínculo de loja no ERP (cai no ramo do PR #632) |
| Privilégios | `has_*_privilege` | `anon` sem EXECUTE em `is_commercial_admin` e sem SELECT em leads; `authenticated` não lê `commercial_admins` |
| Usuário comum (DONO do ERP) no banco do hub | `set role authenticated` + claims, transação read-only | `is_commercial_admin=false`, 0 leads, 0 eventos, 0 clientes |
| Admin da plataforma nos dados do ERP | idem | 0 `usuarios`, 0 `vendas` (isolamento nos dois sentidos) |
| `anon` lendo leads | `set role anon` | `permission denied` |
| Hub sem sessão | GET `/`, `/leads` no Preview | vai para `/login` |
| Cookie forjado (JWT com assinatura inválida, exp 2099) | GET `/`, `/leads`, `/clientes` | 307 → `/login?e=forbidden` (o Supabase rejeita, o hub não confia no cookie) |
| Cabeçalhos | resposta do Preview | `noindex`, `no-store`, `X-Frame-Options: DENY`, HSTS |
| Aviso de origem | GET `/login?origem=jinlong` | mensagem para o admin da plataforma exibida |

## 4. Integração ERP → hub em Preview — **não executável hoje**

O Preview do ERP é desligado de propósito (`pdv-importados/scripts/vercel-ignore.sh`): as variáveis de Preview do ERP apontam para o Supabase de **produção**, e liberar exige antes um Supabase de homologação. O redeploy foi cancelado por esse motivo. Não alterei essa política.

O que cobre a integração hoje:
- Testes de comportamento do `LoginForm` (5 cenários: admin → hub, sem papel → erro, hub não configurado → inerte, gerente → painel, caixa → PDV).
- A ponta do hub validada em Preview, conforme acima.

Login real ponta a ponta (com senha) não foi feito: exige uma conta admin de teste, e criá-la alteraria dados de produção. Fica para o primeiro acesso do admin, logo após a ativação.

## 5. Pendências e passos para ativação (exigem autorização)

1. **Merge do PR #632.** O ERP de Production já tem `NEXT_PUBLIC_HUB_URL=https://hub.jinlong.app`; o redirecionamento entra no próximo deploy do ERP.
2. **Primeiro deploy de Production do hub.** O `ignoreCommand` só constrói se `hub/` mudou no commit. Use `vercel link --scope jinlong --project nature-code-hub` e depois `vercel deploy --prod`, ambos dentro de `hub/`, ou o botão Redeploy de um deploy de `main` no painel. A partir daí, `hub.jinlong.app` serve o login.
3. **Smoke em produção** (5 min, pela pessoa admin):
   1. Em `jinlong.app`, clicar em "Entrar no Jinlong" e entrar com a conta admin. Deve cair em `hub.jinlong.app/login?origem=jinlong`.
   2. Confirmar a senha. Deve abrir a lista de leads.
   3. Entrar com uma conta de loja. Deve seguir para o ERP normalmente.
   4. Abrir `hub.jinlong.app` com uma conta de loja. Deve mostrar "sem acesso de administrador".
4. **Opcional:** remover a variável específica da branch no ERP depois do merge:
   `vercel --scope jinlong env rm NEXT_PUBLIC_HUB_URL preview claude/sweet-galileo-a44eb7 --project pdv-importados`.
5. **Futuro:** Supabase de homologação (custo) para liberar o Preview do ERP e testes E2E com contas de teste.

## Rollback

- Hub: remover `hub.jinlong.app` do projeto, ou não promover o deploy.
- ERP: remover `NEXT_PUBLIC_HUB_URL` de Production e redeploy. O login volta ao comportamento antigo ("conta não vinculada").
