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

### 3.1 Ordem canônica: `event_version` monotônico (não `created_at`)

O outbox é **single-origin**: eventos web **não** entram nele (o web escreve
síncrono via RPC). O único produtor é o dispositivo PDV local.

`created_at` **não** é fonte de ordem — é `datetime('now')` do SQLite (resolução
de SEGUNDOS) e o `id` do outbox é UUID; sob retry/rede/split de batch, ordenar
por timestamp seria heurística dependente de relógio.

A ordem canônica é **`event_version`**: uma **sequência inteira estritamente
monotônica por dispositivo**, atribuída na inserção do outbox local
(`event_version = MAX(event_version)+1`; linhas do outbox nunca são deletadas, e
os eventos de um caixa são inseridos em ordem causal ⇒ `event_version` é causal
por caixa). O cliente **drena por `event_version ASC`** (`db.rs
outbox_listar_pendentes`) e o envia no payload; o servidor **ordena por
`event_version ASC`** como chave primária. Isso torna a ordem **independente de
relógio, rede e split de batch** — inclusive **cross-batch** (batch N só contém
versões menores que batch N+1).

### 3.2 Travas determinísticas no `handlePostOutboxBatch`

1. **Ordenação canônica por `event_version ASC`.** Chave primária de sort. Sem
   `event_version` (cliente pré-migração) ou empate, cai no fallback
   determinístico: prioridade de tipo `CAIXA_ABERTO(0) < VENDA/MOVIMENTO(1) <
   CAIXA_FECHADO(2)`, depois `created_at`/`id` só de desempate. Entre
   vendas/movimentos a ordem relativa não afeta correção (o `valor_sistema` soma
   todos; baixas de estoque são idempotentes por venda).
2. **Serialização por caixa — stop-on-first-failure.** `caixaKeyOf(ev)` deriva a
   chave de caixa. Se um evento de um caixa falha, os **posteriores do mesmo
   caixa** no batch são **adiados** (`CAIXA_EVENTO_ANTERIOR_PENDENTE` → `failed`,
   sem chamar a RPC). Caixas distintos permanecem independentes.

Consequência: **`CAIXA_FECHADO` nunca é aplicado enquanto houver VENDA/MOVIMENTO
anterior (menor `event_version`) do mesmo caixa pendente.** Escolha conservadora:
nunca fechar dinheiro com lançamento faltante.

### 3.3 Ausência de deadlock

`failedCaixaIds` é um `Set` **local ao batch** (recriado a cada requisição): a
trava #2 bloqueia apenas o **restante do batch atual** daquele caixa — **nunca
batches futuros**. Um evento adiado/falho é reenviado com **backoff exponencial**
(`next_retry_at`, 15s→…→3600s) e, após `max` falhas consecutivas, vai para a
**DLQ** (`status='ERRO'`), saindo do drain PENDENTE — reprocessável manualmente.
Logo não há deadlock lógico: falha transitória de um evento isolado só adia o
próximo ciclo; falha permanente é quarentenada na DLQ, liberando a fila.

---

## Resumo executável

- ACK = handler retornou; retry = handler lançou. `o_ja_fechado=true`/`o_ja_aberto=true` retornam ⇒ ACK terminal.
- Idempotência mora na RPC (não no caller); FECHADO é terminal, não erro.
- Ordem canônica cross-batch: **`event_version` ASC** (sequência monotônica por dispositivo; cliente drena e servidor ordena por ela). `created_at` não participa da ordem. Fallback determinístico: `typePriority` (ABERTO<VENDA/MOVIMENTO<FECHADO).
- Serialização por caixa: stop-on-first-failure por `caixaKeyOf`.
- Sem deadlock: `failedCaixaIds` é local ao batch; falha transitória → backoff; falha permanente → DLQ.
- Segurança sobre completude: caixa com lançamento pendente **não fecha**.
