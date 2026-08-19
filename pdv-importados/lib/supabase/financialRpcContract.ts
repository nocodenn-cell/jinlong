/**
 * Gate de tipos das RPCs financeiras — P1-5.
 *
 * Problema: `receivableWriter.ts` e `payablePayment.ts` recebem
 * `SupabaseClient` sem o genérico `<Database>`, então `supabase.rpc()` aceita
 * qualquer nome e qualquer conjunto de argumentos. Com isso,
 * `database.types.ts` ficou declarando as assinaturas ANTIGAS de AR/AP
 * (4 e 5 argumentos, `Returns: undefined`) enquanto o banco já expunha as novas
 * (7 e 9 argumentos, `RETURNS TABLE`) — e `npm run typecheck` passava mesmo
 * assim. O PASS de typecheck registrado no SSOT não provava nada sobre o
 * contrato.
 *
 * Tipar o cliente compartilhado (`lib/supabase/server.ts`) propaga o genérico
 * por todo o app e produz 462 erros de inferência em telas não relacionadas —
 * refatoração global, fora do escopo desta remediação.
 *
 * Este arquivo é a alternativa mínima: um gate puramente de tipos, sem efeito
 * em runtime. Ele afirma, contra `database.types.ts`, exatamente o que os
 * adapters enviam e leem. Se os tipos gerados voltarem a divergir do banco, ou
 * se a assinatura da RPC mudar sem regeneração, `tsc --noEmit` falha aqui.
 *
 * Manutenção: ao alterar uma RPC financeira, regenere os tipos
 * (`npx supabase gen types typescript --local`) e ajuste este arquivo junto.
 */

import type { Database } from '@/lib/supabase/database.types'

type Fns = Database['public']['Functions']

/** Falha a compilação se `Actual` não contiver todas as chaves de `Expected`. */
type AssertHasKeys<Actual, Expected extends keyof Actual> = Expected

// ───────────────────────────────────────────────────────────────────────────
// AR — registrar_liquidacao_receber
// ───────────────────────────────────────────────────────────────────────────

type ArArgs = Fns['registrar_liquidacao_receber']['Args']

// Argumentos que `receivableWriter.ts` envia.
type _ArArgsEnviados = AssertHasKeys<
  ArArgs,
  | 'p_titulo_id'
  | 'p_valor'
  | 'p_forma_pagamento'
  | 'p_observacao'
  | 'p_idempotency_key'
  | 'p_caixa_id'
  | 'p_origem'
>

// A chave de idempotência é o coração do contrato da Fase 1A: se sumir dos
// tipos, o adapter voltou silenciosamente à assinatura pré-remediação.
type _ArExigeKey = ArArgs extends { p_idempotency_key?: string } ? true : never
const _arExigeKey: _ArExigeKey = true

type ArRow = Fns['registrar_liquidacao_receber']['Returns'] extends readonly (infer R)[]
  ? R
  : never

// Campos que o adapter lê da resposta.
type _ArRetorno = AssertHasKeys<ArRow, 'liquidacao_id' | 'idempotent_replay' | 'caixa_id'>

// `Returns: undefined` (o valor que estava versionado) não sobrevive aqui.
type _ArRetornaLinhas = ArRow extends never ? never : true
const _arRetornaLinhas: _ArRetornaLinhas = true

// ───────────────────────────────────────────────────────────────────────────
// AP — registrar_pagamento_contas_pagar
// ───────────────────────────────────────────────────────────────────────────

type ApArgs = Fns['registrar_pagamento_contas_pagar']['Args']

// Argumentos que `payablePayment.ts` envia.
type _ApArgsEnviados = AssertHasKeys<
  ApArgs,
  | 'p_conta_id'
  | 'p_valor'
  | 'p_forma'
  | 'p_data'
  | 'p_observacao'
  | 'p_idempotency_key'
  | 'p_caixa_id'
  | 'p_origem'
  | 'p_autorizacao_token'
>

type _ApExigeKey = ApArgs extends { p_idempotency_key?: string } ? true : never
const _apExigeKey: _ApExigeKey = true

type ApRow = Fns['registrar_pagamento_contas_pagar']['Returns'] extends readonly (infer R)[]
  ? R
  : never

// Campos que o adapter lê da resposta, incluindo a correlação 1:1 com a sangria.
type _ApRetorno = AssertHasKeys<
  ApRow,
  'pagamento_id' | 'idempotent_replay' | 'caixa_id' | 'movimentacao_caixa_id'
>

type _ApRetornaLinhas = ApRow extends never ? never : true
const _apRetornaLinhas: _ApRetornaLinhas = true

// ───────────────────────────────────────────────────────────────────────────
// Diagnósticos revogados de `authenticated` (P1-2) permanecem no schema, mas
// nenhum adapter de UI pode passar a consumi-los sem revisar a autorização.
// ───────────────────────────────────────────────────────────────────────────

export type FinancialRpcContract = {
  ar: { args: ArArgs; row: ArRow }
  ap: { args: ApArgs; row: ApRow }
}

// Mantém os `const` acima como uso real para o compilador, sem efeito colateral.
export const FINANCIAL_RPC_CONTRACT_CHECKED =
  _arExigeKey && _arRetornaLinhas && _apExigeKey && _apRetornaLinhas
