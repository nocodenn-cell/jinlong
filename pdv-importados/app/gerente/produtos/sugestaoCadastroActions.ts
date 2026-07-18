'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { avaliarMetaCadastroDuration } from '@/core/catalog/sugestaoCadastro'
import type { SugestaoCadastroProduto } from '@/core/ports/gtinLookup'
import { sugerirDadosCadastroPorGtinImpl } from '@/lib/adapters/gtin/sugerirDadosCadastro'

export type SugestaoCadastroResult =
  | { ok: true; data: SugestaoCadastroProduto }
  | { ok: false; error: string }

const GtinSchema = z.string().trim().min(3).max(64)

export async function sugerirDadosCadastroPorGtin(
  codigo: unknown,
): Promise<SugestaoCadastroResult> {
  const parsed = GtinSchema.safeParse(codigo)
  if (!parsed.success) {
    return { ok: false, error: 'Código inválido para sugestão.' }
  }

  const { userId, lojaId } = await getUsuarioAtual()
  if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

  const supabase = await createClient()
  const data = await sugerirDadosCadastroPorGtinImpl(
    supabase,
    lojaId ?? LOJA_MATRIZ_ID,
    parsed.data,
  )
  return { ok: true, data }
}

const TelemetrySchema = z.object({
  surface: z.enum(['pdv_relampago', 'catalogo_form']),
  durationMs: z.number().int().nonnegative().max(600_000),
  knownSuggestion: z.boolean(),
  fonteSugestao: z.string().max(80).nullable().optional(),
  gtin: z.string().max(32).nullable().optional(),
  sucesso: z.boolean(),
})

export type RegistrarCadastroTelemetryInput = z.infer<typeof TelemetrySchema>

export async function registrarCadastroProdutoTelemetry(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = TelemetrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Payload de telemetria inválido.' }

  const { userId, lojaId } = await getUsuarioAtual()
  if (!userId) return { ok: false, error: 'Sessão expirada.' }

  const meta = avaliarMetaCadastroDuration({
    durationMs: parsed.data.durationMs,
    knownSuggestion: parsed.data.knownSuggestion,
  })

  const supabase = await createClient()
  const { error } = await supabase.from('cadastro_produto_telemetry_events').insert({
    user_id: userId,
    loja_id: lojaId,
    event_name: 'cadastro_duration_ms',
    surface: parsed.data.surface,
    duration_ms: parsed.data.durationMs,
    known_suggestion: parsed.data.knownSuggestion,
    meta_ok: meta.metaOk && parsed.data.sucesso,
    fonte_sugestao: parsed.data.fonteSugestao ?? null,
    payload: {
      gtin: parsed.data.gtin ?? null,
      meta_ms: meta.metaMs,
      sucesso: parsed.data.sucesso,
    },
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
