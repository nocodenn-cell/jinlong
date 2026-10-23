# Próximos passos

## P0 — Quebrado/travado

- Fase 1: revisar e mergear #618 e #621 (migrations já aplicadas em produção, conteúdo idêntico); depois reexecutar migration-remote-drift e fixar o SHA do corte (ops/corte/CORTE.md)
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

- Ativar cobrança Asaas depois do primeiro ciclo manual (sandbox, depois produção com prova ponta a ponta: deploy asaas-webhook, secrets, cron de vencimentos)
- Fase fiscal Focus NFC-e antes do segundo cliente

## Feito

- 2026-10-23 — Fase 1 preparada: drift main × produção mapeado e verificação somente leitura (ops/corte/CORTE.md)
- 2026-10-23 — Checklist de corte mergeado na main (PR #626, 8217acfc)
- 2026-10-22 — Análise de prontidão para cliente pagante e checklist de corte (docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md)
