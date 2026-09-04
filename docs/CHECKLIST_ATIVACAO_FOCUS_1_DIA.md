# Checklist — ativacao Focus NFe em 1 dia

Objetivo: ativar emissao fiscal real em janela curta (1 dia), com ordem exata de deploy, plano de rollback e testes de aceitacao.

Escopo: `backend` (migrations + Edge Function `fiscal-worker`) e `pdv-importados` (env + fluxo de venda/fila fiscal).

Referencias: [CHECKLIST_DEPLOY_SUPABASE.md](./CHECKLIST_DEPLOY_SUPABASE.md), [HOMOLOGACAO_PRODUCAO.md](./HOMOLOGACAO_PRODUCAO.md), [RUNBOOK_ROLLBACK.md](./RUNBOOK_ROLLBACK.md).

**Encaixe com o restante do monorepo:**

- **P0 / migrations / Edge base:** [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) (trilha T1–T12) — execute **antes** ou em paralelo com D-1; o remoto deve incluir `062_fiscal_enqueue_on_sale_rpc.sql` (RPC `fiscal_enfileirar_documento_venda`) e migrations fiscais posteriores exigidas pelo branch.
- **Critério “piloto fechado” + evidências:** [DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md) (§1.4 `fiscal-worker`, §4 decisão `mock` vs `http`, §7 em [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md)).
- **Pré-deploy web:** na pasta `pdv-importados`, com `AUTO_ENQUEUE_FISCAL_ON_SALE=true`, rode `npm run env:check` — valida `FISCAL_WORKER_*` e URL da Edge.

---

## Premissas de entrada (Go/No-Go inicial)

- [ ] Contrato comercial aprovado para emissao fiscal real.
- [ ] Token/API da Focus entregue e validado pelo cliente.
- [ ] Cadastro fiscal minimo disponivel (emitente, regime, serie, CSC/ambiente quando aplicavel).
- [ ] Janela de implantacao acordada (inicio/fim) com responsavel de negocio.
- [ ] Backup/PITR confirmado no projeto Supabase de producao.
- [ ] Ambiente homologacao passou smoke de fila fiscal sem erros criticos.

Se qualquer item acima falhar, status = **NO-GO**.

---

## Ordem exata de deploy (D-1 ate H+2)

## 1) D-1 — Preparacao tecnica (sem impacto ao operador)

- [ ] Confirmar branch/tag de release e congelar mudancas de escopo fiscal.
- [ ] Rodar `npx supabase migration list` e garantir remoto sem drift.
- [ ] Aplicar migration pendente no projeto alvo (`npx supabase db push`), incluindo a RPC de enfileiramento pos-venda (`062_fiscal_enqueue_on_sale_rpc.sql`).
- [ ] Validar que `fiscal-worker` esta deployado e saudavel no Supabase.
- [ ] Confirmar variaveis no host Next (`FISCAL_WORKER_ENDPOINT`, `FISCAL_WORKER_KEY`, `AUTO_ENQUEUE_FISCAL_ON_SALE`, `FISCAL_DEFAULT_DOC_TYPE`).
- [ ] Confirmar secrets da Edge `fiscal-worker`:
  - `FISCAL_WORKER_KEY`
  - `FISCAL_PROVIDER_TYPE`
  - `FISCAL_PROVIDER_URL`
  - `FISCAL_PROVIDER_TOKEN`
  - `FISCAL_PROVIDER_TIMEOUT_MS`

## 2) H-0 — Corte de ativacao

Executar exatamente nesta ordem:

1. [ ] Publicar secrets Focus no Supabase (`FISCAL_PROVIDER_URL`, `FISCAL_PROVIDER_TOKEN`) e manter sigilo fora do Git.
2. [ ] Alterar `FISCAL_PROVIDER_TYPE=http` na Edge `fiscal-worker`.
3. [ ] Publicar/redeploy da Edge Function `fiscal-worker`.
4. [ ] No `pdv-importados`, manter `AUTO_ENQUEUE_FISCAL_ON_SALE=true`.
5. [ ] Trocar `FISCAL_DEFAULT_DOC_TYPE` de `NFC_E_STUB` para `NFCE` (ou `NFE`, conforme operacao).
6. [ ] Fazer deploy do `pdv-importados`.
7. [ ] Executar smoke transacional com 1 venda real de baixo valor e validar retorno da fila.

