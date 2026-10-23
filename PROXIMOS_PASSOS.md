# Próximos passos

## P0 — Quebrado/travado

- Aplicar em produção (janela manual, runbook) a migration 20261023120000 do #628, já na main; depois rodar `backend/scripts/advisor-seguranca-onda1.test.sql` e o advisor contra produção
- e2e-playwright falha em main (`gerente_senha_sha256` NOT NULL em `pdv_config`): corrigido pelo #625, que aguarda label/aplicação manual; afeta também #624
- Merge de #621 e #618 (migrations já aplicadas em produção, ausentes na main): CI corrigido em 2026-10-23, aguardam label `deploy-prod:aprovado`
- Reconciliar drift de migrations main × produção (20261021230000_pdv_operador_pin_p0, 20261022000000 e 20261022001000 em produção sem arquivo na main)
- Decidir módulos marcados DRAFT já aplicados em produção (comissão #607, import intelligence #601): validar ou esconder do cliente
- Congelar features até o corte do primeiro cliente (só hotfix P0 em produção)

## P1 — Falta para lançar (MVP)

- Corrigir view SECURITY DEFINER (Security Advisor ERROR) e ligar leaked password protection no Supabase Auth
- Definir preço real em saas.planos (hoje placeholder) e contrato de piloto sem NFC-e/SLA
- Revisar Termos e Privacidade (prometem emissão fiscal; fiscal é stub)
- Provisionar empresa/loja nova para o cliente pelo wizard e validar o isolamento multiempresa (nenhum dado de outra loja visível); não usar o script de limpeza, que apaga dados de todos os tenants
- Registrar restore drill com RTO a partir de um backup novo, tirado após a reconciliação de migrations
- Cobrar o primeiro ciclo manualmente (PIX/boleto)
- Smoke presencial na máquina da loja (docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md)
- Executar docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md

## P2 — Melhoria

- Dependabot: definir `CI_NEXT_PUBLIC_SUPABASE_ANON_KEY` nos secrets de Dependabot (#544, #547, #548, #549 falham sem ele)
- Dependabot #546 (Sentry 10→11, major): `withSentryConfig is not a function` em next.config.js — exige migração
- Dependabot #583 (grupo dev-minor-patch): lockfile regenerado quebra `@testing-library/react` e sobe pglite 0.3→0.5 — recriar/rebasear
- Ativar cobrança Asaas depois do primeiro ciclo manual (sandbox, depois produção com prova ponta a ponta: deploy asaas-webhook, secrets, cron de vencimentos)
- Fase fiscal Focus NFC-e antes do segundo cliente
- Advisor onda 3: auditar as SECURITY DEFINER executáveis por authenticated e criar guarda de CI para novas sem `auth.uid()`
- Corrigir fixture de `pr1b-kardex-imutavel.test.sql` (loja sem empresa → `LOJA_SEM_EMPRESA`) e check 30 de `verify_p0_producao.sql` (assinatura antiga da v4)
- Popular o homolog `jinlong-homolog-palm` (hoje vazio) para testar migrations antes de produção

## Feito

- 2026-10-23 — #621: migration de perfis com guarda para banco novo (Codex P1); #618: mock de rpc nos testes do productReader
- 2026-10-23 — PR #628 mergeado (8bbf5120) sem efeito em produção; revoke de `decrementar_estoque_seguro` para authenticated, diagnóstico alinhado e teste de regressão no CI
- 2026-10-22 — Análise de prontidão para cliente pagante e checklist de corte (docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md)
