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

## Central de Conversão (GROWTH-001) — `/conversao`
Acompanha quem se cadastrou pelo `/teste-gratis` do Jinlong: dados do dono, período de avaliação, uso do sistema
(só contagens), interesse, próximo contato, histórico e **conversão manual** em cliente pagante.
- **Toda contratação passa pelo dono da Nature Code.** A conversão exige justificativa + confirmação, valida plano/
  add-ons/limite de lojas em `saas.planos`, reativa as vendas de um teste expirado e grava na auditoria
  (`saas.assinatura_auditoria`, origem `hub_conversao_manual`). **Não cria cobrança, boleto, Pix nem assinatura no Asaas.**
- No ERP, o autoatendimento de `/admin/assinatura` fica desligado (só volta com `COBRANCA_AUTOATENDIMENTO=1`): o dono
  envia um **pedido de contratação**, que aparece aqui como prioridade.
- Prioridade (alta/média/baixa) = pedido de contratação + uso real + prazo do teste + interesse; os motivos aparecem na tela.
- Acesso ao ERP só por RPCs `commercial_*` (SECURITY DEFINER, exigem `is_commercial_admin()`); o hub segue sem service role
  e sem ler tabelas operacionais. Migration: `backend/supabase/migrations/20261101120000_growth001_central_conversao.sql`
  (rollback em `backend/supabase/rollback/`). **Ordem de deploy: migration antes do hub** (o hub passa a ler `origem`/`empresa_id` dos leads).
- LGPD: só contato do dono (nome, e-mail, telefone do cadastro) e indicadores agregados; nenhum valor de venda ou dado de cliente final.

## Rodar
```
HUB_DEMO_DATA=ficticio npm run build && HUB_DEMO_DATA=ficticio npm start   # dados FICTÍCIOS, sem banco
npm test                                                                   # unitários
PGURL=postgres://…/descartavel npm run test:rls                            # prova de RLS + Central de Conversão
```

## Para produção (requer autorização — nada disso foi feito)
1. Aplicar `supabase/20261021115705_nature_code_commercial_hub.sql` (copiar para `backend/supabase/migrations/` com label `deploy-prod:aprovado`, ou SQL editor).
2. Criar o usuário admin no Supabase Auth e: `insert into public.commercial_admins(user_id) values ('<uuid>');`
3. Criar projeto Vercel (Hobby, R$0) com Root Directory `hub` e env `HUB_SUPABASE_URL`, `HUB_SUPABASE_ANON_KEY`.
4. No projeto Vercel do site (`jinlong-site`): `SITE_DEMO_SUPABASE_URL`, `SITE_DEMO_SUPABASE_ANON_KEY`.
