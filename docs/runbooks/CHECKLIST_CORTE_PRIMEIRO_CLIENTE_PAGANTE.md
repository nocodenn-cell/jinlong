# Checklist — corte do primeiro cliente pagante

> **Modelo de entrada:** piloto pagante acompanhado. Cobrança manual no 1.º ciclo, sem NFC-e pelo sistema e sem SLA formal.
> **Base:** análise de prontidão de 2026-10-21 (repositório `main` em `29362b1d` + leitura de produção `kbabmewnahysfvlybiak`).
> Cada item tem **responsável**, **evidência** e **data**. Item sem evidência não conta como feito.
> Evidências com PII ou segredo ficam **fora do Git** (anotar só o local: pasta do Drive, ID da venda, etc.).

**Cliente:** _______________ · **Empresa (`empresas.id`):** _______________ · **Loja (`lojas.id`):** _______________ · **Data do corte (D0):** _______________
**Responsável técnico:** _______________ · **Responsável comercial:** _______________

---

## 0. Pré-requisito: perfil do cliente (decidir antes de tudo)

O cliente só entra nesta modalidade se **todas** as respostas forem "sim".

| # | Pergunta | Sim/Não |
|---|----------|---------|
| 0.1 | A loja continua emitindo NFC-e/NF-e no emissor atual (o sistema **não** emite documento fiscal real; fiscal = stub, D0-09)? | ☐ |
| 0.2 | A loja opera pela **versão web** (`pdv-importados`)? O PDV desktop `pdv-local` fica fora deste corte. | ☐ |
| 0.3 | O cliente aceita, por escrito, a condição de piloto (sem SLA formal, suporte direto, feedback semanal)? | ☐ |
| 0.4 | O cliente aceita cobrança manual (PIX/boleto) no 1.º ciclo? | ☐ |
| 0.5 | Os periféricos da loja (leitor, impressora) podem ser testados presencialmente antes do D0? | ☐ |
| 0.6 | A loja opera no fuso `America/Sao_Paulo`? O fuso dos relatórios é **global** (`relatorio_settings.timezone` / `RELATORIO_TIMEZONE`), não por loja; loja em outro fuso fica fora deste piloto. | ☐ |
| 0.7 | O cliente será criado como **empresa/loja nova** (tenant próprio)? | ☐ |

Qualquer "não" → **não seguir com este checklist**; reavaliar o escopo (ex.: antecipar a fase fiscal Focus, ajustar o fuso por loja, criar um tenant novo).

---

## 1. D-14 a D-7 — Governança de produção (bloqueante)

