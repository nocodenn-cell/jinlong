# Próximos passos

## P0 — Quebrado/travado

- Fase 1: autorizar e executar a janela de 20261022020000 e 20261023120000 (roteiro pronto em ops/corte/janela-migrations-2026-10/ROTEIRO.md); depois reexecutar migration-remote-drift e fixar o SHA do corte
- Decidir módulos marcados DRAFT já aplicados em produção (comissão #607, import intelligence #601): validar ou esconder do cliente
- Congelar features até o corte do primeiro cliente (só hotfix P0 em produção)

## P1 — Falta para lançar (MVP)

- Ligar leaked password protection no Supabase Auth e confirmar o Security Advisor sem ERROR
- Definir preço real em saas.planos (hoje placeholder) e contrato de piloto sem NFC-e/SLA
- Revisar Termos e Privacidade (prometem emissão fiscal; fiscal é stub)
- Provisionar empresa/loja nova para o cliente pelo wizard e validar o isolamento multiempresa (nenhum dado de outra loja visível); não usar o script de limpeza, que apaga dados de todos os tenants
- Registrar restore drill com RTO a partir de um backup novo, tirado após a reconciliação de migrations
- Cobrar o primeiro ciclo manualmente (PIX/boleto)
- Smoke presencial na máquina da loja (docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md)
- Executar docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md

## P2 — Melhoria

- Site Premium 2.0: liberar push da branch feat/jinlong-premium-commercial-2 (gera 1 Preview protegido do jinlong-site) e abrir PR
- Site Premium 2.0: configurar SITE_DEMO_SUPABASE_URL/ANON_KEY no Preview para homologar o formulário com gravação real
- Site Premium 2.0: revisão nativa do chinês antes de NEXT_PUBLIC_SITE_ZH_REVIEWED=true
- Ativar cobrança Asaas depois do primeiro ciclo manual (sandbox, depois produção com prova ponta a ponta: deploy asaas-webhook, secrets, cron de vencimentos)
- Fase fiscal Focus NFC-e antes do segundo cliente

## Feito

- 2026-10-23 — Roteiro da janela de migrations preparado e ensaiado localmente (sem aplicar em produção)
- 2026-10-23 — PRs #618 e #621 mergeados na main: migrations já aplicadas em produção agora versionadas; view produtos_custos com security_invoker
- 2026-10-23 — Fase 1 preparada: drift main × produção mapeado e verificação somente leitura (ops/corte/CORTE.md)
- 2026-10-23 — Checklist de corte mergeado na main (PR #626, 8217acfc)
- 2026-10-23 — Site comercial Premium 2.0 implementado localmente (branch feat/jinlong-premium-commercial-2, sem push)
- 2026-10-22 — Análise de prontidão para cliente pagante e checklist de corte (docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md)
