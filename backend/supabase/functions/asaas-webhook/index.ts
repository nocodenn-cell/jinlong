// Edge Function: asaas-webhook
// POST /functions/v1/asaas-webhook  (verify_jwt=false; autenticação pelo header asaas-access-token)
// Env: ASAAS_WEBHOOK_TOKEN (mesmo valor do "Token de autenticação" do webhook no painel Asaas),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injetadas pelo Supabase).
// Setup: docs/cobranca/SETUP_ASAAS.md
import { createClient } from "@supabase/supabase-js";
import { tratarWebhookAsaas } from "./handler.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  const r = await tratarWebhookAsaas({
    method: req.method,
    tokenHeader: req.headers.get("asaas-access-token"),
    tokenEsperado: Deno.env.get("ASAAS_WEBHOOK_TOKEN"),
    ipCliente: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ipAllowlist: Deno.env.get("ASAAS_WEBHOOK_IP_ALLOWLIST") ?? null,
    rawBody: req.method === "POST" ? await req.text() : "",
    aplicar: async (eventoId, evento, payload) => {
      const { data, error } = await supabase.rpc("cobranca_aplicar_evento", {
        p_evento_id: eventoId,
        p_evento: evento,
        p_payload: payload,
      });
      if (error) {
        console.error(JSON.stringify({ fn: "asaas-webhook", eventoId, evento, error: error.message }));
        throw new Error(error.message);
      }
      const d = (data ?? {}) as { duplicado?: boolean; resultado?: string | null };
      return { duplicado: Boolean(d.duplicado), resultado: d.resultado ?? null };
    },
  });
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
});
