# 08 — Pós Go-Live: monitoramento, riscos e dívidas

Voltar ao [plano](00-README.md). Template base: [`monitoramento.md`](../../monitoramento.md).

---

## 1. Janela de acompanhamento

| Período | Cadência | Foco |
|---|---|---|
| **D0 (dia do GO)** | contínuo até o fechamento do caixa | reconciliação AR/AP e comissão |
| **D+1 a D+7** | diário, no fechamento | caixa esperado × contado; comissões do dia |
| **D+8 a D+30** | semanal | tendência, outbox, fila fiscal |

## 2. O que monitorar

### 2.1 Reconciliação financeira — a prioridade

É o que acabou de mudar. Todo dia, no fechamento:

| Verificação | Sinal de problema |
|---|---|
| Caixa esperado (`calcular_valor_sistema_dinheiro_caixa`) × contado | divergência sem justificativa |
| Toda venda `CONCLUIDA` do dia tem **exatamente uma** comissão | venda sem comissão, ou duplicada |
| Liquidação em dinheiro → efeito correlacionado em caixa | liquidação sem contrapartida |
| Pagamento AP em dinheiro → sangria correlacionada | pagamento sem saída |
| Cancelamento com recebimento prévio → compensação registrada | dinheiro sem estorno |

`caixas.saldo_atual` é **cache operacional**, não fonte de verdade. A autoridade do esperado em
espécie é `calcular_valor_sistema_dinheiro_caixa`
([ADR-caixa](../adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md)).

### 2.2 Ledger de vendas

Divergência entre `vendas` e `venda_eventos` indica projeção falhando. Lembrar que **admin lê
`vendas` e gerente/auditoria leem `venda_eventos`** — é o achado FIN-298-07, ainda aberto, e a razão
de KPIs poderem divergir entre telas.

### 2.3 Outbox do desktop

Se o cliente usa `pdv-local`: acompanhar falhas de sync. `OUTBOX_MAX_SYNC_FAILURES=12` é o teto antes
de o item parar de tentar.

### 2.4 Fila fiscal

`documentos_fiscais_pendentes` e a DLQ. Lembrando que o fiscal é **stub** — a fila anda, mas não há
emissão real certificada.

### 2.5 Health e deployment

```bash
curl -s https://pdv-importados.vercel.app/api/health
```

`gitSha` deve continuar correspondendo ao commit publicado. Mudança inesperada = deploy não previsto.

## 3. Riscos residuais em produção

### 3.1 Comprovados e fechados (com gate de regressão)

§11.9: escrita direta do contador de caixa, writer legado, venda offline em dinheiro, ADMIN
cross-loja em AR, acréscimo acima da tabela, desconto manual offline sem teto, retry offline,
diagnósticos cross-loja, colisão de chave AP, ausência de estorno AR/AP, tipos divergentes.

**Só valem em produção depois de aplicado o Grupo B** ([03](03-deploy-backend.md) §1.1).

### 3.2 Teóricos — reais no desenho, sem ocorrência comprovada

| Risco | Escopo | Mitigação disponível |
|---|---|---|
| Estoque offline fora da transação | desktop | não usar desktop, ou conferir estoque diariamente |
| Venda offline sem `caixa_id` sem âncora de catálogo | desktop | exigir caixa aberto no desktop |
| Faixa/promoção não validadas no offline | desktop | idem |
| `DELETE` em `caixas` concedido a `authenticated` | web | limitado por policy e FKs; caixa com movimento não é apagável |

### 3.3 Não comprovados

§11.9 lista explicitamente como **não comprovados**: estado remoto de produção após a remediação;
universo histórico e necessidade de repair; rollout real na Vercel com dois deployments; e
concorrência real entre processos distintos — as provas existentes rodam em transação única.

Ou seja: **o primeiro cliente pagante é, na prática, a primeira execução real desses cenários.**
Tratar as duas primeiras semanas como observação ativa, não como operação estável.

### 3.4 Abertos e conhecidos

| Item | Ref. |
|---|---|
| FIN-298-07 — KPIs de fontes diferentes entre telas | §8.6 |
| Telas financeiras (AR, AP, caixa, relatórios) não reconciliadas com o contrato líquido | §12.8 |
| Repair histórico de AR/AP legado (`idempotency_key IS NULL`) não executado | §11.5 item 4 |
| Reabertura de caixa sem implementação localizada | FIN-298-09 |
| `anon` em 2 RPCs `SECURITY DEFINER` | [02](02-ambiente-producao.md) §3.1 |
| `GL-DENO-LOCK` | [03](03-deploy-backend.md) §7.1 |

## 4. Repair histórico — não improvisar

Liquidações e pagamentos anteriores à remediação têm `idempotency_key IS NULL` e **não têm caixa
inferível**. O plano (§9.3) é explícito:

> **Backfill automático é proibido.** Repair somente com fonte externa ou turno comprovado, com
> chave determinística e `ON CONFLICT` para impedir dupla contabilização.

Diagnóstico read-only deve separar `SEM_CAIXA_COMPROVÁVEL`, `CAIXA_UNÍVOCO` e `AMBÍGUO` antes de
qualquer escrita. Contas com `valor_pago` diferente da soma do histórico devem ser **bloqueadas para
análise**, nunca corrigidas em silêncio.

## 5. Critério para declarar operação estável

Depois de **30 dias** com todos verdadeiros:

- [ ] Nenhuma divergência de caixa sem justificativa
- [ ] Nenhuma venda concluída sem comissão
- [ ] Nenhuma liquidação/pagamento sem contrapartida
- [ ] Outbox sem acúmulo (se desktop)
- [ ] Reauditoria independente do bloco AR/AP concluída (L2)
- [ ] Riscos teóricos §3.2 sem ocorrência real

→ Próximo: [09-primeiro-cliente.md](09-primeiro-cliente.md)
