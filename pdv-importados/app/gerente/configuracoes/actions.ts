'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type ConfiguracaoGeralRow = {
  chave: string
  valor: string
  descricao: string | null
  tipo_dado: 'text' | 'integer' | 'percent' | 'money' | 'boolean'
}

export async function atualizarConfiguracao(
  input: { chave: string; valor: string },
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('configuracoes_gerais')
    .update({ valor: input.valor.trim() })
    .eq('chave', input.chave)
  if (error) return { success: false, error: mensagemErroComSecao('Configuração', error.message) }

  revalidatePath('/gerente/configuracoes')
  revalidatePath('/caixa')
  return { success: true }
}

export type LojaConfig = {
  id?: string
  nome: string
  cnpj: string
  inscricao_estadual: string | null
  telefone: string | null
  email: string | null
  logo_url: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
}

export type RegimeTributario = 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL' | 'MEI'

export type PdvConfig = {
  loja_id: string
  cfop_padrao: string
  cst_padrao: string
  regime_tributario: RegimeTributario
  auto_enqueue_fiscal: boolean
  idioma_padrao: 'pt' | 'zh'
  tema_padrao: 'noturno' | 'novem'
  imprimir_cupom_auto: boolean
  formato_impressao: 'TERMICA' | 'A4'
}

function validarLoja(d: LojaConfig): string | null {
  if (!d.nome || d.nome.trim().length < 2) return 'Nome da loja inválido.'
  const cnpjD = (d.cnpj ?? '').replace(/\D/g, '')
  if (cnpjD.length !== 14) return 'CNPJ deve ter 14 dígitos.'
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'E-mail inválido.'
  if (d.endereco_cep && (d.endereco_cep ?? '').replace(/\D/g, '').length !== 8)
    return 'CEP deve ter 8 dígitos.'
  return null
}

export async function atualizarDadosLojaAction(
  input: LojaConfig,
): Promise<{ ok: true; loja: LojaConfig } | { ok: false; error: string }> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { ok: false, error: auth.error }

  const err = validarLoja(input)
  if (err) return { ok: false, error: err }

  try {
    const supabase = await createClient()
    const payload = {
      nome: input.nome.trim(),
      cnpj: input.cnpj.replace(/\D/g, ''),
      inscricao_estadual: input.inscricao_estadual?.trim() || null,
      telefone: input.telefone?.replace(/\D/g, '') || null,
      email: input.email?.trim() || null,
      logo_url: input.logo_url?.trim() || null,
      endereco_logradouro: input.endereco_logradouro?.trim() || null,
      endereco_numero: input.endereco_numero?.trim() || null,
      endereco_complemento: input.endereco_complemento?.trim() || null,
      endereco_bairro: input.endereco_bairro?.trim() || null,
      endereco_cidade: input.endereco_cidade?.trim() || null,
      endereco_uf: input.endereco_uf?.trim() || null,
      endereco_cep: input.endereco_cep?.replace(/\D/g, '') || null,
    }

    const query = input.id
      ? supabase.from('lojas').update(payload).eq('id', input.id).select('*').single()
      : supabase.from('lojas').insert(payload).select('*').single()
    const { data, error } = await query
    if (error) return { ok: false, error: mensagemErroComSecao('Loja', error.message) }

    revalidatePath('/gerente/configuracoes')
    return { ok: true, loja: data as LojaConfig }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar dados da loja.' }
  }
}

export async function atualizarConfiguracoesPdvAction(
  input: PdvConfig,
): Promise<{ ok: true; config: PdvConfig } | { ok: false; error: string }> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!input.loja_id) return { ok: false, error: 'Loja obrigatória.' }

  // Validação de CST contra lista permitida (mais comuns no varejo)
  const cstsValidos = ['00','10','20','30','40','41','50','51','60','70','90']
  if (!cstsValidos.includes(input.cst_padrao)) {
    return { ok: false, error: `CST inválido. Use um de: ${cstsValidos.join(', ')}.` }
  }
  if (!/^\d{4}$/.test(input.cfop_padrao)) {
    return { ok: false, error: 'CFOP deve ter 4 dígitos.' }
  }

  try {
    const supabase = await createClient()
    const payload = {
      loja_id: input.loja_id,
      cfop_padrao: input.cfop_padrao,
      cst_padrao: input.cst_padrao,
      regime_tributario: input.regime_tributario,
      auto_enqueue_fiscal: input.auto_enqueue_fiscal,
      idioma_padrao: input.idioma_padrao,
      tema_padrao: input.tema_padrao,
      imprimir_cupom_auto: input.imprimir_cupom_auto,
      formato_impressao: input.formato_impressao,
    }

    // Upsert por loja_id
    const { data, error } = await supabase
      .from('pdv_config')
      .upsert(payload, { onConflict: 'loja_id' })
      .select('*')
      .single()
    if (error) return { ok: false, error: mensagemErroComSecao('Configurações', error.message) }

    revalidatePath('/gerente/configuracoes')
    return { ok: true, config: data as PdvConfig }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar configurações.' }
  }
}

/**
 * Upload do logo da loja para `produto-imagens` bucket (reutilizado).
 * Retorna a URL pública.
 */
export async function uploadLogoLojaAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { ok: false, error: auth.error }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Arquivo inválido.' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'Logo deve ter no máximo 2 MB.' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Envie uma imagem.' }

  try {
    const supabase = await createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `loja-logos/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('produto-imagens')
      .upload(path, file, { upsert: false })
    if (upErr) return { ok: false, error: mensagemErroComSecao('Upload', upErr.message) }

    const { data } = supabase.storage.from('produto-imagens').getPublicUrl(path)
    return { ok: true, url: data.publicUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro no upload do logo.' }
  }
}
