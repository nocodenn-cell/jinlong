# Nature Code · Hub comercial

App Next.js **separado** (pasta `hub/`, projeto Vercel próprio), fora do ERP/PDV e do site público.
Leads de demonstração de **Jinlong** e **Venddi** (`product`), funil de status, histórico e lojas contratadas.

## Por que app separado (e não `/admin` no site)
- O site é público e cacheado; o hub é privado. Separar evita que rotas, cookies ou código admin entrem no bundle/domínio público.
- Deploy, domínio e variáveis próprios: um erro no hub não derruba o site, e vice-versa.
- Não importa nada do ERP/PDV (`pdv-importados`, `shared-core`) e só acessa tabelas `commercial_*` (testado).

## Segurança
- Login Supabase Auth (e-mail/senha) feito no **servidor** (server action); tokens só em cookies `httpOnly`, `SameSite=Strict`, `Secure`.
- Papel admin checado no servidor em toda página/ação via `rpc/is_commercial_admin` — a mesma função usada pela RLS.
- **Sem service role**: toda consulta vai com o JWT do usuário e passa pela RLS (só admins leem/alteram). anon só faz INSERT de lead.
- Variáveis apenas de servidor (sem prefixo público) → nada no bundle do navegador. `noindex`, `no-store`, `X-Frame-Options: DENY`.

## Rodar
```
HUB_DEMO_DATA=ficticio npm run build && HUB_DEMO_DATA=ficticio npm start   # dados FICTÍCIOS, sem banco
npm test                                                                   # unitários
PGURL=postgres://…/descartavel npm run test:rls                            # prova de RLS
```

## Para produção (requer autorização — nada disso foi feito)
1. Aplicar `supabase/20261021115705_nature_code_commercial_hub.sql` (copiar para `backend/supabase/migrations/` com label `deploy-prod:aprovado`, ou SQL editor).
2. Criar o usuário admin no Supabase Auth e: `insert into public.commercial_admins(user_id) values ('<uuid>');`
3. Criar projeto Vercel (Hobby, R$0) com Root Directory `hub` e env `HUB_SUPABASE_URL`, `HUB_SUPABASE_ANON_KEY`.
4. No projeto Vercel do site (`jinlong-site`): `SITE_DEMO_SUPABASE_URL`, `SITE_DEMO_SUPABASE_ANON_KEY`.
