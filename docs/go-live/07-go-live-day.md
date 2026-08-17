# 07 — O dia do Go-Live

Voltar ao [plano](00-README.md). Playbook de emergência:
[`ROLLBACK_HOTLINE_PLAYBOOK.md`](../../ROLLBACK_HOTLINE_PLAYBOOK.md).

---

## 1. A restrição que define o dia

> ## 🔴 `ROLLOUT INCOMPATÍVEL, FALHA FECHADA`
>
> Classificação do §11.6 do [relatório](../../GO_LIVE_CERTIFICATION_REPORT.md). Entre aplicar o banco
> e publicar a app existe uma **janela em que AR e AP não funcionam**. Não é bug — é a escolha
> deliberada de trocar disponibilidade por corretude num bloco financeiro, para nunca haver dois
> escritores financeiros ativos.
>
> **Consequência prática: fazer o deploy com a loja fechada.** Fora do horário de operação, sem
> caixa aberto, sem venda em curso.

O `overload` temporário das assinaturas foi avaliado e **descartado** — reintroduziria a janela de
dupla contabilização, que é o risco mais grave do bloco.

## 2. Papéis

Adaptar aos nomes reais antes de imprimir.

| Papel | Responsabilidade | Decide |
|---|---|---|
| **Responsável técnico** | migrations, Edge Functions, deploy web, health checks | abortar por falha técnica |
| **Responsável de negócio / dono** | autorização do GO, comunicação com o cliente | GO / NO-GO final |
| **Operador da loja** | roteiro de aceitação no balcão | reportar divergência |

Ninguém executa sozinho: todo passo de mutação em produção tem **quem executa** e **quem confere**.

## 3. Cronologia

### D-1 — véspera

| Quando | Passo | Onde |
|---|---|---|
| D-1 | Sequência de validação completa e verde | [06](06-validacao-pre-go-live.md) §1 |
| D-1 | Lacunas L1–L4 e L12 resolvidas ou aceitas por escrito | [06](06-validacao-pre-go-live.md) §7 |
| D-1 | Variáveis conferidas na Vercel | [04](04-deploy-frontend.md) §3 |
| D-1 | Confirmar janela com o cliente — **loja fechada** | — |
| D-1 | Confirmar que ninguém mais tem deploy pendente | — |

### D0 — janela de deploy (loja fechada)

| # | Passo | Comando / verificação | Aborta se |
|---|---|---|---|
| 1 | Confirmar nenhum caixa aberto | painel `/admin` | houver caixa aberto |
| 2 | **Backup do banco** | painel Supabase | backup falhar |
| 3 | Registrar SHA e `deploymentId` atuais | `curl .../api/health` | — |
| 4 | Conferir gates humanos | `cat backend/supabase/migration-human-gates.json` → `{"gates": []}` | houver qualquer gate |
| 5 | **Aplicar migrations** | `npx supabase db push --linked` | qualquer erro |
| 6 | Conferir ledger | `npx supabase migration list --linked` — as 30 versões | faltar alguma |
| 7 | **Publicar Edge Functions** | [03](03-deploy-backend.md) §7 | `check:edge` falhar |
| 8 | **Publicar app na Vercel** | [04](04-deploy-frontend.md) | build falhar |
| 9 | Promover a produção | painel Vercel | — |
| 10 | **SSRA** | `deploymentId` da plataforma === `/api/health` | divergirem |
| 11 | Conferir `gitSha` | bate com o commit publicado | divergir |
| 12 | Smokes | `smoke:http`, `test:e2e:post-deploy-smoke`, `smoke:rls-rest` | qualquer falha |

> **Passos 5 a 9 são a janela crítica.** Do início do 5 ao fim do 9, AR e AP estão indisponíveis.
> Manter a janela curta e não interrompê-la no meio.

### D0 — aceitação no balcão (ainda com a loja fechada)

> Roteiro detalhado dos passos de venda e sessão (com tempos e critérios de falha) em
> [06-validacao-pre-go-live.md](06-validacao-pre-go-live.md) §3.1 — os 7 smoke tests.

| # | Passo |
|---|---|
| 13 | Abrir caixa de teste |
| 14 | Venda simples à vista → conferir no painel |
| 15 | Venda com split de pagamento |
| 16 | Venda a prazo → gerar título em contas a receber |
| 17 | **Receber parcialmente o título → conferir efeito em caixa** (é o FIN-298-01 corrigido) |
| 18 | **Conferir que a venda gerou comissão** (FIN-298-03 corrigido) |
| 19 | Cancelar uma venda com recebimento parcial → conferir estorno (FIN-298-04) |
| 20 | Pagar uma conta a pagar em dinheiro → conferir sangria correlacionada (FIN-298-02) |
| 21 | Fechar o caixa → conferir valor esperado em espécie |
| 22 | (se desktop) roteiro offline — [05](05-deploy-desktop.md) §6 |

Passos 17–20 são a prova de que o Grupo B funcionou. **Se algum falhar, é NO-GO** — o motivo do
deploy era exatamente esse.

### D0 — autorização

| # | Passo |
|---|---|
| 23 | Responsável de negócio revisa os resultados |
| 24 | Registrar `go_autorizado = true` em `/admin/implantacao` para a loja do cliente |
| 25 | Comunicar liberação ao cliente |
| 26 | Abrir janela de acompanhamento — [08](08-pos-go-live.md) |

## 4. Rollback

### 4.1 A regra que não pode ser esquecida

> ⚠️ **Rollback só da aplicação recria o cenário "banco novo + app antiga" — falha fechada para toda
> a base.** AR e AP ficam indisponíveis para *todos* até o banco também voltar.
>
> Portanto: **nunca reverter só a app.** Ou volta tudo, ou não volta nada.

### 4.2 Decisão

| Sintoma | Ação |
|---|---|
| Falha no passo 5 ou 6 (migrations) | Banco não mudou de estado alvo → abortar, restaurar backup se necessário, **não** publicar a app |
| Falha nos passos 7–12 (Edge/app/health) | Reverter deployment na Vercel **e** avaliar rollback do banco em conjunto |
| Falha nos passos 17–20 (aceitação financeira) | **NO-GO.** Não autorizar. Reverter banco + app juntos |
| Falha só no desktop | Não é bloqueador do web — seguir sem o desktop ([05](05-deploy-desktop.md) §1) |

### 4.3 Rollback do banco

Cada migration do bloco tem **bloco `ROLLBACK` documentado no cabeçalho** (§11.6 do relatório).
Rollback financeiro **compensa, nunca deleta**: históricos criados não são apagados.

### 4.4 Contatos

Fluxo de diagnóstico e escalonamento em
[`ROLLBACK_HOTLINE_PLAYBOOK.md`](../../ROLLBACK_HOTLINE_PLAYBOOK.md).

## 5. Critério de sucesso do dia

Tudo abaixo verdadeiro:

- [ ] 30 migrations no ledger de produção
- [ ] 3 Edge Functions republicadas e ACTIVE
- [ ] SSRA verde — `deploymentId` idêntico
- [ ] `gitSha` corresponde ao commit publicado
- [ ] Passos 17–20 (AR, AP, comissão, cancelamento) comprovados no balcão
- [ ] Caixa fechado com valor esperado conferido
- [ ] `go_autorizado = true` registrado para a loja do cliente
- [ ] Janela de acompanhamento aberta

→ Próximo: [08-pos-go-live.md](08-pos-go-live.md)
