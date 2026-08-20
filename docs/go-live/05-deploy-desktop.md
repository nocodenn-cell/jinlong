# 05 — Deploy do desktop (Tauri / `pdv-local`)

Voltar ao [plano](00-README.md).

---

## 1. Decisão que vem antes do deploy

> ## ❓ O primeiro cliente vai usar o PDV desktop?
>
> **Se a resposta for "não", pule este arquivo inteiro** — e três dos riscos mais sérios do sistema
> saem do caminho crítico, porque todos são exclusivos do fluxo offline.

Critério em [`docs/GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md`](../GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md).
Resumo: o desktop existe para lojas que precisam **vender sem internet**. Se a loja do primeiro
cliente tem conexão estável, o caminho web é o mais seguro hoje.

## 2. Riscos exclusivos do caminho offline

Todos do §11.5 do [relatório de certificação](../../GO_LIVE_CERTIFICATION_REPORT.md), classificados
como **TEÓRICOS** em §11.9 — reais no desenho, sem ocorrência comprovada:

| # | Risco | Efeito |
|---|---|---|
| 1 | **Estoque baixado fora da transação da RPC** | falha entre a RPC e a baixa deixa venda e estoque divergentes |
| 2 | **Venda offline sem `caixa_id`** | não resolve a loja, não recebe a âncora de catálogo de preço |
| 3 | **Faixa/promoção não validadas no offline** | `parseSingleVendaItem` descarta `tipo_preco` e promoção |

O item 3 tem mitigação parcial: as duas regras acrescentadas na remediação são tipo-independentes e
valem nos dois escritores. A validação completa de faixa segue exclusiva do caminho online.

> Os três dependem das migrations do Grupo B ([03](03-deploy-backend.md) §1.1) para estarem no
> estado descrito. Com produção no estado atual, o offline está **pior** que o documentado.

## 3. Pré-requisitos específicos

Variáveis em [01-pre-requisitos.md](01-pre-requisitos.md) §4.2.

```bash
npm run env:check -w pdv-local
```

> **`SYNC_KEY` é o ponto de falha histórico.** Divergência entre o `.env` do desktop e o secret da
> Edge `sync-outbox` foi a causa do NO-GO de 2026-07-31. Conferir antes de qualquer outra coisa.

## 4. Build

```bash
npm run typecheck -w pdv-local
npm run test      -w pdv-local
npm run build     -w pdv-local      # Vite (UI)
npm run tauri     -w pdv-local      # empacotamento Tauri
```

O `npm run build` da **raiz** não inclui o desktop — só o Next. Para tudo:

```bash
npm run build:all
```

## 5. Validação do sync

```bash
npm run smoke:sync-edge -w pdv-local
node backend/scripts/sync-outbox-contract-smoke.mjs
```

O segundo valida o contrato da Edge, incluindo a projeção `SALE_REGISTERED` no ledger. Registrado
como **PASS** em §8.7 do relatório.

## 6. Roteiro mínimo de aceitação no balcão

Fazer com o desktop instalado na máquina real do cliente, **antes** de vender de verdade:

1. Abrir caixa no desktop.
2. Venda simples com internet ativa → confirmar que aparece no painel web.
3. **Desligar a rede.** Fazer uma venda. Confirmar que grava localmente.
4. Religar a rede. Confirmar que o outbox sincroniza e a venda aparece no web.
5. Conferir o estoque do produto vendido nos dois lados.
6. Fechar o caixa e conferir o valor esperado em espécie.

O passo 5 é o que exercita o risco nº 1 da §2. Se estoque divergir, **pare** e trate como bloqueador.

## 7. Checklist de saída

- [ ] Decisão registrada: o cliente **usa** ou **não usa** o desktop
- [ ] (se usa) `SYNC_KEY` idêntica ao secret da Edge
- [ ] (se usa) `env:check`, `typecheck`, `test` verdes
- [ ] (se usa) build Tauri gerado e instalado na máquina real
- [ ] (se usa) `smoke:sync-edge` e smoke de contrato verdes
- [ ] (se usa) roteiro de aceitação §6 executado, incluindo o teste sem rede
- [ ] (se usa) riscos 1–3 comunicados e aceitos por escrito

→ Próximo: [06-validacao-pre-go-live.md](06-validacao-pre-go-live.md)
