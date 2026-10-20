import type { VinculoEmpresa } from '@/lib/multiempresa/selecionarEmpresa'

export type TopbarEmpresa = { empresaNome: string | null; podeTrocarEmpresa: boolean }

/**
 * Deriva o bloco "empresa ativa" da barra superior a partir dos vínculos já lidos.
 * Puramente visual: não decide acesso (isso é do edge/adminPolicy).
 */
export function resolverTopbarEmpresa(empresas: VinculoEmpresa[], empresaAtivaId: string | null): TopbarEmpresa {
  const ativa = empresaAtivaId
    ? empresas.find((e) => e.empresa_id === empresaAtivaId)
    : empresas.length === 1
      ? empresas[0]
      : undefined
  const nome = ativa?.nome?.trim() || null
  return { empresaNome: nome, podeTrocarEmpresa: empresas.length > 1 }
}
