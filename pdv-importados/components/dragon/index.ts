// Dragon UI — Component Registry
// Importar sempre daqui, não dos subdiretórios diretos.
// Referência completa: docs/design-system/CANONICAL_COMPONENTS.md

// layout
export { DragonCard, DragonSection } from "./layout/dragon-card"
export { SectionLabel } from "./layout/section-label"

// feedback
export { DragonEmptyState } from "./feedback/dragon-empty-state"
export { DragonStatusBadge } from "./feedback/dragon-status-badge"
export type { DragonBadgeVariant } from "./feedback/dragon-status-badge"

// operational
export { DragonLoadingState, DragonFeedbackBanner, DragonDisabledSection } from "./operational/dragon-operational-states"
