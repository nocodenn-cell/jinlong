# Cobrança, planos e trial — setup

Sprint "vender o produto". Depende do multiempresa (PR #584). Migration aditiva
`backend/supabase/migrations/20261020100000_cobranca_planos_trial.sql`, rollback em
`backend/supabase/rollback/20261020100000_cobranca_planos_trial.rollback.sql`.

## 0. Arquitetura (separação e segurança)

- **Schema próprio `saas`** (planos, assinaturas, faturas, webhook_eventos, trial_tentativas, parametros,
  assinatura_auditoria). Separado do financeiro operacional dos lojistas (`contas_pagar`, `movimentos_financeiros`…).
  Não é exposto pela API REST; `anon`/`authenticated` não têm permissão em nenhuma tabela. Leitura do dono só por
  RPC (`fp_minha_assinatura`, `fp_minhas_faturas`, `planos_catalogo`), sempre filtrada pela empresa da sessão.
- **Direitos comerciais (entitlements) ≠ permissões de papel**: o plano diz O QUE a empresa contratou
  (`fp_recursos_empresa`, `lib/cobranca/planos.ts#temRecurso`); o papel (DONO/GERENTE/OPERADOR) continua dizendo QUEM pode.
- **Pagamento só é confirmado pelo servidor** (webhook com token + conciliação no Asaas). O retorno do navegador
  nunca muda status.
- **Falha do Asaas não suspende**: a suspensão por inadimplência exige fatura `VENCIDA` confirmada + carência.
  Aviso na tela/faixa antes (data prevista de suspensão).
- **Suspensão não apaga nada**: só liga `vendas_suspensas` (novas vendas bloqueadas); dados, documentos fiscais,
  relatórios e consultas continuam acessíveis.
- **Auditoria**: toda mudança em `saas.assinaturas` grava antes/depois, ator e origem (webhook/conciliação/sistema).
- **Parâmetros** (`saas.parametros`): `trial_dias` (15), `carencia_dias` (5), `aviso_dias_antes` (3), `trial_max_por_ip_24h` (3).

## 1. Preços (DECISÃO DO DONO DO PRODUTO)

Os preços ficam na tabela `saas.planos` (editável sem deploy). **Os valores semeados são PLACEHOLDER**
(`preco_placeholder = true`, a tela mostra o aviso "Preços provisórios"):

| Plano | Recursos | R$/loja/mês | Caixa adicional | Lojas |
|---|---|---|---|---|
| BASICO | pdv, estoque, caixa | 99,00 | 39,00 | 1 |
| ATACADO | + faixas_preco, financeiro, comissoes | 179,00 | 39,00 | 1 |
| REDE | + multi_loja, transferencias, painel_dono | 249,00 | 39,00 | ilimitado |
| FISCAL (add-on) | fiscal (NFC-e/NF-e) | 59,00 por loja | — | — |

Cada loja inclui 1 caixa. Para definir os preços reais:

```sql
UPDATE saas.planos SET preco_loja_centavos = 14900, preco_caixa_adicional_centavos = 2900,
  preco_placeholder = false, updated_at = now() WHERE codigo = 'BASICO';
```

Assinaturas já existentes só mudam de valor quando o dono trocar de plano (ou via script).

## 2. Asaas (sandbox primeiro)

1. Criar conta em https://sandbox.asaas.com (e depois a de produção).
2. Integrações → API: gerar a chave. Na Vercel (projeto web), **server-only**:
   - `ASAAS_API_KEY` = chave (sandbox começa com `$aact_hmlg_`).
   - `ASAAS_BASE_URL` = `https://api-sandbox.asaas.com/v3` (padrão) — produção: `https://api.asaas.com/v3`.
3. Integrações → Webhooks → novo webhook:
   - URL: `https://<projeto>.supabase.co/functions/v1/asaas-webhook`
   - Token de autenticação: gerar um valor aleatório longo (ex.: `openssl rand -hex 32`).
   - Eventos: Cobranças (PAYMENT_*) e Assinaturas (SUBSCRIPTION_DELETED). Fila: sequencial.
4. Supabase (secrets das edge functions): `ASAAS_WEBHOOK_TOKEN` = o mesmo token.
   Deploy: `supabase functions deploy asaas-webhook` (verify_jwt=false, a autenticação é o token).
   Opcional: `ASAAS_WEBHOOK_IP_ALLOWLIST` = IPs oficiais do Asaas (lista na documentação do Asaas), separados por vírgula.

Sem `ASAAS_API_KEY`, fora de produção o código usa um **mock em memória** (`lib/cobranca/asaas.ts`);
em produção sem chave ele falha explicitamente (nunca "cobra de mentira"). `ASAAS_MOCK=1` força o mock.

## 3. Job diário (conciliação + trial, carência, cancelamento)

A rota primeiro **concilia** (consulta no Asaas as cobranças de cada assinatura e aplica o status como evento idempotente `recon:<id>:<status>`, recuperando webhook perdido/fora de ordem) e depois processa os prazos.

`public.cobranca_processar_vencimentos()` — escolha UM:
- Vercel Cron → `GET /api/cobranca/vencimentos` com `CRON_SECRET` configurado (Vercel envia `Authorization: Bearer`).
  Adicionar em `pdv-importados/vercel.json`: `"crons": [{ "path": "/api/cobranca/vencimentos", "schedule": "0 9 * * *" }]` (09:00 UTC = 06:00 em São Paulo).
- ou pg_cron: `select cron.schedule('cobranca-diaria', '0 9 * * *', $$select public.cobranca_processar_vencimentos()$$);`

## 4. Trial self-service (`/teste-gratis`)

- Supabase Auth: **Confirm email ligado** (Authentication → Providers → Email) e SMTP próprio
  (o SMTP padrão do Supabase tem limite baixo). Adicionar `<APP_URL>/auth/callback` nas Redirect URLs.
- Anti-abuso: honeypot + 3 cadastros/IP/24h (hash com sal `TRIAL_HASH_SALT`) + bloqueio de e-mail descartável.
- CAPTCHA (placeholder pronto para Cloudflare Turnstile): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TRIAL_CAPTCHA_SECRET`.
  Sem o segredo o captcha fica desligado — **configurar antes de divulgar a página**.
  (Falta incluir o script do Turnstile na página quando a chave existir.)

## 5. Ciclo de status

`TRIAL` (15 dias) → dono assina em `/admin/assinatura` (1ª cobrança no fim do trial) → `PAYMENT_RECEIVED` ⇒ `ATIVA`.
Fatura vencida ⇒ `INADIMPLENTE`; após `carencia_dias` (5) ⇒ `SUSPENSA`: grava `vendas_suspensas=true` + motivo
na config da empresa (mesmo módulo de suspensão do gerente — caixa web e trigger de vendas bloqueiam).
Pagamento ⇒ `ATIVA` e devolve o valor anterior de `vendas_suspensas` (não desfaz suspensão manual).
Trial vencido sem assinatura ⇒ `SUSPENSA` (`TRIAL_EXPIRADO`) e o painel mostra a faixa "escolha um plano".
Cancelamento ⇒ `CANCELADA`, usa até o próximo vencimento, depois suspende.

Empresa **sem linha em `saas.assinaturas`** (cliente 1/piloto) = todos os recursos, sem cobrança, nada muda.

## 6. Gating por plano

- Banco: `fp_recursos_empresa(empresa)` / `fp_empresa_tem_recurso(empresa, recurso)`.
- Web: `/admin/financeiro`, `/admin/comissoes`, `/admin/estoque/transferencias` mostram "recurso não incluso" (`lib/cobranca/bloqueioPorPlano.tsx`).
- Sync (PDV ativado por código): sem recurso `pdv` não abre caixa novo; venda/fechamento/movimento já feitos offline são sempre aceitos.

## 7. CI

O token do bot não tem escopo `workflow`: aplicar `docs/cobranca/ci-workflows.patch` (`git apply`) para rodar `test:cobranca` no CI.

## 8. Limite de lojas

Trigger `tg_saas_limite_lojas` em `public.lojas` barra loja ativa além de `qtd_lojas` da assinatura
(`LOJA_LIMITE_PLANO`). Empresas sem assinatura (cliente 1) não têm limite.
