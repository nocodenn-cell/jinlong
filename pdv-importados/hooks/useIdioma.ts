'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { normalizeIdioma } from '@/src/lib/idioma/normalizeIdioma'

export type PerfilUsuario = 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'
export type Idioma = 'pt' | 'en' | 'zh'

export function useIdioma() {
  const [idioma, setIdioma] = useState<Idioma>('pt')
  const [perfil, setPerfil] = useState<PerfilUsuario>('OPERADOR')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadUserData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setIdioma('pt')
          setPerfil('OPERADOR')
          return
        }

        const { data: usuario } = await supabase
          .from('usuarios')
          .select('perfil, idioma_preferido')
          .eq('id', user.id)
          .single()

        const perfilUsuario = (usuario?.perfil ?? 'OPERADOR') as PerfilUsuario
        setPerfil(perfilUsuario)
        setIdioma(normalizeIdioma(usuario?.idioma_preferido))
      } catch (error) {
        setIdioma('pt')
        setPerfil('OPERADOR')
      } finally {
        setIsLoading(false)
      }
    }

    loadUserData()
  }, [])

  return {
    idioma,
    perfil,
    isLoading,
  }
}

/** Inclui ADMIN (mesmo acesso de painel que gerente/dono no app; RLS em migração 044). */
export function isGerenteOuDono(perfil: PerfilUsuario): boolean {
  return isPerfilPainelGerencial(perfil)
}
