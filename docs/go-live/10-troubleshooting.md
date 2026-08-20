# 10 — Troubleshooting

Voltar ao [plano](00-README.md). Diagnóstico e escalonamento:
[`ROLLBACK_HOTLINE_PLAYBOOK.md`](../../ROLLBACK_HOTLINE_PLAYBOOK.md).

---

## 1. Deploy e build

### `npm ci` falha por lockfile

`npm install` **não resolve** — mascara. O único caminho:

```bash
rm -rf node_modules package-lock.json
npm install
npm ci
```

### Build passa local e falha na Vercel

Quase sempre versão de Node. A Vercel usa **24.x**; o `engines` permite 20–24. Reproduza em 24 antes
de concluir que "funciona".

Segunda causa: editar o `vercel.json` da **raiz**, que não é o usado. O que vale é
`pdv-importados/vercel.json`.

### Mudei variável na Vercel e nada mudou

Deployment já construído não pega variável nova. **Redeploy é obrigatório.**

## 2. Health check e SSRA

### `/api/health` e a plataforma divergem no `deploymentId`

O tráfego não está no deployment publicado. Não prossiga: verifique se a promoção a produção
concluiu e se há alias apontando para deployment antigo.

### `gitSha` inesperado

Houve deploy não previsto. Identifique antes de qualquer outra ação.

## 3. Migrations

### `db push` falha no meio

O Supabase aplica em transação por migration. A que falhou não entrou; as anteriores sim.
**Não force**: leia o erro, corrija no repositório, valide com `db reset --local` e reaplique.

### Migration aparece aplicada mas o objeto não existe

Drift **tracking × catálogo** — já conhecido no projeto. Caso emblemático: a linha `252`
(`venda_finance_context_mirror`) consta como aplicada e os objetos nunca existiram.

> ⛔ **Não "reparar" o ledger.** `FASE_3_1` §4.1 proíbe, e a proibição segue válida. Ver
> [ADR-012](../adr/ADR-012-aposentadoria-venda-finance-context.md).

### Alguém pede para reaplicar `20260808130200`

**Não.** Aposentada. A convergência oficial é a tombstone `20260810222702`. Qualquer documento que
instrua reaplicação está superseded desde 2026-08-13 —
[reconciliação](../RECONCILIACAO_venda_finance_context_2026-08-13.md).

## 4. AR / AP / caixa

### `LIQUIDACAO_IDEMPOTENCY_KEY` ao registrar recebimento

**Sintoma clássico de banco novo com app antiga.** A chamada legada resolve para a nova função por
defaults e é rejeitada. Nada foi gravado — é falha fechada, por desenho (§11.6).

**Correção:** publicar a aplicação nova. Ver [07](07-go-live-day.md).

### PostgREST não encontra a função de 7 ou 9 argumentos

O inverso: **app nova com banco antigo**. Aplicar as migrations.

### Recebimento não aparece no caixa

Se as migrations do Grupo B **não** foram aplicadas, esse é o defeito FIN-298-01 — comportamento
esperado da versão antiga, não um bug novo. Confirme com `npx supabase migration list --linked`.

Se **foram** aplicadas: só forma `DINHEIRO` afeta a gaveta (DB-01). PIX e cartão entram no realizado
financeiro, não na espécie. Isso é a regra, não uma falha.

### Caixa esperado diverge do contado

`caixas.saldo_atual` é **cache**, não autoridade. A verdade é
`calcular_valor_sistema_dinheiro_caixa`. Divergência persistente entre os dois é sinal de writer
indevido — investigar, não "ajustar" o saldo.

### Venda concluída sem comissão

Sem o Grupo B: esperado (FIN-298-03) — o trigger é `AFTER UPDATE OF status` e as vendas nascem
`CONCLUIDA`.

Com o Grupo B: é **anomalia**. Verifique se existe regra de comissão para o funcionário e se
`custo_unitario_snap` foi gravado.

## 5. Sync do desktop

### Outbox não sincroniza

Ordem de verificação:

1. `SYNC_KEY` do `.env` idêntica ao secret da Edge — **causa histórica do NO-GO de 2026-07-31**
2. `SYNC_ENDPOINT` correto
3. `OUTBOX_MAX_SYNC_FAILURES` (12) atingido — o item para de tentar
4. Edge `sync-outbox` ACTIVE

```bash
npm run smoke:sync-edge -w pdv-local
node backend/scripts/sync-outbox-contract-smoke.mjs
```

### Venda offline sincronizou mas o estoque não bate

Risco conhecido: **o estoque é baixado pela Edge depois da RPC, fora da transação** (§11.5 item 3).
Falha entre os dois passos deixa venda e estoque divergentes.

Corrigir o estoque pelo **ajuste manual com kardex**, que deixa trilha. Nunca por `UPDATE` direto.

### Venda offline sem preço de faixa correto

Conhecido: o offline não valida faixa nem promoção (§11.5 item 1) e, sem `caixa_id`, não resolve a
loja (item 2). Exigir caixa aberto no desktop reduz a exposição.

## 6. Permissões e RLS

### "Permission denied" numa RPC

Verifique perfil, loja e se a operação exige token de gerente. Fonte:
[`docs/AUTHORIZATION_MATRIX.md`](../AUTHORIZATION_MATRIX.md).

Muitas RPCs são `SECURITY DEFINER` com guardas **internas** — o erro costuma vir da guarda, não do
grant. Ler a mensagem antes de mexer em grant.

### Gerente não vê dados de outra loja

**Correto.** DB-08: gerente atua somente na própria loja. Não contornar.

## 7. Fiscal

### Documento não é emitido

Fiscal é **stub**. Não há emissão real certificada. Ver [02](02-ambiente-producao.md) §5.

### Fila fiscal acumulando

Verificar `fiscal-worker` ACTIVE e `FISCAL_WORKER_KEY`. A DLQ (`documentos_fiscais_dlq`) recebe o que
falhou definitivamente. Existe reaper para itens presos em processamento.

## 8. Quando parar e escalar

Pare de mexer e escale imediatamente se:

- Dinheiro recebido não tem contrapartida rastreável
- Caixa fecha com divergência sem explicação
- Venda sumiu ou duplicou
- Estoque divergente sem lançamento correspondente
- Qualquer sinal de dupla contabilização

Nesses casos, **não tente corrigir por `UPDATE` direto no banco.** Toda correção financeira é
append-only e compensatória. Siga o
[playbook de hotline](../../ROLLBACK_HOTLINE_PLAYBOOK.md).

→ Fechamento: [CHECKLIST-FINAL.md](CHECKLIST-FINAL.md)
