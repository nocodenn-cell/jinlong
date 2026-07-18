'use client'

import {
  registrarCadastroProdutoTelemetry,
  sugerirDadosCadastroPorGtin,
} from '@/app/gerente/produtos/sugestaoCadastroActions'
import type { SugestaoCadastroProduto } from '@/core/ports/gtinLookup'

export async function fetchSugestaoCadastro(
  codigo: string,
): Promise<SugestaoCadastroProduto | null> {
  const r = await sugerirDadosCadastroPorGtin(codigo)
  return r.ok ? r.data : null
}

export function emitCadastroDuration(input: {
  surface: 'pdv_relampago' | 'catalogo_form'
  openedAt: number
  knownSuggestion: boolean
  fonteSugestao: string | null
  gtin: string | null
  sucesso: boolean
}): void {
  const durationMs = Math.max(0, Math.round(Date.now() - input.openedAt))
  void registrarCadastroProdutoTelemetry({
    surface: input.surface,
    durationMs,
    knownSuggestion: input.knownSuggestion,
    fonteSugestao: input.fonteSugestao,
    gtin: input.gtin,
    sucesso: input.sucesso,
  }).catch(() => {
    /* telemetria best-effort — não quebra cadastro */
  })
}

export function fontesLabel(fontes: string[]): string {
  return fontes.filter((f) => f !== 'nenhuma').join(' · ') || '—'
}
