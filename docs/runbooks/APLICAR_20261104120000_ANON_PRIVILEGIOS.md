# Runbook — aplicação manual de `20261104120000` (privilégios mínimos do anon) em produção

Migration: `backend/supabase/migrations/20261104120000_sec_anon_privilegios_minimos.sql`
Script: `ops/aplicar_20261104120000.sql` (gerado do arquivo; não editar à mão)
Decisão do dono: lote de segurança, começando por esta migration (2026-11-05). Lote completo em `.github/deploy-governance/deferred-migrations.json`.

**Não executar sem a janela autorizada.** A aplicação é manual; a integração GitHub→Supabase não aplica no merge.

## O que muda

- Remove de `anon` os grants em tabelas e views de `public` (220 grants no total em 2026-11-05, em produção).
- Três views sem `security_invoker` (`v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias`) passam a respeitar o RLS.
- Sem alteração de dados.

## Achados de 2026-11-05 (produção, somente leitura)

| Item | Resultado |
|---|---|
| `20261104120000` no histórico | ausente |
| RPC `public.registrar_lead_comercial` | **não existe** em produção (a `20261104150000` a cria) |
| `anon` com INSERT em `commercial_leads` | **não** (já sem grant) |
| Grants de `anon` em tabelas de `public` | 220 |

Consequência: o formulário do site (`site/lib/demoRequest.ts`) chama a RPC com a chave `anon`. Se o site está publicado com esse código, **a captura de leads já não grava hoje**. Esta migration não piora isso, mas a `20261104150000` precisa vir junto para o formulário voltar a gravar. Verificar com o responsável se o site de produção usa esse código.

## Pré-requisitos (todos obrigatórios antes da janela)

1. **Confirmar o que `anon` ainda usa em produção.** Listar os acessos de `anon` nos logs da API (últimos 7 dias) e confirmar que nenhum fluxo legítimo depende dos grants que a migration remove. Sem essa confirmação, não há janela.
2. **Backup recuperável:** disparar `backup-scheduled.yml` e esperar `success`; anotar o `run_id`.
3. **Restore drill:** disparar `backup-restore-test.yml` com o artifact do passo 2 e esperar `success`. O último drill `success` no repositório é de 2026-10-29, anterior às migrations de 2026-11-04; por isso é preciso um novo.
4. **Validação em banco descartável:** a cadeia completa de migrations aplicada em PGlite (`backend/scripts/lib/pglite-full-schema.mjs`) sem erro em `20261104120000`. Resultado registrado na seção de validação abaixo.
5. Janela fora do horário de loja, com uma pessoa executando e a sessão aberta até o fim da pós-checagem.

## Aplicação

Colar `ops/aplicar_20261104120000.sql` inteiro no SQL Editor do Supabase (ou `psql -v ON_ERROR_STOP=1 -f ops/aplicar_20261104120000.sql`). Não usar `apply_migration` do MCP nem `supabase db push`.

## Pós-checagem (somente leitura)

```sql
SELECT
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261104120000') AS registrada,
  (SELECT count(*) FROM information_schema.table_privileges WHERE grantee = 'anon' AND table_schema = 'public') AS grants_anon_restantes;
```

Esperado: `registrada = true`. O número de grants de `anon` deve cair de 220 para o valor que a migration deixa.

## Critério de rollback

Qualquer `permission denied` em log da API, do PDV ou de Edge Function para um fluxo que usava `anon`. Rollback: `backend/supabase/rollback/20261104120000_sec_anon_privilegios_minimos.rollback.sql`. Antes da janela, testar esse rollback no banco descartável e confirmar que devolve os mesmos grants de `anon` de produção.

## Validação em banco descartável

_(preenchida após a execução do teste de cadeia completa)_
