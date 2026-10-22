# Checklist — corte do primeiro cliente pagante

> **Modelo de entrada:** piloto pagante acompanhado. Cobrança manual no 1.º ciclo, sem NFC-e pelo sistema e sem SLA formal.
> **Base:** análise de prontidão de 2026-10-21 (repositório `main` em `29362b1d` + leitura de produção `kbabmewnahysfvlybiak`).
> Cada item tem **responsável**, **evidência** e **data**. Item sem evidência não conta como feito.
> Evidências com PII ou segredo ficam **fora do Git** (anotar só o local: pasta do Drive, ID da venda, etc.).

**Cliente:** _______________ · **Loja (`lojas.id`):** _______________ · **Data do corte (D0):** _______________
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

Qualquer "não" → **não seguir com este checklist**; reavaliar o escopo (ex.: antecipar a fase fiscal Focus).

---

## 1. D-14 a D-7 — Governança de produção (bloqueante)

Motivo: em 2026-10-21, PRs marcados "DRAFT — não mergear" (#607 comissão, #601 demo importação) estavam na `main` **com migrations aplicadas em produção**, e produção tinha migrations ausentes da `main` (`20261021230000_pdv_operador_pin_p0`, `20261022000000_commercial_leads_landing_fields`, `20261022001000_commercial_leads_jinlong_wechat_idioma`).

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 1.1 | Reconciliar o drift de migrations: cada versão em produção tem arquivo na `main` e vice-versa (`npx supabase migration list` limpo) | saída do comando | | | ☐ |
| 1.2 | Decidir sobre os módulos DRAFT já aplicados (comissão P0–P2, import intelligence/nacional): manter e validar, ou desligar por feature flag/menu. Nenhum módulo não validado visível ao cliente | decisão registrada + print do menu do cliente | | | ☐ |
| 1.3 | **Congelar features** de D-7 até D+14: só hotfix P0 vai para a `main`/produção. Comunicar a quem faz merge (pessoas e sessões automatizadas) | mensagem/registro do freeze | | | ☐ |
| 1.4 | Definir o SHA candidato do corte e registrar `/api/health` → `gitSha` | SHA + print | | | ☐ |
| 1.5 | CI da `main` verde no SHA candidato: `build-and-test` + `validate-production` (SSRA). E2E crítico PASS ou falha classificada | links dos runs | | | ☐ |
| 1.6 | `npm run guard:all` verde no SHA candidato | log | | | ☐ |

---

## 2. D-7 — Segurança e dados

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 2.1 | Corrigir a view `SECURITY DEFINER` apontada pelo Security Advisor (nível ERROR) → `security_invoker = on`, via migration versionada | advisor sem ERROR | | | ☐ |
| 2.2 | Rever a função `SECURITY DEFINER` executável por `authenticated` (WARN): justificar ou revogar `EXECUTE` | nota/migration | | | ☐ |
| 2.3 | Ligar **Leaked password protection** (Supabase → Auth → Providers/Password) | print | | | ☐ |
| 2.4 | Teste de isolamento: com usuário da loja nova, nenhum dado da Matriz/demo aparece (produtos, vendas, clientes, relatórios, dashboard) | prints/IDs | | | ☐ |
| 2.5 | Dados de teste: **se o cliente usar a loja/empresa já existente**, executar `backend/scripts/limpeza-dados-teste-d0.sql` conforme `LIMPEZA_DADOS_TESTE_D0.md` (exige autorização do dono + backup restaurável antes). Se for loja nova, registrar "N/A — tenant novo" | log + autorização | | | ☐ |
| 2.6 | Backup: último `Backup automatico (item 19)` e `Backup freshness monitor` verdes (≤ 24h) | links dos runs | | | ☐ |
| 2.7 | Restore drill registrado ao menos uma vez (`docs/runbooks/BACKUP_RESTORE_CANONICO.md`), com tempo (RTO) anotado | log + RTO | | | ☐ |
| 2.8 | Sentry recebendo eventos de produção (disparar erro de teste controlado e ver no painel) | link do evento | | | ☐ |

---

## 3. D-5 — Comercial e jurídico

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 3.1 | Preço real definido (plano + caixa adicional) e atualizado em `saas.planos` com `preco_placeholder = false` (ver `docs/cobranca/SETUP_ASAAS.md` §1) | SQL executado | | | ☐ |
| 3.2 | Condição de piloto definida: desconto, prazo, o que está incluso, canal e horário de suporte | proposta assinada | | | ☐ |
| 3.3 | Revisar `docs/TERMOS_E_PRIVACIDADE.md` (v1.0, 27/05): remover/condicionar a promessa de "emissão de documentos fiscais"; confirmar papel Operadora/Controladora (LGPD) e razão social/CNPJ da operadora | nova versão publicada | | | ☐ |
| 3.4 | Contrato/aditivo de piloto com: sem NFC-e pelo sistema, sem SLA formal, política de backup (RPO/RTO reais, não metas), exportação de dados na saída | contrato assinado | | | ☐ |
| 3.5 | Forma de cobrança manual definida (PIX/boleto), com vencimento e responsável por conferir o pagamento | registro | | | ☐ |
| 3.6 | Assinatura do cliente registrada em `saas.assinaturas` com o plano correto (para os entitlements `fp_recursos_empresa` liberarem os módulos certos) | consulta `fp_minha_assinatura` | | | ☐ |

---

## 4. D-3 — Provisionamento da loja

Fluxo oficial: `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`.

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 4.1 | Loja + DONO criados pelo wizard `/admin/provisionamento` (nunca reutilizar `Matriz` `a0000001-…`) | `lojas.id` | | | ☐ |
| 4.2 | GERENTE/OPERADORES criados em `/admin/funcionarios` com e-mails reais | lista de perfis (sem senha) | | | ☐ |
| 4.3 | Redirect `https://<dominio>/auth/callback` configurado no Supabase Auth; `NEXT_PUBLIC_APP_URL` correto. Testar "esqueci a senha" de ponta a ponta | e-mail recebido | | | ☐ |
| 4.4 | Configurações da loja: formas de pagamento, limite de desconto, fechamento cego (se usar), idioma padrão, fuso | prints | | | ☐ |
| 4.5 | Catálogo importado (CSV admin) e conferido por amostragem: preço varejo, faixas de atacado, código de barras, estoque inicial | planilha de conferência | | | ☐ |
| 4.6 | Estoque inicial = contagem física (amostra de pelo menos 20 SKUs bate) | planilha | | | ☐ |
| 4.7 | Checklist em `/admin/implantacao` preenchido; item fiscal = **Stub** declarado | print | | | ☐ |

---

## 5. D-1 — Smoke presencial na máquina da loja

Executar `docs/runbooks/CHECKLIST_SMOKE_MAQUINA_LOJA.md` (16 itens) no PC/navegador real da loja, contra produção, com SKUs e caixa de teste combinados.

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 5.1 | Itens 1–16 do smoke: PASS ou falha classificada (rede/periférico/produto) | checklist assinado (fora do Git) | | | ☐ |
| 5.2 | Itens **[HW]** (leitor, teclado, PIX/cartão, impressora) PASS | fotos/IDs | | | ☐ |
| 5.3 | Navegador da loja testado nos dois idiomas (PT/中文); se for 360/QQ, seguir `docs/SMOKE_BROWSER_CHINES_360_QQ.md` | prints | | | ☐ |
| 5.4 | Vendas de teste canceladas pelo fluxo auditado; caixa de teste fechado | IDs | | | ☐ |
| 5.5 | Treinamento: operador (abrir caixa, vender, sangria, fechar) e gerente/dono (vendas, estoque, relatórios). Material: `MANUAL_OPERADOR_RESUMIDO.md` | lista de presença | | | ☐ |

---

## 6. D0 — Corte

| # | Item | Evidência | Resp. | Data | ☐ |
|---|------|-----------|-------|------|---|
| 6.1 | `/api/health` → `gitSha` = SHA candidato do item 1.4 | print | | | ☐ |
| 6.2 | Backup das últimas 24h confirmado antes de abrir a loja | link | | | ☐ |
| 6.3 | Presença ou chamada aberta com a loja na **abertura do 1.º caixa** | registro | | | ☐ |
| 6.4 | Primeira venda real conferida pelo gerente em `/admin/vendas` (total, pagamento, baixa de estoque) | ID da venda | | | ☐ |
| 6.5 | Fechamento do caixa no fim do dia conferido com o dinheiro físico (diferença explicada) | recibo de fechamento | | | ☐ |
| 6.6 | GO registrado em `/admin/implantacao` pelo DONO (`go_autorizado = true`) | print | | | ☐ |

### Critérios de NO-GO (qualquer um adia o corte)
- Venda não grava, estoque não baixa ou total diverge do esperado.
- Dados de outra loja visíveis para o cliente.
- Backup sem execução bem-sucedida nas últimas 24h.
- Leitor ou impressora sem funcionar e sem contorno aceito pelo cliente.
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
| 8.2 | Ativar cobrança automática Asaas (sandbox → produção): `ASAAS_API_KEY`/`ASAAS_BASE_URL` na Vercel, deploy de `asaas-webhook` (**não publicada em 2026-10-21**), `ASAAS_WEBHOOK_TOKEN`, cron `/api/cobranca/vencimentos` (ver `SETUP_ASAAS.md` §2–3) | fatura de teste paga em sandbox | | ☐ |
| 8.3 | Encerrar o freeze e voltar ao fluxo normal de releases, com PR "DRAFT" bloqueado de chegar à `main` | regra/guard ativo | | ☐ |
| 8.4 | Decidir a fase fiscal (Focus NFC-e: contrato, certificado A1, CSC, homologação SEFAZ; ver `docs/FISCAL_FOCUS_NFE_CONTRATO.md`) antes do 2.º cliente | decisão registrada | | ☐ |

---

**Assinaturas do GO**

Técnico: _______________ Data: ________ · Comercial: _______________ Data: ________ · Cliente (DONO): _______________ Data: ________
