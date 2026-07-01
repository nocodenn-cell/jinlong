# Contrato de Consistência — sync-outbox × Caixa (Fase 1)

Formaliza o processamento do `sync-outbox` para os eventos de caixa após a
unificação de writers (Fase 1). Objetivo: **at-least-once sem retry storm e sem
reprocessamento inconsistente**, mesmo com entrega duplicada ou fora de ordem.

Componentes de referência:
- Loop de batch: `backend/supabase/functions/sync-outbox/index.ts` → `handlePostOutboxBatch`.
- RPCs canônicas: `abrir_caixa_atomico`, `fechar_caixa_pdv_atomico` (migration `251_caixa_writer_unico.sql`; fechamento idempotente com `o_ja_fechado`).
- Trigger de imutabilidade: `trg_fn_vendas_caixa_aberto` (migration 206) — rejeita venda em caixa não-ABERTO.

O modelo de transporte é **at-least-once**: o cliente (PDV local) envia um batch
de eventos; o servidor responde `{ processed[], failed[] }`. **`processed` = ACK**
(o cliente remove o evento do outbox local). **`failed` = retry** (o cliente
reenvia no próximo batch). O servidor **não** reordena entre requisições — a
ordenação causal é garantida pelas regras abaixo.

---

## 1. Regra de tratamento do retorno da RPC no outbox

O handler de um evento **só lança exceção para erro recuperável**. Se a RPC
retorna sem erro, o handler retorna normalmente → o evento vai para `processed`
(**ACK definitivo**).

- **`o_ja_fechado = true` ⇒ ACK definitivo, nunca retry.** A RPC
  `fechar_caixa_pdv_atomico` detecta o caixa já FECHADO e **retorna** (sem
  `RAISE`) com `o_ja_fechado = true`. O handler `processCaixaFechado` não lança →
  o evento é ACKado. Não há segunda escrita.
- **`FECHADO` é estado TERMINAL, não erro recuperável.** Fechar um caixa já
  fechado é um no-op idempotente bem-sucedido — jamais um erro que dispara retry.
- Simetricamente na abertura: `abrir_caixa_atomico` com id já existente retorna
  `o_ja_aberto = true` (sem erro) → ACK. Replays de `CAIXA_ABERTO` são no-op.

Invariante: **um evento nunca é reprocessado com efeito colateral** — a segunda
aplicação é sempre um no-op idempotente que ainda assim resulta em ACK.

## 2. Classificação de erros da RPC de fechamento (e afins)

| Classe | Exemplos | Ação no outbox |
|---|---|---|
| **Sucesso / no-op idempotente** | fechamento normal (`o_ja_fechado=false`); **já FECHADO** (`o_ja_fechado=true`); abertura idempotente (`o_ja_aberto=true`) | `processed` → **ACK silencioso**. Sem log de erro, sem retry. |
| **Recuperável (ordenação/transitório)** | `FECHAR_CAIXA_PDV_NAO_ENCONTRADO` (abertura ainda não aplicada), `FECHAR_CAIXA_PDV_MOVIMENTACOES_PENDENTES` (movimento ainda não aplicado), erros transitórios de DB/rede | `failed` → **retry**. Resolve sozinho quando o evento anterior (abertura/movimento) chega. |
| **Permanente / poison** | payload inválido, `TIPO_DESCONHECIDO`, `VENDA_CAIXA_FECHADO` para uma venda genuinamente tardia | `failed` + `captureEdgeException` (Sentry). Retenta, mas **exige intervenção** — não se resolve sozinho. A regra de ordenação (§3) elimina o caso comum de `VENDA_CAIXA_FECHADO`. |

Nota: o servidor não pode "cancelar" o retry do cliente; a distinção
recuperável × permanente é semântica + observável (Sentry). O ganho concreto é
que a classe **no-op idempotente nunca cai em `failed`** — é a origem do retry
storm, e está fechada na própria RPC (§1).

## 3. Garantia de ordenação de eventos

Risco: se `CAIXA_FECHADO` for aplicado **antes** de uma `VENDA_REGISTRADA` ou
`MOVIMENTO_CAIXA` do mesmo caixa, o trigger 206 rejeita a venda tardia
(`VENDA_CAIXA_FECHADO`, poison) e o `valor_sistema` do fechamento fica incompleto.
Writers únicos não resolvem isso — é ordenação.

Duas travas determinísticas no `handlePostOutboxBatch` garantem ordem causal por
caixa sem sequencer global:

1. **Ordenação causal intra-batch por `created_at`.** O batch é ordenado por
   `created_at` (estável) antes do dispatch. Como os eventos offline são criados
   em ordem causal (`ABERTO → VENDAS/MOVIMENTOS → FECHADO`), a aplicação fica
   causal independentemente da ordem do array recebido.
2. **Serialização por caixa — stop-on-first-failure.** `caixaKeyOf(ev)` deriva a
   chave de caixa de cada evento. Se um evento de um caixa falha, todos os
   eventos **posteriores do mesmo caixa** no batch são **adiados**
   (`CAIXA_EVENTO_ANTERIOR_PENDENTE` → `failed`, sem chamar a RPC) e reprocessados
   no próximo batch, preservando a ordem. Caixas distintos permanecem independentes.

Consequência: **`CAIXA_FECHADO` nunca é aplicado enquanto houver uma
VENDA/MOVIMENTO anterior do mesmo caixa pendente.** Se uma venda falha de forma
permanente, o caixa **permanece ABERTO** (o fechamento fica adiado) — escolha
conservadora: nunca fechar dinheiro com lançamento faltante; o evento preso é
sinalizado no Sentry para intervenção. Idempotência (§1) cobre a duplicidade;
esta regra cobre a ordem.

---

## Resumo executável

- ACK = handler retornou; retry = handler lançou. `o_ja_fechado=true`/`o_ja_aberto=true` retornam ⇒ ACK terminal.
- Idempotência mora na RPC (não no caller); FECHADO é terminal, não erro.
- Ordem causal por caixa: sort por `created_at` + stop-on-first-failure por `caixaKeyOf`.
- Segurança sobre completude: caixa com lançamento pendente **não fecha**.
