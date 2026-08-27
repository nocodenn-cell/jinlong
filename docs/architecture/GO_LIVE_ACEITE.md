# Critérios de aceite — 1º cliente (War Room)

> **SUPERSEDED como gate de merge (2026-08-27).** Aceite do War Room 19/07.
> Baseline atual: [piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](../piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).

| Campo | Valor |
|--------|--------|
| **Modo** | War Room — só correção de P0 da homologação |
| **PR base** | [#220](https://github.com/nocodenn-cell/fastproduct/pull/220) |
| **Gate UI** | `/admin/implantacao` |
| **Regra de ouro** | Nenhum item pode ser marcado **PASS** sem evidência operacional |
| **UI** | `/admin/implantacao` — evidência obrigatória em CONCLUIDO; timeline; itens `execucao_1` / `execucao_2` |

## Modo War Room (obrigatório)

- Não implementar features novas.
- Não refatorar / não aumentar escopo.
- Melhorias e P2 **não** interrompem a homologação.
- A cada bug: reproduzir → causa raiz → classificar SLA → corrigir conforme SLA → teste de regressão (se P0) → validar → PR pequeno → atualizar log + matriz abaixo.

## SLA de classificação

| Classe | Definição | Ação |
|--------|-----------|------|
| **P0** | Impede operação do 1º cliente | Corrigir **imediatamente**; novo PR pequeno; **re-homologar** o cenário (e dependentes) |
| **P1** | Operação continua com workaround ou impacto limitado | Corrigir **antes do Go-Live definitivo**; não misturar com features |
| **P2** | Melhoria / cosmético / dívida | Registrar no backlog **pós-Go-Live**; não interrompe homologação |

## Regra de ouro — evidência

**Nenhum item pode ser marcado PASS sem evidência operacional.**

Evidência mínima aceita (combinar o que couber):

- ID de venda / documento / título / movimentação
- Print ou vídeo da tela crítica
- Log ou trecho de auditoria
- Conferência objetiva (ex.: estoque antes/depois)

### Exemplo de PASS auditável — Venda PIX

| Campo | Valor |
|-------|--------|
| Status | **PASS** |
| Responsável | João |
| Evidência | Venda `#8452` · PIX aprovado · Estoque −1 · AR criado (se aplicável) · Auditoria OK · print anexado |

Sem esses dados → permanece ☐ (não testado) ou FAIL.

## Matriz de aceite (mensurável)

Status: `PASS` / `FAIL` / `N/A` / ☐.  
FAIL exige: bug no log + severidade + PR (se P0).

| # | Cenário | Critério de PASS | Status | Evidência | Responsável |
|---|---------|------------------|--------|-----------|-------------|
| 1 | Login | DONO/GERENTE → `/admin/dashboard`; OPERADOR → `/caixa`; `ativo=false` bloqueia | ☐ | | |
| 2 | Abrir caixa | Sessão aberta; fundo registrado; UI permite vender | ☐ | | |
| 3 | Venda DINHEIRO | Finaliza; feedback OK; cupom limpa | ☐ | | |
| 4 | Venda PIX | Idem com PIX | ☐ | | |
| 5 | Venda cartão | Idem com cartão (formas da loja) | ☐ | | |
| 6 | Desconto | Autorizado; total coerente; finaliza | ☐ | | |
| 7 | Baixa de estoque | Saldo SKU cai pela qtd vendida | ☐ | | |
| 8 | Contas a receber | Título (se gerado) em `?tab=receber` e liquida | ☐ / N/A | | |
| 9 | Contas a pagar | Amostra NF-e: pagar e/ou cancelar | ☐ / N/A | | |
| 10 | Fiscal Stub | `NFC_E_STUB` na fila; UI sem erro | ☐ | | |
| 11 | Auditoria | Eventos visíveis em `/admin/auditoria` | ☐ | | |
| 12 | Cancelamento | GERENTE+; saldos revertem | ☐ | | |
| 13 | Devolução | `/admin/vendas`; saldos revertem | ☐ | | |
| 14 | Sangria / suprimento | Movimentação + gaveta coerente | ☐ | | |
| 15 | Fechar caixa | Conferência; não aceita nova venda | ☐ | | |
| 16 | Cadastro mínimo | Cliente + produto nas telas oficiais | ☐ | | |
| 17 | P0-DADOS | Validar dados → `homologacao.dados` CONCLUIDO | ☐ | | |
| 18 | Autorizar GO-LIVE | Obrigatórios CONCLUIDO; GO na UI | ☐ | | |

Itens 8–9: `N/A` só com justificativa na coluna Evidência (ex.: “venda 100% à vista — sem AR”).

## Critério para encerrar o War Room

**Não** encerrar só porque “pararam de aparecer bugs”.

Encerrar **somente** quando as três condições forem verdadeiras:

1. Todos os cenários obrigatórios = **PASS** (com evidência + responsável).
2. Nenhum **P0** aberto no log.
3. O roteiro completo executado **duas vezes consecutivas** sem intervenção técnica.

> Uma passagem pode passar por sorte; duas consecutivas reduzem falha intermitente.

### Registro das duas execuções

| Execução | Data | Responsável | Resultado | Notas |
|----------|------|-------------|-----------|-------|
| #1 | | | ☐ PASS / ☐ FAIL | |
| #2 (logo após #1, sem hotfix entre elas) | | | ☐ PASS / ☐ FAIL | |

Se a #2 falhar: corrigir P0 (se houver), zerar o contador e repetir duas limpas.

## Log de bugs da War Room

| Data | Cenário # | SLA | Causa raiz | Evidência | PR | Status |
|------|-----------|-----|------------|-----------|-----|--------|
| — | — | — | Aguardando achados da homologação | — | — | — |

## Como reportar um bug (para o agente)

1. Cenário #  
2. Esperado × obtido  
3. Loja / usuário / horário  
4. Evidência (ID / print / log)  
5. Passos de reprodução  
6. Sugestão de SLA (P0/P1/P2) — o agente confirma  

Protocolo: reproduzir → causa → SLA → só P0 no War Room → teste → PR pequeno → atualizar matriz + log.
