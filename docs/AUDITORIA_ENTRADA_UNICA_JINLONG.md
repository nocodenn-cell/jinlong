# Jinlong Control Center — entrada única pelo "Entrar no Jinlong"

Data: 2026-10-23 · Orçamento adicional: R$ 0,00 · Nada aplicado em produção (sem deploy, merge ou migration).

## 1. Auditoria (estado encontrado)

| Peça | Onde | Autenticação | Destino |
|---|---|---|---|
| Site comercial `jinlong.app` | `site/` | Nenhuma (só links) | Botão "Entrar no Jinlong" (header, menu mobile, rodapé) → `erpHref('/login')` = `https://app.jinlong.app/login` (`site/lib/erpLinks.ts`). Links antigos `/login`, `/admin`… redirecionam ao ERP (`site/lib/erpRedirects.ts`, inerte sem `ERP_REDIRECT_ORIGIN`). |
| ERP / PDV | `pdv-importados/` | Supabase Auth no navegador (`LoginForm.tsx`), cookies do `@supabase/ssr`, middleware em `/admin`, `/gerente`, `/caixa` (`adminPolicy.middlewareAdminDecision`) | Perfil em `public.usuarios`: `GERENTE`/`DONO`/`ADMIN` → `/admin/dashboard`; demais (ex.: `CAIXA`) → `/caixa`. Sem linha em `usuarios` → erro "conta não vinculada". `?next=` restrito a `/admin|/gerente|/caixa` (sem open redirect). |
| Painel gerencial da plataforma (hub comercial) | `hub/` (app Next separado, projeto Vercel próprio, **ainda não publicado**) | Supabase Auth via server action, tokens em cookies `httpOnly` + `SameSite=Strict` do próprio domínio; papel checado em toda página por `rpc/is_commercial_admin` (mesma função da RLS); sem service role | `/` (leads, clientes). Não-admin → `/login?e=forbidden`. |

Constatações:
- **Mesmo projeto Supabase** para ERP e hub (migration `20261021115705_nature_code_commercial_hub.sql` está em `backend/supabase/migrations/` e `is_commercial_admin` está em `pdv-importados/lib/supabase/database.types.ts`). Logo, **um único cadastro de usuário** (auth.users) serve aos dois — não há duplicação de identidade.
- Papéis já existem e estão isolados no banco: cliente/equipe da loja = `public.usuarios.perfil` (RLS por loja/empresa); administrador da plataforma = `public.commercial_admins` (RLS `is_commercial_admin()`; tabela sem grant para `anon`/`authenticated`).
- O site já aponta para o login do ERP. O único elo faltante: um administrador da plataforma que entra por ali recebia "conta não vinculada".
- Domínios diferentes (ERP × hub) → não há sessão compartilhável por cookie sem mudar o escopo dos cookies do ERP (risco maior que o benefício).

## 2. Solução escolhida (mais simples e segura)

Ponto de entrada único = login do ERP (já é o destino do botão). Depois da senha:

1. Usuário com vínculo em `usuarios` → fluxo de sempre (cliente/equipe conforme perfil; middleware + RLS inalterados).
2. Sem vínculo **e** `rpc('is_commercial_admin') = true` **e** `NEXT_PUBLIC_HUB_URL` configurado → encerra a sessão do ERP e navega para `<hub>/login?origem=jinlong`, onde o hub autentica no próprio domínio (pede a senha de novo) e verifica o papel no servidor.
3. Caso contrário → erro de sempre.

Por que não SSO com token na URL: tokens em URL vazam em histórico, logs e `Referer`. Por que não cookie em `.jinlong.app`: mudaria o escopo da sessão do ERP inteiro. A senha confirmada uma segunda vez é o custo aceito; nenhum token sai do ERP.

Segurança/isolamento:
- A decisão de acesso continua **no servidor**: o redirecionamento do ERP é só conveniência; o hub revalida `is_commercial_admin` em toda página e ação, e a RLS protege as tabelas.
- `NEXT_PUBLIC_HUB_URL` aceita só origem `https` (ou `http://localhost`), sem caminho/query/hash — sem open redirect (testado).
- Nenhuma consulta a mais para clientes do ERP (a RPC só é chamada para quem não tem vínculo).
- Inerte enquanto a variável não existir: comportamento de produção idêntico ao atual.

## 3. Alterações

- `pdv-importados/lib/auth/painelPlataforma.ts` — `parseHubUrl` / `hubLoginUrl` (novo).
- `pdv-importados/app/login/LoginForm.tsx` — ramo "admin da plataforma sem loja" → hub.
- `hub/app/login/page.tsx` — aviso quando chega com `?origem=jinlong`.
- `pdv-importados/.env.example` — documenta `NEXT_PUBLIC_HUB_URL`.
- Testes: `lib/auth/painelPlataforma.test.ts`, `app/login/LoginForm.plataforma.behavior.test.tsx` (admin → hub; sem papel → erro; hub não configurado → inerte; gerente → `/admin/dashboard`; caixa → `/caixa`).

Nada no banco, no middleware, na RLS, no site ou nos domínios foi alterado.

## 4. Pendências (exigem autorização — nada foi feito)

1. Publicar o hub (projeto Vercel Hobby, Root Directory `hub`, env `HUB_SUPABASE_URL` / `HUB_SUPABASE_ANON_KEY`) e definir o domínio (ex.: subdomínio de `jinlong.app` — R$ 0).
2. Confirmar em produção que a migration do hub está aplicada e cadastrar o(s) admin(s): `insert into public.commercial_admins(user_id) values ('<uuid>');`.
3. No projeto Vercel do ERP: `NEXT_PUBLIC_HUB_URL=https://<domínio-do-hub>` e redeploy.
4. Decisão de produto: quem é **ao mesmo tempo** admin da plataforma e usuário de loja hoje cai no ERP (comportamento preservado); acessa o hub pelo endereço dele. Se preferir priorizar o hub ou oferecer um seletor, é uma mudança pequena no mesmo ramo.
5. "Equipe interna" da Nature Code com permissões além de admin (ex.: só leitura de leads) não existe no hub — hoje é binário (admin ou não). Criar papéis exigiria migration nova.
