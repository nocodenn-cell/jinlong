// Onda C2.1/C2.2 (prontidão Focus NFe) — resolução de credencial multiempresa.
//
// loja_id -> fiscal_provider_config(loja_id, ambiente) -> token_env_var (gerado
// em 20260902130100_fiscal_provider_config.sql) -> Deno.env.get(token_env_var) ->
// token da empresa Focus.
//
// Fail closed em toda etapa (C2.1): configuração ausente, desabilitada, provider
// incompatível, secret ausente/vazio, ambiente inválido, loja_id ausente. Nunca
// cai silenciosamente para FISCAL_PROVIDER_TOKEN (mecanismo legado global usado
// só por mock/http/bling — inalterado). Nunca loga o valor do token — só o
// `token_env_var` (nome) e o código de erro, quando falha.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type FiscalAmbiente = "homologacao" | "producao";

export type FiscalCredentialErrorCode =
  | "FISCAL_AMBIENTE_INVALIDO"
  | "FISCAL_LOJA_ID_AUSENTE"
  | "FISCAL_CONFIG_AUSENTE"
  | "FISCAL_CONFIG_DESABILITADA"
  | "FISCAL_PROVIDER_INCOMPATIVEL"
  | "FISCAL_SECRET_AUSENTE"
  | "FISCAL_SECRET_VAZIO";

export type CredentialResolution =
  | { ok: true; token: string; ambiente: FiscalAmbiente }
  | { ok: false; code: FiscalCredentialErrorCode };

const AMBIENTES: readonly FiscalAmbiente[] = ["homologacao", "producao"];

export function resolveDeployAmbiente(raw: string | undefined | null): FiscalAmbiente | null {
  const v = (raw ?? "").trim().toLowerCase();
  return (AMBIENTES as readonly string[]).includes(v) ? (v as FiscalAmbiente) : null;
}

export function resolveFocusBaseUrl(ambiente: FiscalAmbiente): string {
  // C2.2: URLs fixas, confirmadas na documentação oficial da Focus — nunca lidas
  // de env var/payload/domínio, para impedir mistura acidental de ambiente.
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

/**
 * Resolve o token Focus real para `loja_id` no `ambiente` da implantação corrente.
 * Consome só metadados de `fiscal_provider_config` (nunca um secret armazenado em
 * tabela) + `Deno.env.get` para o valor real. Zero chamada HTTP acontece antes ou
 * depois desta função — ela só resolve a credencial, quem decide fazer a chamada é
 * o chamador, depois de checar `ok`.
 */
export async function resolveFocusCredential(
  supabase: SupabaseLike,
  lojaId: string | null | undefined,
  ambiente: FiscalAmbiente | null,
): Promise<CredentialResolution> {
  if (!ambiente) return { ok: false, code: "FISCAL_AMBIENTE_INVALIDO" };
  if (!lojaId || typeof lojaId !== "string" || lojaId.trim() === "") {
    return { ok: false, code: "FISCAL_LOJA_ID_AUSENTE" };
  }

  const { data, error } = await supabase
    .from("fiscal_provider_config")
    .select("provider_type, ambiente, token_env_var, habilitado")
    .eq("loja_id", lojaId)
    .eq("ambiente", ambiente)
    .maybeSingle();

  if (error || !data) return { ok: false, code: "FISCAL_CONFIG_AUSENTE" };
  if (!data.habilitado) return { ok: false, code: "FISCAL_CONFIG_DESABILITADA" };
  if (data.provider_type !== "focus") return { ok: false, code: "FISCAL_PROVIDER_INCOMPATIVEL" };

  const token = Deno.env.get(data.token_env_var);
  if (token === undefined) return { ok: false, code: "FISCAL_SECRET_AUSENTE" };
  if (token.trim() === "") return { ok: false, code: "FISCAL_SECRET_VAZIO" };

  return { ok: true, token, ambiente };
}
