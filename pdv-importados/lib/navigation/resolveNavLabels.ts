import type { AdminV2NavItem } from '@/lib/navigation/adminV2SidebarNav'
import type { Mensagens } from '@/i18n/getMessages'

export type NavLabelsCtx = { admin: Mensagens['admin']; chineseLanguage: boolean }

/**
 * Rótulo de um item de navegação nos dois idiomas. Fonte única: sidebar e paleta de comandos
 * usam esta função, então um rótulo nunca diverge entre os dois.
 */
export function resolveNavLabels(
  item: AdminV2NavItem,
  { admin, chineseLanguage }: NavLabelsCtx,
): { primary: string; secondary: string; hintText: string } {
  const dictKey = item.dictKey
  const line = dictKey ? admin.nav[dictKey as keyof typeof admin.nav] : undefined
  const hint = dictKey ? admin.navHints[dictKey as keyof typeof admin.navHints] : undefined
  const ptLabel = item.labelOverridePt ?? item.labelPt ?? line?.pt ?? item.id
  const cnLabel = line?.cn ?? item.labelCn
  const primary = chineseLanguage && cnLabel ? cnLabel : ptLabel
  const secondary = chineseLanguage && cnLabel ? ptLabel : ''
  return { primary, secondary, hintText: item.hint ?? hint ?? '' }
}
