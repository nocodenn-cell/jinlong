import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Leituras do shell admin que o Dashboard também usa. Com `cache()` (por request),
 * layout e página — que renderizam em paralelo — compartilham UMA ida ao banco
 * em vez de repetir a mesma consulta.
 */

/** `pdv_config_flags_visuais` (flags visuais do painel). */
export const lerFlagsVisuaisPdv = cache(async () => {
  const supabase = await createClient()
  return supabase.rpc('pdv_config_flags_visuais')
})

/** Contagem de `v_estoque_baixo` (badge da sidebar + KPI do Dashboard). */
export const contarEstoqueBaixo = cache(async () => {
  const supabase = await createClient()
  return supabase.from('v_estoque_baixo').select('id', { count: 'exact', head: true })
})
