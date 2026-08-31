/** Perfis autorizados a cancelar venda — alinhado a cancelar_venda_transacional. */
const PERFIS_CANCELAR_VENDA = new Set(['GERENTE', 'DONO', 'ADMIN'])

export function perfilPodeCancelarVenda(perfil: string | null | undefined): boolean {
  if (!perfil) return false
  return PERFIS_CANCELAR_VENDA.has(perfil)
}
