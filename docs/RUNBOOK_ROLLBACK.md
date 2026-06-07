# Runbook — rollback operacional (fastproduct)

Documento de apoio à homologação e à demo. **Não** inclua credenciais, `service_role` nem URLs internas sensíveis neste arquivo.

## 1. Escopo

- **Banco (Supabase Postgres)**: migrations em `backend/supabase/migrations/` aplicadas com `supabase db push` ou pipeline equivalente.
- **App web**: `pdv-importados` (Next.js), variáveis em `.env.local` / secrets do host.
- **PDV desktop**: `pdv-local` (Tauri) — rollback costuma ser **versão do binário** + compatibilidade de schema; não duplicar aqui todo o fluxo.

## 2. Antes de mudar produção

- Confirmar **backup / PITR** habilitado no projeto Supabase (plano e configuração do painel).
- Registrar **qual migration** é a última “boa” e o **horário** do deploy.
- Anotar **feature flags** relevantes (ex.: `USE_UNIFIED_SALES_FLOW`, `STRICT_MANAGER_DISCOUNT_AUTH` em `pdv-importados`).

## 3. Rollback de aplicação (Next / Vercel / outro host)

Gatilhos típicos: falha em **sistema de risco** (`e2e-critical`, smoke manual) com regressão confirmada — não confundir com falha SSRA (`validate-production`), que invalida a identidade do deployment em prod. Ver [SSRA_RELEASE.md](./SSRA_RELEASE.md).

1. Vercel → projeto `pdv-importados` → **Promote to Production** no deployment estável anterior.
2. `npm run validate:production` — confirmar `deploymentId` alinhado (gate de decisão).
3. Garantir que **variáveis de ambiente** do build promovido estão preservadas.
4. Validar login, `/caixa` e uma venda de teste em **staging** antes de repetir em produção.

## 4. Rollback de banco (Postgres)

**Regra geral:** preferir **restore point-in-time (PITR)** do Supabase quando há erro de dados ou migration problemática em produção. “Reverter SQL na mão” só para mudanças pequenas e já ensaiadas.

1. No painel Supabase: **Database → Backups** (ou fluxo de restore da plataforma).
2. Se a equipe usa apenas CLI local: manter cópia do **schema remoto** (`supabase db dump`) em processo de release, sem commitar segredos.
3. **Não** rodar `DROP` agressivo em produção sem script revisado e backup confirmado.

### Migrations

- Novas migrations **não** devem ser apagadas do repositório; o caminho correto é **nova migration** que corrige o estado (forward-only).
- Em emergência extrema, o restore do backup substitui o estado inteiro do banco — alinhar com o **mesmo** commit da aplicação que aquele schema espera.

## 5. Edge Functions / workers

- Funções em `backend/supabase/functions/*`: rollback = **redeploy da versão anterior** no Dashboard ou CLI.
- Secrets (`FISCAL_WORKER_KEY`, etc.): rotação documentada à parte; não versionar valores.

## 6. Verificações pós-rollback

- Login Supabase Auth + linha em `public.usuarios`.
- Smoke SQL quando aplicável: `backend/supabase/scripts/smoke_rls_042_043_validacao.sql` (RLS/índices esperados após pacotes 042/043).
- Auditoria RLS: `backend/supabase/scripts/audit_rls_public_tables.sql`.

## 7. Referências internas ao repositório

- `docs/HOMOLOGACAO_PACOTE_032_036.md`
- `docs/CHECKLIST_UNIFICACAO_FLUXO_VENDAS.md`
- `docs/DONE_DEFINITION_PILOTO.md` (seção publicação/rollback)

## 8. Contatos

Preencher na sua organização (não versionar números pessoais reais se o repo for público):

- **Owner técnico:** …
- **Supabase / cloud:** …
