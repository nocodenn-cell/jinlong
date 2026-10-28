# Próximos passos

## P0 — Quebrado/travado

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
- Aplicar na homologação (jinlong-homolog-palm) a migration 20261021120000_vendas_pagamentos_parcelas_credito (coluna vendas_pagamentos.parcelas) antes de exibir parcelas no detalhe admin e na 2ª via do cupom

## P2 — Melhoria

- Ativar hub.jinlong.app: merge do #632, primeiro deploy Production do hub e smoke (docs/runbooks/PUBLICACAO_HUB_JINLONG.md)
- Site Premium 2.0: configurar SITE_DEMO_SUPABASE_URL/ANON_KEY no Preview para homologar o formulário com gravação real
- Site Premium 2.0: revisão nativa do chinês antes de NEXT_PUBLIC_SITE_ZH_REVIEWED=true
- Ativar cobrança Asaas depois do primeiro ciclo manual (sandbox, depois produção com prova ponta a ponta: deploy asaas-webhook, secrets, cron de vencimentos)
- Fase fiscal Focus NFC-e antes do segundo cliente
- Contas a receber: pré-preencher o parcelamento do recebível de crédito a partir de vendas_pagamentos.parcelas (hoje é configuração manual)
- Mostrar as parcelas do crédito no detalhe da venda (admin) e na 2ª via, depois da coluna existir na homologação

## Feito

- 2026-10-23 — PDV web: seletor de parcelas do crédito mostra "3x de R$ 33,33 (última R$ 33,34)" em vez de "{n}x" e o cupom mostra "Crédito 3x" (PR pendente de revisão)
- 2026-10-23 — Hub preparado para hub.jinlong.app: domínio no projeto, env de Preview, isolamento e bloqueio de não-admin validados
- 2026-10-23 — Merge dos PRs #529, #624 e #631
- 2026-10-23 — Entrada única "Entrar no Jinlong": admin da plataforma sem loja vai do login do ERP ao painel gerencial (inerte até configurar o hub)
- 2026-10-23 — Site comercial Premium 2.0 implementado e mesclado (#631)
- 2026-10-22 — Análise de prontidão para cliente pagante e checklist de corte (docs/runbooks/CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md)