Motivo: em 2026-10-21, PRs marcados "DRAFT — não mergear" (#607 comissão, #601 demo importação) estavam na `main` **com migrations aplicadas em produção**, e produção tinha migrations ausentes da `main` (`20261021230000_pdv_operador_pin_p0`, `20261022000000_commercial_leads_landing_fields`, `20261022001000_commercial_leads_jinlong_wechat_idioma`).

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 1.1 | Reconciliar o drift de migrations: cada versão em produção tem arquivo na `main` e vice-versa (`npx supabase migration list` limpo) | saída do comando | | | ☐ |
| 1.2 | Decidir sobre os módulos DRAFT já aplicados (comissão P0–P2, import intelligence/nacional): manter e validar, **ou** desligar na camada de autorização (entitlement do plano / licença de módulo / feature flag no servidor). Esconder do menu **não basta** | decisão registrada + teste com usuário do cliente: acesso direto às rotas e Server Actions desses módulos é **negado** | | | ☐ |
| 1.3 | **Congelar features** de D-7 até D+14: só hotfix P0 vai para a `main`/produção. Comunicar a quem faz merge (pessoas e sessões automatizadas) | mensagem/registro do freeze | | | ☐ |
| 1.4 | Definir o SHA candidato do corte e registrar `/api/health` → `gitSha` | SHA + print | | | ☐ |
| 1.5 | CI da `main` verde no SHA candidato: `build-and-test` + `validate-production` (SSRA). E2E crítico PASS ou falha classificada | links dos runs | | | ☐ |
| 1.6 | `npm run guard:all` verde no SHA candidato | log | | | ☐ |

---

## 2. D-7 — Segurança e dados

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 2.1 | Corrigir a view `SECURITY DEFINER` apontada pelo Security Advisor (nível ERROR; o nome está no painel) → `security_invoker = on`, via migration versionada | advisor sem ERROR | | | ☐ |
| 2.2 | Rever a função `SECURITY DEFINER` executável por `authenticated` (WARN): justificar ou revogar `EXECUTE` | nota/migration | | | ☐ |
| 2.3 | Ligar **Leaked password protection** (Supabase → Auth → Providers/Password) | print | | | ☐ |
| 2.4 | Teste de isolamento: com usuário da loja nova, nenhum dado da Matriz/demo aparece (produtos, vendas, clientes, relatórios, dashboard) | prints/IDs | | | ☐ |
| 2.5 | Dados de teste: **não executar** `backend/scripts/limpeza-dados-teste-d0.sql` para preparar o cliente. O script apaga as tabelas transacionais **do banco inteiro** (`DELETE FROM public.<tabela>` sem filtro de `loja_id`/`empresa_id`) e destruiria dados de todos os tenants. O cliente entra em tenant novo (item 0.7); o isolamento é provado no item 2.4 | registro "N/A — tenant novo" | | | ☐ |
| 2.6 | Backup: o último `Backup automatico (item 19)` terminou com sucesso **há no máximo 24h**, conferido pelo **horário do run** (o `Backup freshness monitor` usa `MAX_AGE_HOURS=25` e arredonda para baixo; ficar verde não prova 24h) | link + horário do run | | | ☐ |
| 2.7 | Restore drill (`docs/runbooks/BACKUP_RESTORE_CANONICO.md`) de um backup **novo**, tirado depois da reconciliação (1.1) e da migration de segurança (2.1), no SHA candidato. Drill antigo não vale. Anotar o tempo (RTO) | log + RTO + data do backup | | | ☐ |
| 2.8 | Sentry recebendo eventos de produção (disparar erro de teste controlado e ver no painel) | link do evento | | | ☐ |

---

## 3. D-5 — Comercial e jurídico

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 3.1 | Catálogo de planos pronto para venda: **toda** linha ativa de `saas.planos` (planos e add-on FISCAL) com preço real e `preco_placeholder = false`, **ou** desativada (ver `docs/cobranca/SETUP_ASAAS.md` §1). A assinatura não bloqueia preço placeholder; plano ativo com placeholder pode ser contratado pelo valor semeado | `SELECT codigo, ativo, preco_placeholder FROM saas.planos` sem linha ativa com placeholder | | | ☐ |
| 3.2 | Plano do piloto compatível com o gate de `/admin/implantacao`: se o checklist do gate exige itens de financeiro (recebimento, contas a pagar, dashboard), o plano precisa incluir `financeiro` (ex.: ATACADO). Com BASICO esses itens não podem ser concluídos e o GO fica bloqueado | plano escolhido + lista de obrigatórios do gate conferida | | | ☐ |
| 3.3 | Condição de piloto definida: desconto, prazo, o que está incluso, canal e horário de suporte | proposta assinada | | | ☐ |
| 3.4 | Revisar `docs/TERMOS_E_PRIVACIDADE.md` (v1.0, 27/05): remover/condicionar a promessa de "emissão de documentos fiscais"; confirmar papel Operadora/Controladora (LGPD) e razão social/CNPJ da operadora | nova versão publicada | | | ☐ |
| 3.5 | Contrato/aditivo de piloto com: sem NFC-e pelo sistema, sem SLA formal, política de backup (RPO/RTO reais, não metas), exportação de dados na saída | contrato assinado | | | ☐ |
| 3.6 | Forma de cobrança manual definida (PIX/boleto), com vencimento e responsável por conferir o pagamento | registro | | | ☐ |

---

## 4. D-3 — Provisionamento da loja

Fluxo oficial: `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`.

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 4.1 | Empresa + loja + DONO criados pelo wizard `/admin/provisionamento` (nunca reutilizar `Matriz` `a0000001-…`) | `empresas.id` + `lojas.id` | | | ☐ |
| 4.2 | Assinatura registrada em `saas.assinaturas` para a empresa criada em 4.1, com o plano do item 3.2 (os entitlements de `fp_recursos_empresa` liberam os módulos certos) | `fp_minha_assinatura` logado como DONO do cliente | | | ☐ |
| 4.3 | GERENTE/OPERADORES criados em `/admin/funcionarios` com e-mails reais | lista de perfis (sem senha) | | | ☐ |
| 4.4 | Redirect `https://<dominio>/auth/callback` configurado no Supabase Auth; `NEXT_PUBLIC_APP_URL` correto. Testar "esqueci a senha" de ponta a ponta | e-mail recebido | | | ☐ |
| 4.5 | Configurações da loja: formas de pagamento, limite de desconto, fechamento cego (se usar), idioma padrão. Fuso: conferir que o global está em `America/Sao_Paulo` (item 0.6) | prints | | | ☐ |
| 4.6 | Catálogo importado (CSV admin) e conferido por amostragem: preço varejo, faixas de atacado, código de barras. O CSV **não** carrega estoque: os produtos entram com estoque zero | planilha de conferência | | | ☐ |
| 4.7 | **Carga do estoque inicial** pela contagem física, via ajuste de estoque auditado (kardex) para todos os SKUs com saldo | relatório de ajustes / kardex | | | ☐ |
| 4.8 | Estoque no sistema = contagem física (amostra de pelo menos 20 SKUs bate) | planilha | | | ☐ |
| 4.9 | Checklist em `/admin/implantacao` preenchido; item fiscal = **Stub** declarado; todos os obrigatórios em `CONCLUIDO` | print | | | ☐ |

---

## 5. D-1 — Smoke presencial na máquina da loja

Executar `docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md` (16 itens) no PC/navegador real da loja, contra produção, com SKUs e caixa de teste combinados.

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 5.1 | Itens **críticos** do smoke PASS: 2 login, 5 rede, 8 venda dinheiro, 10 split (se usado), 11 suprimento/sangria, 12 cancelamento/devolução, 13 fechamento por forma, 16 recuperação de interrupção. Falha só é aceita com **contorno testado e aprovado por escrito pelo DONO**; sem isso = NO-GO | checklist assinado (fora do Git) | | | ☐ |
| 5.2 | Itens **[HW]** (6 leitor, 7 teclado, 9 PIX/cartão, 14 impressora) PASS, ou contorno testado e aprovado por escrito | fotos/IDs | | | ☐ |
| 5.3 | Demais itens (1, 3, 4, 15) PASS ou falha classificada (rede/periférico/produto) com ID e plano | checklist | | | ☐ |
| 5.4 | Navegador da loja testado nos dois idiomas (PT/中文); se for 360/QQ, seguir `docs/SMOKE_BROWSER_CHINES_360_QQ.md` | prints | | | ☐ |
| 5.5 | Vendas de teste canceladas pelo fluxo auditado; caixa de teste fechado | IDs | | | ☐ |
| 5.6 | Treinamento: operador (abrir caixa, vender, sangria, fechar) e gerente/dono (vendas, estoque, relatórios). Material: `MANUAL_OPERADOR_RESUMIDO.md` | lista de presença | | | ☐ |

---

## 6. D0 — Corte

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 6.1 | `/api/health` → `gitSha` = SHA candidato do item 1.4 | print | | | ☐ |
| 6.2 | Backup das últimas 24h confirmado pelo horário do run (como no item 2.6) antes de abrir a loja | link + horário | | | ☐ |
| 6.3 | **GO autorizado** em `/admin/implantacao` pelo DONO (`go_autorizado = true`) **antes** de qualquer operação real. Sem GO autorizado = NO-GO | print | | | ☐ |
| 6.4 | Presença ou chamada aberta com a loja na **abertura do 1.º caixa** | registro | | | ☐ |
| 6.5 | Primeira venda real conferida pelo gerente em `/admin/vendas` (total, pagamento, baixa de estoque) | ID da venda | | | ☐ |
| 6.6 | Fechamento do caixa no fim do dia conferido com o dinheiro físico (diferença explicada) | recibo de fechamento | | | ☐ |

### Critérios de NO-GO (qualquer um adia o corte)
- GO não autorizado em `/admin/implantacao` (item 6.3).
- Item crítico do smoke (5.1) ou [HW] (5.2) falhando sem contorno testado e aprovado por escrito.
- Venda não grava, estoque não baixa ou total diverge do esperado.
- Dados de outra loja visíveis para o cliente.
- Módulo DRAFT acessível por URL direta (item 1.2).
- Backup bem-sucedido há mais de 24h, ou restore drill do backup atual não executado (itens 2.6 e 2.7).
- Drift de migrations não reconciliado (item 1.1).

### Rollback
- Produto: rollback de deploy na Vercel para o deployment anterior (`docs/RUNBOOK_ROLLBACK.md`, `ROLLBACK_HOTLINE_PLAYBOOK.md`).
- Operação: a loja volta ao processo anterior (emissor/caixa atual) até a correção; vendas feitas no sistema seguem consultáveis.
- **Nunca** apagar linhas de vendas ou caixas em produção; cancelar pelo fluxo auditado.

---

## 7. D+1 a D+3 — War room

| # | Item | Resp. | ☐ |
|---|------|-------|---|
| 7.1 | Canal direto com a loja e tempo de resposta combinado (ex.: ≤ 30 min no horário comercial) | | ☐ |
| 7.2 | Revisão diária: Sentry, logs Vercel/Supabase, alertas, vendas × fechamento de caixa | | ☐ |
| 7.3 | Conferência diária de estoque por amostragem (5–10 SKUs vendidos) | | ☐ |
| 7.4 | Registro de cada incidente (sintoma, causa, correção, PR) | | ☐ |
| 7.5 | Feedback do operador e do dono ao fim do D+3 | | ☐ |

---

## 8. D+14 a D+30 — Saída do modo piloto

| # | Item | Evidência | Resp. | ☐ |
|---|------|-----------|-------|---|
| 8.1 | 1.º pagamento manual recebido e conferido | comprovante | | ☐ |
| 8.2 | Validar a cobrança Asaas em **sandbox** (`SETUP_ASAAS.md` §2): fatura de teste paga, webhook recebido, status conciliado | fatura sandbox paga | | ☐ |
| 8.3 | Ativar a cobrança Asaas em **produção**: `ASAAS_API_KEY`/`ASAAS_BASE_URL` de produção na Vercel, deploy de `asaas-webhook` (**não publicada em 2026-10-21**) com `ASAAS_WEBHOOK_TOKEN`, cron `/api/cobranca/vencimentos` (§3). Só marcar com prova ponta a ponta em produção: cobrança real de baixo valor criada, evento do webhook de produção registrado em `saas.webhook_eventos`, assinatura atualizada e um run autorizado de `/api/cobranca/vencimentos` com sucesso | IDs da cobrança/evento + log do run | | ☐ |
| 8.4 | Encerrar o freeze e voltar ao fluxo normal de releases, com PR "DRAFT" bloqueado de chegar à `main` | regra/guard ativo | | ☐ |
| 8.5 | Decidir a fase fiscal (Focus NFC-e: contrato, certificado A1, CSC, homologação SEFAZ; ver `docs/FISCAL_FOCUS_NFE_CONTRATO.md`) antes do 2.º cliente | decisão registrada | | ☐ |

---

**Assinaturas do GO**

Técnico: _______________ Data: ________ · Comercial: _______________ Data: ________ · Cliente (DONO): _______________ Data: ________
