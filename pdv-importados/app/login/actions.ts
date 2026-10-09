'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { normalizeIdioma, type Idioma } from '@/src/lib/idioma/normalizeIdioma'

/** Mesmo nome lido por `app/login/page.tsx` — fonte pré-autenticação do idioma. */
const IDIOMA_COOKIE = 'idioma_preferido'

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365

/**
 * Troca o idioma da tela de login antes da autenticação.
 * Grava o cookie que a página já lê; não toca no banco (o perfil continua
 * sendo a fonte após o login, via `usuarios.idioma_preferido`).
 */
export async function setIdiomaPreLoginAction(formData: FormData) {
  const idioma: Idioma = normalizeIdioma(formData.get('idioma'))

  const cookieStore = await cookies()
  cookieStore.set(IDIOMA_COOKIE, idioma, {
    path: '/',
    maxAge: UM_ANO_EM_SEGUNDOS,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })

  revalidatePath('/login')
}
