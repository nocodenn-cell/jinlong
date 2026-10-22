# Próximos passos

## P0 — Quebrado/travado

- Reconciliar drift de migrations main × produção (20261021230000_pdv_operador_pin_p0, 20261022000000 e 20261022001000 em produção sem arquivo na main)
- Decidir módulos marcados DRAFT já aplicados em produção (comissão #607, import intelligence #601): validar ou esconder do cliente
- Congelar features até o corte do primeiro cliente (só hotfix P0 em produção)

## P1 — Falta para lançar (MVP)

- Corrigir view SECURITY DEFINER (Security Advisor ERROR) e ligar leaked password protection no Supabase Auth
- Definir preço real em saas.planos (hoje placeholder) e contrato de piloto sem NFC-e/SLA
- Revisar Termos e Privacidade (prometem emissão fiscal; fiscal é stub)
- Registrar restore drill com RTO e limpar dados de teste se o cliente usar a loja existente
- Smoke presencial na máquina da loja (docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md)
- Executar docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md

## P2 — Melhoria

- Ativar cobrança Asaas em produção (deploy asaas-webhook, secrets, cron de vencimentos)
- Fase fiscal Focus NFC-e antes do segundo cliente

## Feito

- 2026-10-22 — Análise de prontidão para cliente pagante e checklist de corte (docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md)