## 3) H+1 a H+2 — Estabilizacao assistida

- [ ] Monitorar backlog de `documentos_fiscais_pendentes` por status.
- [ ] Confirmar taxa de sucesso de emissao e tempo medio de processamento.
- [ ] Tratar imediatamente qualquer erro recorrente (401/403/422/5xx).
- [ ] Encerrar janela so com criterios de aceitacao 100% atendidos.

---

## Configuracao alvo (producao)

## Edge Function `fiscal-worker`

- `FISCAL_PROVIDER_TYPE=http`
- `FISCAL_PROVIDER_URL=<endpoint Focus definido>`
- `FISCAL_PROVIDER_TOKEN=<token Focus valido>`
- `FISCAL_PROVIDER_TIMEOUT_MS=10000` (ajustar conforme SLA)
- `FISCAL_WORKER_KEY=<segredo compartilhado com web>`

## Web (`pdv-importados`)

- `FISCAL_WORKER_ENDPOINT=https://<ref>.supabase.co/functions/v1/fiscal-worker`
- `FISCAL_WORKER_KEY=<mesmo segredo da Edge>`
- `AUTO_ENQUEUE_FISCAL_ON_SALE=true`
- `FISCAL_DEFAULT_DOC_TYPE=NFCE` (ou `NFE` quando aplicavel)

---

## Testes de aceitacao (gate obrigatorio)

## A) Fluxo feliz (obrigatorio)

- [ ] Login operador, abrir caixa, registrar venda, finalizar venda.
- [ ] Venda entra na fila fiscal automaticamente.
- [ ] Worker processa documento e status muda para `EMITIDO`.
- [ ] Campos fiscais principais persistidos (`chave_fiscal`, `protocolo`, `emitido_em`).
- [ ] Painel gerencial continua operacional apos emissao.

## B) Resiliencia (obrigatorio)

- [ ] Simular indisponibilidade do provider (timeout/5xx) e verificar status `ERRO` com retentativa.
- [ ] Simular token invalido (401/403) e confirmar erro nao transitorio registrado.
- [ ] Reprocessar documento manualmente e confirmar retorno para `PENDENTE` e novo processamento.

## C) Nao regressao de negocio (obrigatorio)

- [ ] Fechamento de venda continua concluindo mesmo se emissao falhar.
- [ ] Estoque e financeiro permanecem consistentes apos venda emitida e venda com erro fiscal.
- [ ] Cancelamento de venda nao quebra fila fiscal existente (validar fluxo atual e registrar limitacao se houver).

---

## Plano de rollback (imediato, 15 minutos)

Objetivo: voltar para operacao sem emissao real, sem parar vendas.

Ordem de rollback:

1. [ ] Alterar Edge `FISCAL_PROVIDER_TYPE=mock`.
2. [ ] Redeploy da Edge `fiscal-worker`.
3. [ ] No `pdv-importados`, definir `FISCAL_DEFAULT_DOC_TYPE=NFC_E_STUB`.
4. [ ] Se necessario, manter `AUTO_ENQUEUE_FISCAL_ON_SALE=true` (fila segue ativa em stub).
5. [ ] Rodar venda de smoke para confirmar estabilidade operacional.
6. [ ] Abrir incidente com causa raiz e plano de correcao antes de nova tentativa.

Criticos de rollback:

- Acionar rollback se houver erro de emissao em lote por mais de 10 minutos.
- Acionar rollback se houver impacto no fechamento de venda no caixa.
- Acionar rollback se houver indicio de token/secrets comprometidos.

---

## Evidencias minimas para encerramento

- [ ] Log de deploy (horario, responsavel, versao).
- [ ] Print/registro dos checks de fila (antes/depois).
- [ ] Resultado dos testes A/B/C com status final.
- [ ] Decisao final registrada: GO ou ROLLBACK.

---

## Responsabilidades sugeridas

- **Tech lead:** coordena corte, GO/NO-GO e decisao de rollback.
- **Backend:** secrets, migrations e Edge Function.
- **Aplicacao web:** env/deploy do `pdv-importados`.
- **Operacao/negocio:** validacao funcional em caixa real.
- **Suporte:** monitoramento durante estabilizacao.
