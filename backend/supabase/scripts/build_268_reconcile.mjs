import fs from 'node:fs'

const src = fs.readFileSync(
  'backend/supabase/migrations/24702_finalizar_venda_v4_contas_receber_automatico.sql',
  'utf8',
)
const marker = '-- Remove overload anterior (sem p_cliente_id) para PostgREST'
const start = src.indexOf(marker)
if (start < 0) throw new Error('marker not found')
const body = src.slice(start)

const out = `-- 268: Cycle 3 reconcile - single finalizar_venda_transacional_canonica_v4
-- Drops both overloads (return type change requires DROP), applies 24702 body with
-- cliente_id / FIADO / null-pagamentos fixes, grants + pgrst reload.

DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
);

${body}

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) TO service_role;
NOTIFY pgrst, 'reload schema';
`

fs.writeFileSync(
  'backend/supabase/migrations/268_reconcile_finalizar_venda_v4_single_overload.sql',
  out,
)
console.log('bytes', Buffer.byteLength(out))
console.log(out.slice(0, 550))
