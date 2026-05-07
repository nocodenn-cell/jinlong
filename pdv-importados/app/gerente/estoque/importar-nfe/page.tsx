import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ImportarNfePageClient } from './ImportarNfePageClient'

export default async function ImportarNfePage() {
  const supabase = await createClient()
  const { data: enabled } = await supabase.rpc('is_feature_enabled', {
    flag_name: 'importacao_xml',
  })
  if (!enabled) {
    notFound()
  }
  const { idioma } = await getUsuarioIdioma()
  return <ImportarNfePageClient idioma={idioma} />
}
